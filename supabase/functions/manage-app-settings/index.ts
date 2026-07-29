// supabase/functions/manage-app-settings/index.ts
// ============================================================================
// manage-app-settings — Admin endpoint untuk update app_settings
// ============================================================================
//
// Auth: requireAdmin (team_dev / master / admin only)
//
// Cara panggil:
//   POST /functions/v1/manage-app-settings
//   Headers:
//     Authorization: Bearer <user-jwt>
//   Body: {
//     tax_enabled?: boolean,    // true = tax aktif, false = tax dimatikan
//     tax_percent?: number     // 0-100 (default 3.00)
//   }
//
// Response:
//   { success: true, settings: { id, tax_enabled, tax_percent, updated_at } }
//   { success: false, error: "..." }
//
// Note: GET pakai direct Supabase query (RLS allow anon SELECT) — tidak perlu
// edge function. Frontend bisa langsung query supabase.from('app_settings').select().
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
    const updateFields: Record<string, unknown> = {};

    // Validate & build update payload
    if (body.tax_enabled !== undefined) {
      if (typeof body.tax_enabled !== "boolean") {
        return json({ error: "tax_enabled must be boolean (true/false)" }, 400);
      }
      updateFields.tax_enabled = body.tax_enabled;
    }

    if (body.tax_percent !== undefined) {
      const pct = Number(body.tax_percent);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        return json({ error: "tax_percent must be number 0-100" }, 400);
      }
      updateFields.tax_percent = pct;
    }

    if (Object.keys(updateFields).length === 0) {
      return json({ error: "No fields to update. Provide tax_enabled and/or tax_percent." }, 400);
    }

    // Update single-row (id=1)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("app_settings")
      .update(updateFields)
      .eq("id", 1)
      .select()
      .single();

    if (error) {
      return json({ error: "Failed to update settings", details: error.message }, 500);
    }

    return json({ success: true, settings: data });
  } catch (e) {
    console.error("[manage-app-settings]", e);
    return json({ error: e.message }, 500);
  }
});
