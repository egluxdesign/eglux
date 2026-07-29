// supabase/functions/get-app-settings/index.ts
// ============================================================================
// get-app-settings — Public endpoint untuk baca app_settings (with caching)
// ============================================================================
//
// Auth: none (public)
//
// Cara panggil:
//   GET /functions/v1/get-app-settings
//
// Response:
//   { success: true, settings: { tax_enabled, tax_percent, updated_at } }
//
// Note: Frontend juga bisa langsung query supabase.from('app_settings').select()
// (RLS allow anon SELECT). Edge function ini opsional — disediakan untuk:
//   1. Response dengan Cache-Control header (reduce Supabase query load)
//   2. Centralized config endpoint kalau mau di-cache di CDN
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase
      .from("app_settings")
      .select("tax_enabled, tax_percent, updated_at")
      .eq("id", 1)
      .single();

    if (error || !data) {
      // Fallback: return default settings
      return new Response(
        JSON.stringify({
          success: true,
          settings: {
            tax_enabled: true,
            tax_percent: 3.00,
            updated_at: null,
          },
          fallback: true,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, settings: data }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    console.error("[get-app-settings]", e);
    return new Response(
      JSON.stringify({ success: false, error: e.message, settings: { tax_enabled: true, tax_percent: 3.00 } }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
