// supabase/functions/update-profile/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_FIELDS = ["full_name", "address", "avatar_url"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const userId = authResult.user!.id;

    const updates: Record<string, any> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        const value = body[key];
        if (typeof value === "string") updates[key] = value.trim() || null;
        else if (value === null || value === undefined) updates[key] = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: "No valid fields to update" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, full_name, email, phone, role, address, avatar_url, is_active")
      .single();

    if (error) return json({ error: `Failed: ${error.message}` }, 500);

    return json({ success: true, profile: data, message: "Profile updated" });
  } catch (e) {
    console.error("[update-profile]", e);
    return json({ error: e.message }, 500);
  }
});
