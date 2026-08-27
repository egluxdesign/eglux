// supabase/functions/cron-expire-points/index.ts
// ============================================================================
// cron-expire-points — Expire poin yang sudah lewat tanggal expires_at
// ============================================================================
//
// Schedule: EVERY DAY at 00:00 (midnight Asia/Jakarta)
//   Cron: 0 17 * * *  (17:00 UTC = 00:00 WIB UTC+7)
//
// Logic:
//   1. Call RPC expire_points() — batch process max 500 per run
//   2. Log summary: berapa poin expired, berapa user affected
//   3. Return result
//
// Security: pakai CRON_SECRET header (kalau di-set)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // ⭐ Auth: CRON_SECRET check (kalau di-set)
  if (CRON_SECRET) {
    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== CRON_SECRET) {
      return json({ error: "Unauthorized: invalid cron secret" }, 401);
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[cron-expire-points] Started at", new Date().toISOString());

    // Call RPC expire_points()
    const { data, error } = await supabase.rpc("expire_points");

    if (error) {
      console.error("[cron-expire-points] RPC error:", error.message);
      return json({ error: "Failed to expire points", details: error.message }, 500);
    }

    const result = data?.[0] || data;
    const expiredCount = result?.expired_count || 0;
    const usersAffected = result?.users_affected || 0;
    const totalPoints = result?.total_points_expired || 0;

    console.log(`[cron-expire-points] ✅ Done: ${expiredCount} transactions expired, ${usersAffected} users affected, ${totalPoints} total points expired`);

    return json({
      success: true,
      expired_count: expiredCount,
      users_affected: usersAffected,
      total_points_expired: totalPoints,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[cron-expire-points] Error:", e);
    return json({ error: e.message }, 500);
  }
});
