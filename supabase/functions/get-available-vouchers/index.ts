// supabase/functions/get-available-vouchers/index.ts
// ============================================================================
// get-available-vouchers — List vouchers yang available untuk user claim
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/get-available-vouchers
//   Headers: Authorization: Bearer <user-jwt>
//
// Returns: list of active vouchers + flag sudah di-claim atau belum
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  // ⭐ CORS preflight — return 200 OK dengan CORS headers (HARUS sebelum auth check)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userId = authResult.user!.id;
    const now = new Date().toISOString();

    // 1. Get all active vouchers within date range
    const { data: vouchers, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("is_active", true)
      .lte("start_at", now)
      .gte("end_at", now)
      .order("created_at", { ascending: false });

    if (error) return json({ error: error.message }, 500);

    // 2. Get user's claims
    const { data: claims } = await supabase
      .from("voucher_claims")
      .select("voucher_id")
      .eq("user_id", userId);

    const claimedIds = new Set((claims || []).map((c: any) => c.voucher_id));

    // 3. Add `is_claimed` flag + calculate remaining quota
    // ⭐ Pakai for...of loop (bukan .map) karena butuh await di dalam
    const result = [];
    for (const v of (vouchers || [])) {
      const isClaimed = claimedIds.has(v.id);

      // ⭐ Calculate remaining quota (claims + usages)
      let remainingQuota = null; // null = unlimited
      if (v.quota_total !== null) {
        const { count: claimCount } = await supabase
          .from("voucher_claims")
          .select("*", { count: "exact", head: true })
          .eq("voucher_id", v.id);
        const { count: usageCount } = await supabase
          .from("voucher_usages")
          .select("*", { count: "exact", head: true })
          .eq("voucher_id", v.id);
        remainingQuota = v.quota_total - ((claimCount || 0) + (usageCount || 0));
      }

      result.push({ ...v, is_claimed: isClaimed, remaining_quota: remainingQuota });
    }

    // ⭐ Filter rules:
    //   - Voucher yang BELUM di-claim: tampilkan hanya kalau remaining_quota > 0 (atau unlimited)
    //   - Voucher yang SUDAH di-claim user:
    //     - Kalau remaining_quota > 0 → tetap tampil di "Voucher Saya" (bisa dipakai)
    //     - Kalau remaining_quota = 0 (habis) → SEMBUNYIKAN (tidak bisa dipakai lagi)
    //     - Kalau unlimited → tetap tampil
    const visibleVouchers = result.filter((v: any) => {
      if (v.remaining_quota === null) return true; // unlimited
      if (v.remaining_quota <= 0) return false; // habis → hide (bahkan yang sudah di-claim)
      return true; // masih ada quota
    });

    return json({ success: true, vouchers: visibleVouchers });
  } catch (e) {
    console.error("[get-available-vouchers]", e);
    return json({ error: e.message }, 500);
  }
});
