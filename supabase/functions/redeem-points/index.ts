// supabase/functions/redeem-points/index.ts
// ============================================================================
// redeem-points — Customer redeem poin → voucher code
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/redeem-points
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { reward_id: "uuid" }
//
// Flow:
//   1. Verify user JWT (harus login)
//   2. Fetch reward dari point_rewards (cek is_active)
//   3. Fetch user_points balance (cek >= points_cost)
//   4. Generate unique voucher code (e.g., "POINTS-A7B3C9")
//   5. Insert ke point_redemptions (status='active', expires_at=+90 days)
//   6. Insert ke vouchers table (supaya validate-voucher bisa cek)
//   7. Deduct points via add_points RPC (amount=-points_cost, source='redeem_voucher')
//   8. Return voucher code ke customer
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOUCHER_EXPIRY_DAYS = 90;

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let code = "POINTS-";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ⭐ Auth: user harus login
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    const { reward_id } = await req.json();
    if (!reward_id) return json({ error: "reward_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch reward
    const { data: reward, error: rewardErr } = await supabase
      .from("point_rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("is_active", true)
      .maybeSingle();

    if (rewardErr || !reward) {
      return json({ error: "Reward tidak ditemukan atau tidak aktif" }, 404);
    }

    // 2. Check user balance
    const { data: userPoints } = await supabase
      .from("user_points")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();

    const balance = userPoints?.balance ?? 0;
    if (balance < reward.points_cost) {
      return json({
        error: `Poin tidak cukup. Butuh ${reward.points_cost} poin, Anda punya ${balance} poin.`,
        current_balance: balance,
        points_needed: reward.points_cost,
      }, 400);
    }

    // 3. Check quota (kalau ada)
    if (reward.quota_total !== null) {
      const { count } = await supabase
        .from("point_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("reward_id", reward_id);
      if ((count || 0) >= reward.quota_total) {
        return json({ error: "Kuota reward sudah habis" }, 400);
      }
    }

    // 4. Generate unique voucher code (retry kalau collision)
    let voucherCode = generateVoucherCode();
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("point_redemptions")
        .select("id")
        .eq("voucher_code", voucherCode)
        .maybeSingle();
      if (!existing) break;
      voucherCode = generateVoucherCode();
      attempts++;
    }

    // 5. Insert point_redemptions
    const expiresAt = new Date(Date.now() + VOUCHER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: redemption, error: redemptionErr } = await supabase
      .from("point_redemptions")
      .insert({
        user_id: userId,
        reward_id: reward.id,
        points_spent: reward.points_cost,
        voucher_code: voucherCode,
        status: "active",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (redemptionErr) {
      console.error("[redeem-points] Insert redemption error:", redemptionErr.message);
      return json({ error: "Gagal membuat redemption", details: redemptionErr.message }, 500);
    }

    // 6. Insert ke vouchers table (supaya validate-voucher bisa cek)
    const { error: voucherErr } = await supabase
      .from("vouchers")
      .insert({
        code: voucherCode,
        name: `Points Reward: ${reward.name}`,
        discount_type: reward.discount_type === 'free_shipping' ? 'fixed' : reward.discount_type,
        discount_value: reward.discount_value,
        min_purchase: reward.min_purchase,
        quota_total: 1,  // single use
        quota_per_user: 1,
        is_active: true,
        start_at: new Date().toISOString(),
        end_at: expiresAt,
      });

    if (voucherErr) {
      console.warn("[redeem-points] Insert to vouchers table failed (non-blocking):", voucherErr.message);
      // Non-blocking — redemption record sudah ada, voucher bisa di-create manual kalau perlu
    }

    // 7. Deduct points via RPC
    const { error: rpcErr } = await supabase.rpc("add_points", {
      p_user_id: userId,
      p_amount: -reward.points_cost,
      p_source: "redeem_voucher",
      p_description: `Redeem: ${reward.name} (code: ${voucherCode})`,
      p_redemption_id: redemption.id,
    });

    if (rpcErr) {
      console.error("[redeem-points] Deduct points RPC error:", rpcErr.message);
      // Rollback: delete redemption
      await supabase.from("point_redemptions").delete().eq("id", redemption.id);
      return json({ error: "Gagal deduct poin", details: rpcErr.message }, 500);
    }

    console.log(`[redeem-points] ✓ User ${userId.slice(0, 8)} redeemed ${reward.points_cost} points for "${reward.name}" → code: ${voucherCode}`);

    return json({
      success: true,
      voucher_code: voucherCode,
      reward_name: reward.name,
      points_spent: reward.points_cost,
      expires_at: expiresAt,
      message: `Berhasil! Voucher code: ${voucherCode}. Berlaku sampai ${new Date(expiresAt).toLocaleDateString('id-ID')}.`,
    });
  } catch (e) {
    console.error("[redeem-points] Error:", e);
    return json({ error: e.message }, 500);
  }
});
