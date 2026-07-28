// supabase/functions/manage-about/index.ts
// ============================================================================
// manage-about — Get + update About page content
// ============================================================================
// Actions:
//   POST { action: "get" }      → return about_content (row id=1)
//   POST { action: "update", ...fields } → update about_content
//
// Auth: get = public, update = requireAdmin
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── GET (public) ──
    if (action === "get") {
      const { data, error } = await supabase
        .from("about_content")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, content: data });
    }

    // ── UPDATE (admin only) ──
    if (action === "update") {
      const authResult = await requireAdmin(req);
      if (!authResult.success) return authResult.response!;

      const updateFields: any = { updated_at: new Date().toISOString() };
      const allowed = ["hero_title", "hero_subtitle", "hero_image_url", "content_html", "stats", "leadership", "timeline"];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          updateFields[key] = typeof body[key] === "string" ? body[key] : JSON.stringify(body[key]);
        }
      }

      const { data, error } = await supabase
        .from("about_content")
        .update(updateFields)
        .eq("id", 1)
        .select()
        .single();

      if (error) return json({ error: error.message }, 500);
      return json({ success: true, content: data });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    console.error("[manage-about]", e);
    return json({ error: e.message }, 500);
  }
});
