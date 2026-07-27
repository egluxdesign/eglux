// supabase/functions/manage-voucher/index.ts
// ============================================================================
// manage-voucher — CRUD untuk voucher codes
// ============================================================================
//
// Actions:
//   POST { action: "create", ...voucherData }    → create new voucher
//   POST { action: "list" }                      → list all vouchers
//   POST { action: "delete", voucher_id }        → delete voucher
//   POST { action: "toggle", voucher_id, is_active } → toggle active status
//
// Auth: requireAdmin (team_dev / master / admin)
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
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── CREATE ──
    if (action === "create") {
      const {
        name, code, start_at, end_at, channel,
        validity_type, validity_days,
        discount_type, discount_value, min_purchase, max_discount,
        quota_total, quota_per_user,
        applicable_type, applicable_product_ids,
      } = body;

      // Validation
      if (!name || !start_at || !end_at) {
        return json({ error: "name, start_at, end_at wajib diisi" }, 400);
      }
      if (!discount_type || discount_value === undefined) {
        return json({ error: "discount_type dan discount_value wajib diisi" }, 400);
      }
      if (discount_type === "percentage" && (discount_value < 0 || discount_value > 100)) {
        return json({ error: "Percentage harus 0-100" }, 400);
      }
      if (new Date(end_at) <= new Date(start_at)) {
        return json({ error: "end_at harus setelah start_at" }, 400);
      }

      // Auto-generate code kalau gak diisi
      let finalCode = code?.trim() || null;
      if (!finalCode) {
        finalCode = "EGLUX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      }

      const { data, error } = await supabase.from("vouchers").insert({
        name: name.trim(),
        code: finalCode,
        start_at, end_at,
        channel: channel || "all",
        validity_type: validity_type || "date_range",
        validity_days: validity_type === "days_after_claim" ? Number(validity_days) : null,
        discount_type,
        discount_value: Number(discount_value),
        min_purchase: Number(min_purchase) || 0,
        max_discount: max_discount ? Number(max_discount) : null,
        quota_total: quota_total ? Number(quota_total) : null,
        quota_per_user: Number(quota_per_user) || 1,
        applicable_type: applicable_type || "all",
        applicable_product_ids: applicable_product_ids || [],
        is_active: true,
        created_by: authResult.user?.id,
      }).select().single();

      if (error) {
        return json({ error: "Failed to create voucher", details: error.message }, 500);
      }

      return json({ success: true, voucher: data });
    }

    // ── LIST ──
    if (action === "list") {
      const { data, error } = await supabase
        .from("vouchers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, vouchers: data || [] });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { voucher_id } = body;
      if (!voucher_id) return json({ error: "voucher_id wajib diisi" }, 400);

      const { error } = await supabase.from("vouchers").delete().eq("id", voucher_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── TOGGLE ACTIVE ──
    if (action === "toggle") {
      const { voucher_id, is_active } = body;
      if (!voucher_id) return json({ error: "voucher_id wajib diisi" }, 400);

      const { error } = await supabase
        .from("vouchers")
        .update({ is_active: is_active, updated_at: new Date().toISOString() })
        .eq("id", voucher_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    console.error("[manage-voucher]", e);
    return json({ error: e.message }, 500);
  }
});
