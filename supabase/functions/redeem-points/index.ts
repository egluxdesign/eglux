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
// Flow untuk VOUCHER reward ('fixed' | 'percentage' | 'free_shipping'):
//   1. Verify user JWT (harus login)
//   2. Fetch reward dari point_rewards (cek is_active)
//   3. Fetch user_points balance (cek >= points_cost)
//   4. Generate unique voucher code (prefix "POINTS-")
//   5. Insert ke point_redemptions (status='active', expires_at=+90 days)
//   6. Insert ke vouchers table (supaya validate-voucher bisa cek)
//   7. Deduct points via add_points RPC (amount=-points_cost, source='redeem_voucher')
//   8. Return voucher code ke customer
//
// Flow untuk FREE PRODUCT reward ('free_product'):
//   1-3. Same as above (verify, fetch reward, check balance)
//   4. Fetch product variant by product_sku → snapshot current price
//      (Price di-lock saat redeem, jaga-jaga kalau harga produk berubah sebelum customer pakai)
//   5. Generate unique voucher code (prefix "PRODUCT-")
//   6. Insert ke point_redemptions (status='active', expires_at=+365 days / 1 tahun)
//   7. Insert ke vouchers table dengan:
//      - discount_type = 'free_product'
//      - discount_value = snapshot harga produk saat redeem
//      - product_sku = reward.product_sku (e.g., 'FT-F01-T')
//      - min_purchase = 0 (no minimum — cukup bayar ongkir)
//      - quota_total = 1, quota_per_user = 1 (single use)
//   8. Deduct points via add_points RPC (amount=-points_cost, source='redeem_product')
//   9. Return voucher code + instruction "tambahkan produk X ke cart + apply voucher"
//
// ⚠️ VALIDATE-VOUCHER HANDLING (di edge function terpisah):
//   Saat customer apply voucher 'free_product' di checkout:
//   - validate-voucher cek SKU ada di cart (via variant lookup)
//   - Kalau ada → discount_amount = voucher.discount_value (snapshot harga saat redeem)
//   - Kalau gak ada → reject dengan message "Tambahkan produk [SKU] ke cart dulu"
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOUCHER_EXPIRY_DAYS = 90;
const PRODUCT_VOUCHER_EXPIRY_DAYS = 365; // 1 tahun untuk free_product voucher

