// supabase/functions/get-user-vouchers/index.ts
// ============================================================================
// get-user-vouchers — Get all usable vouchers for current user
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/get-user-vouchers
//   Headers: Authorization: Bearer <user-jwt>
//   Body: {} (no params)
//
// Returns:
//   {
//     success: true,
//     vouchers: [
//       {
//         id, code, name, discount_type, discount_value, min_purchase,
//         product_sku, expires_at, source: 'redeem' | 'claim',
//         reward_name?: string, points_spent?: number
//       },
//       ...
//     ]
//   }
//
// Sumber voucher:
//   1. voucher_claims table — voucher umum yang di-claim user dari katalog admin
//   2. point_redemptions table — voucher hasil redeem poin (POINTS-XXXXXX / PRODUCT-XXXXXX)
//
// Filter:
//   - Status masih active (status='active' atau is_active=true di vouchers)
//   - Belum expired (expires_at/end_at > NOW)
//   - Belum dipakai (voucher_usages count < quota_per_user)
//
// Sort:
//   - By highest discount_value first (so user sees best deal at top)
//
// ⭐ Note: Voucher hasil redeem poin sudah di-auto-claim ke voucher_claims (via redeem-points
//    edge function). Tapi untuk redundancy + completeness, kita query dari kedua sources
//    lalu dedupe by voucher_id.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

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
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Fetch voucher_usages untuk user ini (untuk filter "sudah dipakai")
    const { data: userUsages } = await supabase
      .from("voucher_usages")
      .select("voucher_id")
      .eq("user_id", userId);
    const usedVoucherIds = new Set((userUsages || []).map((u: any) => u.voucher_id));

    // ── Source 1: voucher_claims (voucher umum yang di-claim)
    // Includes voucher dari redeem poin yang sudah auto-claimed
    const { data: claims, error: claimsErr } = await supabase
      .from("voucher_claims")
      .select(`
        voucher_id,
        claimed_at,
        voucher:vouchers(*)
      `)
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false });

    if (claimsErr) {
      console.error("[get-user-vouchers] Error fetching claims:", claimsErr.message);
      return json({ error: "Gagal fetch voucher claims" }, 500);
    }

    // ── Source 2: point_redemptions (voucher hasil redeem poin — untuk dedupe + catch
    //    case kalau auto-claim ke voucher_claims gagal)
    const { data: redemptions, error: redemptionsErr } = await supabase
      .from("point_redemptions")
      .select(`
        voucher_code,
        status,
        expires_at,
        points_spent,
        created_at,
        reward:point_rewards(name, discount_type)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (redemptionsErr) {
      console.warn("[get-user-vouchers] Error fetching redemptions (non-blocking):", redemptionsErr.message);
    }

    // ── Build voucher list with filter + dedupe
    const now = new Date();
    const seenVoucherIds = new Set<string>();
    const seenVoucherCodes = new Set<string>();
    const voucherList: Array<Record<string, unknown>> = [];

    // Process claims first (include auto-claimed dari redeem)
    for (const claim of (claims || [])) {
      const v = claim.voucher;
      if (!v) continue;

      // Dedupe by voucher_id
      if (seenVoucherIds.has(v.id)) continue;
      seenVoucherIds.add(v.id);
      if (v.code) seenVoucherCodes.add(v.code);

      // Filter: is_active
      if (!v.is_active) continue;

      // Filter: not expired
      if (new Date(v.end_at) < now) continue;

      // Filter: not used by this user
      if (usedVoucherIds.has(v.id)) continue;

      // Filter: quota not exceeded (kalau voucher umum dengan quota_total)
      if (v.quota_total !== null) {
        const { count: usageCount } = await supabase
          .from("voucher_usages")
          .select("*", { count: "exact", head: true })
          .eq("voucher_id", v.id);
        if ((usageCount || 0) >= v.quota_total) continue;
      }

      voucherList.push({
        id: v.id,
        code: v.code,
        name: v.name,
        discount_type: v.discount_type,
        discount_value: Number(v.discount_value) || 0,
        min_purchase: Number(v.min_purchase) || 0,
        max_discount: v.max_discount ? Number(v.max_discount) : null,
        product_sku: v.product_sku || null,
        expires_at: v.end_at,
        source: "claim",
        claimed_at: claim.claimed_at,
      });
    }

    // Process redemptions (untuk catch voucher redeem yang belum ke voucher_claims)
    for (const redemption of (redemptions || [])) {
      if (!redemption.voucher_code) continue;
      if (seenVoucherCodes.has(redemption.voucher_code)) continue;

      // Filter: redemption status masih active
      if (redemption.status !== "active") continue;

      // Filter: not expired
      if (new Date(redemption.expires_at) < now) continue;

      // Cari voucher by code untuk dapat full info
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", redemption.voucher_code)
        .maybeSingle();

      if (!voucher) continue;

      // Filter: not used (cek voucher_usages)
      if (usedVoucherIds.has(voucher.id)) continue;

      seenVoucherCodes.add(redemption.voucher_code);
      seenVoucherIds.add(voucher.id);

      voucherList.push({
        id: voucher.id,
        code: voucher.code,
        name: voucher.name,
        discount_type: voucher.discount_type,
        discount_value: Number(voucher.discount_value) || 0,
        min_purchase: Number(voucher.min_purchase) || 0,
        max_discount: voucher.max_discount ? Number(voucher.max_discount) : null,
        product_sku: voucher.product_sku || null,
        expires_at: voucher.end_at,
        source: "redeem",
        reward_name: redemption.reward?.name || null,
        points_spent: redemption.points_spent || null,
        claimed_at: redemption.created_at,
      });
    }

    // ── Sort: highest discount_value first (so user sees best deal at top)
    voucherList.sort((a, b) => {
      // free_product dianggap paling valuable (taruh atas)
      if (a.discount_type === "free_product" && b.discount_type !== "free_product") return -1;
      if (b.discount_type === "free_product" && a.discount_type !== "free_product") return 1;
      // Compare by discount_value (numeric)
      const aValue = Number(a.discount_value) || 0;
      const bValue = Number(b.discount_value) || 0;
      return bValue - aValue;
    });

    // ⭐ FINAL DEDUPE PASS — bulletproofing
    // Kalau ada bug di Source 1/Source 2 logic, atau voucher_claims table punya
    // duplicate rows yang lewat unique index check, pastikan hasil akhir bebas duplikat.
    const finalList: Array<Record<string, unknown>> = [];
    const finalSeenIds = new Set<string>();
    const finalSeenCodes = new Set<string>();
    for (const v of voucherList) {
      const vid = String(v.id || '');
      const vcode = String(v.code || '');
      // Skip kalau voucher_id atau voucher_code sudah ada di final list
      if (vid && finalSeenIds.has(vid)) continue;
      if (vcode && finalSeenCodes.has(vcode)) continue;
      if (vid) finalSeenIds.add(vid);
      if (vcode) finalSeenCodes.add(vcode);
      finalList.push(v);
    }

    console.log(`[get-user-vouchers] User ${userId.slice(0, 8)} has ${finalList.length} usable vouchers (after final dedupe from ${voucherList.length} raw entries)`);

    return json({
      success: true,
      vouchers: finalList,
      count: finalList.length,
    });
  } catch (e) {
    console.error("[get-user-vouchers] Error:", e);
    return json({ error: e.message }, 500);
  }
});