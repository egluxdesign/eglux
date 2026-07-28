// supabase/functions/manage-contact/index.ts
// ============================================================================
// manage-contact — Get + update Contact page content
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === "get") {
      const { data, error } = await supabase.from("contact_content").select("*").eq("id", 1).single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, content: data });
    }

    if (action === "update") {
      const authResult = await requireAdmin(req);
      if (!authResult.success) return authResult.response!;

      const updateFields: any = { updated_at: new Date().toISOString() };
      const allowed = ["address", "phone", "email", "operating_hours", "map_embed_url", "faq"];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          updateFields[key] = key === "faq" ? JSON.stringify(body[key]) : body[key];
        }
      }

      const { data, error } = await supabase.from("contact_content").update(updateFields).eq("id", 1).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, content: data });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    console.error("[manage-contact]", e);
    return json({ error: e.message }, 500);
  }
});