// ============================================================================
// Voucher code generator — prefix berbeda untuk voucher vs product
// ============================================================================
function generateCode(prefix: string = "POINTS"): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let code = `${prefix}-`;
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

    // ⭐ Branching: free_product vs voucher reward
    const isFreeProduct = reward.discount_type === "free_product";
    const codePrefix = isFreeProduct ? "PRODUCT" : "POINTS";
    const expiryDays = isFreeProduct ? PRODUCT_VOUCHER_EXPIRY_DAYS : VOUCHER_EXPIRY_DAYS;

    // ⭐ For free_product: fetch product variant + snapshot price
    let snapshotPrice = 0;
    let productName = "";
    if (isFreeProduct) {
      if (!reward.product_sku) {
        return json({ error: "Konfigurasi reward salah: product_sku tidak di-set. Hubungi admin." }, 500);
      }

      // Fetch variant by SKU
      const { data: variant, error: variantErr } = await supabase
        .from("product_variants")
        .select("id, sku, price, name, stock, is_active")
        .eq("sku", reward.product_sku)
        .maybeSingle();

      if (variantErr || !variant) {
        console.error("[redeem-points] Variant not found for SKU:", reward.product_sku, variantErr?.message);
        return json({
          error: `Produk dengan SKU ${reward.product_sku} tidak ditemukan. Hubungi admin.`,
        }, 500);
      }

      if (!variant.is_active) {
        return json({
          error: `Produk ${reward.product_sku} sedang tidak aktif. Coba lagi nanti atau hubungi admin.`,
        }, 400);
      }

      // Snapshot price (jaga-jaga harga berubah sebelum customer pakai voucher)
      // ⚠️ Pakai price current variant (bisa harga discount kalau ada — pakai price field saja untuk simplicity)
      snapshotPrice = Number(variant.price) || 0;
      productName = variant.name || reward.product_sku;

      console.log(`[redeem-points] 🎁 Free product reward — SKU: ${reward.product_sku}, price snapshot: Rp ${snapshotPrice}, variant: ${productName}`);

      if (snapshotPrice === 0) {
        return json({
          error: "Harga produk Rp 0, tidak bisa redeem. Hubungi admin.",
        }, 500);
      }
    }

    // 4. Generate unique code (retry kalau collision)
    let code = generateCode(codePrefix);
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from("point_redemptions")
        .select("id")
        .eq("voucher_code", code)
        .maybeSingle();
      if (!existing) break;
      code = generateCode(codePrefix);
      attempts++;
    }

    // 5. Insert point_redemptions
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: redemption, error: redemptionErr } = await supabase
      .from("point_redemptions")
      .insert({
        user_id: userId,
        reward_id: reward.id,
        points_spent: reward.points_cost,
        voucher_code: code,
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
    //    Untuk free_product: discount_value = snapshot price saat redeem
    //    Untuk voucher biasa: discount_value dari reward langsung
    const voucherDiscountValue = isFreeProduct ? snapshotPrice : reward.discount_value;
    const voucherDiscountType = reward.discount_type === "free_shipping"
      ? "fixed"  // free_shipping masih bisa pakai "fixed" di vouchers table, value=0
      : reward.discount_type;

    const { data: voucherRecord, error: voucherErr } = await supabase
      .from("vouchers")
      .insert({
        code: code,
        name: isFreeProduct
          ? `Free Product: ${productName} (${reward.product_sku})`
          : `Points Reward: ${reward.name}`,
        discount_type: voucherDiscountType,
        discount_value: voucherDiscountValue,
        min_purchase: reward.min_purchase,
        quota_total: 1,  // single use
        quota_per_user: 1,
        is_active: true,
        start_at: new Date().toISOString(),
        end_at: expiresAt,
        // ⭐ Set product_sku untuk free_product voucher (dipakai validate-voucher)
        ...(isFreeProduct ? { product_sku: reward.product_sku } : {}),
      })
      .select("id")
      .single();

    if (voucherErr) {
      console.warn("[redeem-points] Insert to vouchers table failed (non-blocking):", voucherErr.message);
      // Non-blocking — redemption record sudah ada, voucher bisa di-create manual kalau perlu
      // Tapi kalau free_product voucher gak ke-insert, validate-voucher gak akan nemuin voucher-nya
      // → return error ke user supaya mereka tau ada masalah
      if (isFreeProduct) {
        console.error("[redeem-points] ❌ Free product voucher insert failed — cannot proceed (validate-voucher gak akan work)");
        // Rollback: delete redemption
        await supabase.from("point_redemptions").delete().eq("id", redemption.id);
        return json({
          error: "Gagal membuat voucher produk. Poin Anda tidak terpotong. Coba lagi atau hubungi admin.",
          details: voucherErr.message,
        }, 500);
      }
    } else if (voucherRecord?.id) {
      // ⭐ AUTO-INSERT ke voucher_claims supaya voucher langsung muncul di dropdown "My Vouchers"
      // user di checkout (Shopee-style — gak perlu input code manual).
      const { error: claimErr } = await supabase
        .from("voucher_claims")
        .insert({
          voucher_id: voucherRecord.id,
          user_id: userId,
        });

      if (claimErr) {
        // Non-blocking — voucher tetap bisa dipakai via input code manual
        // (unique constraint violation = sudah pernah di-claim, ignore aja)
        console.warn("[redeem-points] Auto-insert to voucher_claims failed (non-blocking):", claimErr.message);
      } else {
        console.log(`[redeem-points] ✓ Voucher ${code} auto-claimed for user ${userId.slice(0, 8)} — appears in My Vouchers`);
      }
    }

    // 7. Deduct points via RPC
    const pointsSource = isFreeProduct ? "redeem_product" : "redeem_voucher";
    const pointsDescription = isFreeProduct
      ? `Redeem produk gratis: ${reward.name} (SKU: ${reward.product_sku}, code: ${code})`
      : `Redeem: ${reward.name} (code: ${code})`;

    const { error: rpcErr } = await supabase.rpc("add_points", {
      p_user_id: userId,
      p_amount: -reward.points_cost,
      p_source: pointsSource,
      p_description: pointsDescription,
      p_redemption_id: redemption.id,
    });

    if (rpcErr) {
      console.error("[redeem-points] Deduct points RPC error:", rpcErr.message);
      // Rollback: delete redemption + voucher + claim
      await supabase.from("point_redemptions").delete().eq("id", redemption.id);
      if (voucherRecord?.id) {
        await supabase.from("voucher_claims").delete().eq("voucher_id", voucherRecord.id).eq("user_id", userId);
        await supabase.from("vouchers").delete().eq("id", voucherRecord.id);
      } else {
        await supabase.from("vouchers").delete().eq("code", code);
      }
      return json({ error: "Gagal deduct poin", details: rpcErr.message }, 500);
    }

    console.log(`[redeem-points] ✓ User ${userId.slice(0, 8)} redeemed ${reward.points_cost} points for "${reward.name}" (${reward.discount_type}) → code: ${code}`);

    // 8. Return response — beda message untuk product vs voucher
    if (isFreeProduct) {
      return json({
        success: true,
        voucher_code: code,
        reward_name: reward.name,
        reward_type: "free_product",
        product_sku: reward.product_sku,
        product_name: productName,
        price_snapshot: snapshotPrice,
        points_spent: reward.points_cost,
        expires_at: expiresAt,
        message: `Berhasil! Voucher code: ${code}.\n\nCara pakai:\n1. Tambahkan produk ${productName} (SKU: ${reward.product_sku}) ke cart\n2. Di halaman checkout, apply voucher code\n3. Harga produk akan jadi Rp 0 (cukup bayar ongkir)\n\nVoucher berlaku sampai ${new Date(expiresAt).toLocaleDateString('id-ID')} (1 tahun).`,
      });
    }

    return json({
      success: true,
      voucher_code: code,
      reward_name: reward.name,
      reward_type: "voucher",
      points_spent: reward.points_cost,
      expires_at: expiresAt,
      message: `Berhasil! Voucher code: ${code}. Berlaku sampai ${new Date(expiresAt).toLocaleDateString('id-ID')}.`,
    });
  } catch (e) {
    console.error("[redeem-points] Error:", e);
    return json({ error: e.message }, 500);
  }
});
