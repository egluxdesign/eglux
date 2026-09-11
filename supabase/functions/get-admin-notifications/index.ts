// supabase/functions/get-admin-notifications/index.ts
// ============================================================================
// get-admin-notifications — Fetch all notifications for admin bell dropdown
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/get-admin-notifications
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: { action: 'list' | 'mark_read' | 'mark_all_read', notification_id? }
//
// Returns:
//   { success, notifications: [...], unread_count: N }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authResult.user!.id)
      .maybeSingle();

    if (!profile || !["team_dev", "master", "admin"].includes(profile.role)) {
      return json({ error: "Unauthorized — admin only" }, 403);
    }

    // ── MARK ALL READ ──
    if (action === "mark_all_read") {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("is_read", false);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, message: "All notifications marked as read" });
    }

    // ── MARK SINGLE READ ──
    if (action === "mark_read" && body.notification_id) {
      const { error } = await supabase
        .from("admin_notifications")
        .update({ is_read: true })
        .eq("id", body.notification_id);

      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── LIST (default) ──
    // Fetch last 30 notifications + unread count
    const { data: notifications, error: fetchErr } = await supabase
      .from("admin_notifications")
      .select("id, type, severity, title, description, link, metadata, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (fetchErr) return json({ error: fetchErr.message }, 500);

    // Get unread count
    const { count: unreadCount } = await supabase
      .from("admin_notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false);

    // Format: add icon + color per type
    const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
      order:   { icon: "🛒", color: "blue" },
      review:  { icon: "⭐", color: "amber" },
      return:  { icon: "↩️", color: "orange" },
      alert:   { icon: "⚠️", color: "red" },
    };

    const formatted = (notifications || []).map(n => {
      const cfg = TYPE_CONFIG[n.type] || { icon: "🔔", color: "gray" };
      return {
        ...n,
        icon: cfg.icon,
        color: cfg.color,
      };
    });

    return json({
      success: true,
      notifications: formatted,
      unread_count: unreadCount || 0,
    });
  } catch (e) {
    console.error("[get-admin-notifications] Error:", e);
    return json({ error: e.message }, 500);
  }
});