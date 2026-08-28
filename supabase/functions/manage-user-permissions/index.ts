// supabase/functions/manage-user-permissions/index.ts
// ============================================================================
// manage-user-permissions — Admin manage user roles + permissions + audit log
// ============================================================================
//
// Actions:
//   1. list_users        — Get all admin/master users with permissions
//   2. search_user       — Search ANY registered user by email (for promote)
//   3. promote_user      — Directly update role + permissions (no email invite)
//   4. update_permissions — Update admin_permissions JSONB + insert audit log
//   5. reset_permissions — Reset to role default (set admin_permissions = NULL)
//   6. demote_user       — Demote admin/master back to 'verified'
//   7. get_audit_log     — Get permissions audit trail
//
// Auth: team_dev + master only
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const t0 = Date.now();
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;
    const adminUser = authResult.user!;
    const adminEmail = adminUser.email || "unknown";
    const tAuth = Date.now();
    console.log(`[manage-perm] auth: ${tAuth - t0}ms (${adminEmail})`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action } = body;

    switch (action) {

      // ── LIST USERS (admin/master only — for User List tab) ──
      case "list_users": {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, role, admin_permissions, created_at, updated_at")
          .in("role", ["team_dev", "master", "admin"])
          .order("role", { ascending: true })
          .order("full_name", { ascending: true });

        console.log(`[manage-perm] list_users query: ${Date.now() - tAuth}ms (${(data || []).length} rows, total ${Date.now() - t0}ms)`);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true, users: data || [] });
      }

      // ── SEARCH USER (any registered user by email — for Promote tab) ──
      case "search_user": {
        const { email } = body;
        if (!email) return json({ error: "email is required" }, 400);

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, role, admin_permissions, created_at")
          .eq("email", email.trim().toLowerCase())
          .maybeSingle();

        if (error) return json({ error: error.message }, 500);
        if (!profile) return json({ success: true, found: false }, 200);

        return json({
          success: true,
          found: true,
          user: {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone,
            role: profile.role,
            admin_permissions: profile.admin_permissions,
            is_protected: profile.role === "team_dev" || profile.role === "master",
          },
        });
      }

      // ── PROMOTE USER — directly change role + permissions ──
      // No email invitation needed. Only works on existing registered users.
      case "promote_user": {
        const { target_user_id, role, permissions } = body;
        if (!target_user_id) return json({ error: "target_user_id is required" }, 400);
        if (!["admin", "master"].includes(role)) {
          return json({ error: "Role target harus admin atau master" }, 400);
        }

        // Ambil profile target (pakai service_role supaya bypass RLS)
        const { data: targetProfile, error: targetErr } = await supabase
          .from("profiles")
          .select("id, email, role, full_name")
          .eq("id", target_user_id)
          .maybeSingle();

        if (targetErr) return json({ error: targetErr.message }, 500);
        if (!targetProfile) return json({ error: "User tidak ditemukan" }, 404);

        // Safety: gak boleh promote ke team_dev (god mode, hanya via DB)
        // Safety: gak boleh ubah role team_dev/master existing
        if (targetProfile.role === "team_dev" || targetProfile.role === "master") {
          return json({ error: `User ${targetProfile.email} sudah ${targetProfile.role} (tidak bisa diubah)` }, 403);
        }

        const oldRole = targetProfile.role || "verified";
        const newPermissions = role === "admin" ? (permissions || null) : null;

        // Atomic update: role + admin_permissions in 1 query
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({
            role,
            admin_permissions: newPermissions,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target_user_id);

        if (updateErr) return json({ error: "Gagal promote user", details: updateErr.message }, 500);

        // Audit log — log sebagai 'promote' (role change)
        await supabase.from("permissions_audit_log").insert({
          target_user_id,
          target_user_email: targetProfile.email,
          changed_by_id: adminUser.id,
          changed_by_email: adminEmail,
          page: "role",
          old_value: null,
          new_value: null,
          action: "promote",
        });

        console.log(`[manage-permissions] ✓ Promoted ${targetProfile.email} ${oldRole} → ${role} by ${adminEmail}`);

        return json({
          success: true,
          message: `${targetProfile.email || "User"} berhasil di-promote ke ${role}`,
          user: {
            id: target_user_id,
            email: targetProfile.email,
            old_role: oldRole,
            new_role: role,
          },
        });
      }

      // ── DEMOTE USER — revert admin/master back to verified ──
      case "demote_user": {
        const { target_user_id } = body;
        if (!target_user_id) return json({ error: "target_user_id is required" }, 400);

        const { data: targetProfile, error: targetErr } = await supabase
          .from("profiles")
          .select("id, email, role, full_name")
          .eq("id", target_user_id)
          .maybeSingle();

        if (targetErr) return json({ error: targetErr.message }, 500);
        if (!targetProfile) return json({ error: "User tidak ditemukan" }, 404);
        if (targetProfile.role === "team_dev" || targetProfile.role === "master") {
          return json({ error: `User ${targetProfile.email} adalah ${targetProfile.role} (tidak bisa di-demote)` }, 403);
        }
        if (targetProfile.role !== "admin") {
          return json({ error: `User ${targetProfile.email} bukan admin (role: ${targetProfile.role})` }, 400);
        }

        const { error: updateErr } = await supabase
          .from("profiles")
          .update({
            role: "verified",
            admin_permissions: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", target_user_id);

        if (updateErr) return json({ error: "Gagal demote user" }, 500);

        await supabase.from("permissions_audit_log").insert({
          target_user_id,
          target_user_email: targetProfile.email,
          changed_by_id: adminUser.id,
          changed_by_email: adminEmail,
          page: "role",
          old_value: null,
          new_value: null,
          action: "demote",
        });

        console.log(`[manage-permissions] ✓ Demoted ${targetProfile.email} admin → verified by ${adminEmail}`);
        return json({
          success: true,
          message: `${targetProfile.email} berhasil di-demote ke verified`,
        });
      }

      // ── UPDATE PERMISSIONS (for existing admin user, no role change) ──
      case "update_permissions": {
        const { target_user_id, permissions } = body;
        if (!target_user_id || !permissions) {
          return json({ error: "target_user_id and permissions are required" }, 400);
        }

        // Cek target user role — gak bisa ubah team_dev/master
        const { data: targetProfile } = await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", target_user_id)
          .maybeSingle();

        if (!targetProfile) return json({ error: "User tidak ditemukan" }, 404);
        if (targetProfile.role === "team_dev" || targetProfile.role === "master") {
          return json({ error: "Tidak bisa mengubah permissions team_dev/master (full access)" }, 403);
        }

        // Update admin_permissions
        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ admin_permissions: permissions, updated_at: new Date().toISOString() })
          .eq("id", target_user_id);

        if (updateErr) return json({ error: "Gagal update permissions", details: updateErr.message }, 500);

        // Insert audit log untuk setiap perubahan
        const auditEntries = Object.entries(permissions).map(([page, value]) => ({
          target_user_id,
          target_user_email: targetProfile.email,
          changed_by_id: adminUser.id,
          changed_by_email: adminEmail,
          page,
          new_value: value === true,
          action: value === true ? "grant" : "revoke",
        }));

        await supabase.from("permissions_audit_log").insert(auditEntries);

        console.log(`[manage-permissions] ✓ Updated permissions for ${targetProfile.email} by ${adminEmail}`);
        return json({ success: true, message: "Permissions berhasil diupdate" });
      }

      // ── RESET PERMISSIONS ──
      case "reset_permissions": {
        const { target_user_id } = body;
        if (!target_user_id) return json({ error: "target_user_id is required" }, 400);

        const { data: targetProfile } = await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", target_user_id)
          .maybeSingle();

        if (!targetProfile) return json({ error: "User tidak ditemukan" }, 404);

        const { error: updateErr } = await supabase
          .from("profiles")
          .update({ admin_permissions: null, updated_at: new Date().toISOString() })
          .eq("id", target_user_id);

        if (updateErr) return json({ error: "Gagal reset permissions" }, 500);

        // Audit log
        await supabase.from("permissions_audit_log").insert({
          target_user_id,
          target_user_email: targetProfile.email,
          changed_by_id: adminUser.id,
          changed_by_email: adminEmail,
          page: "all",
          action: "reset",
        });

        return json({ success: true, message: "Permissions direset ke default role" });
      }

      // ── GET AUDIT LOG ──
      case "get_audit_log": {
        const { data, error } = await supabase
          .from("permissions_audit_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) return json({ error: error.message }, 500);
        return json({ success: true, logs: data || [] });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[manage-user-permissions] Error:", e);
    return json({ error: e.message }, 500);
  }
});
