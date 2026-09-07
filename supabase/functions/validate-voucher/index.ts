// supabase/functions/validate-voucher/index.ts
// ============================================================================
// validate-voucher — Validate voucher code at checkout
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/validate-voucher
//   Headers: Authorization: Bearer <user-jwt>
//   Body: {
//     code: "EGLUX-ABC123",
//     subtotal: 250000,
//     cart_items: [{ variant_id: "uuid", qty: 1 }, ...]  // ⭐ NEW: required untuk free_product voucher
//   }
//
// Returns:
//   { valid: true, discount_amount: 50000, new_subtotal: 200000, voucher: {...} }
//   { valid: false, error: "Voucher tidak ditemukan" }
//
// Validation checks:
//   1. Voucher exists + code match
//   2. Voucher is_active
//   3. Voucher within date range (start_at <= now <= end_at)
//   4. Subtotal >= min_purchase (skip untuk free_product, min_purchase=0)
//   5. Quota not exceeded (total usages < quota_total)
//   6. User hasn't exceeded quota_per_user
//
// Discount calculation per type:
//   - 'fixed'         → discount = voucher.discount_value (Rp amount)
//   - 'percentage'    → discount = round(subtotal * value / 100), capped at max_discount
//   - 'free_shipping' → (handled separately, voucher.discount_value usually 0)
//   - 'free_product'  → ⭐ NEW: require SKU in cart_items
//                       discount = voucher.discount_value (snapshot price saat redeem)
//                       Kalau SKU gak ada di cart → reject
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

    const body = await req.json();
    const { code, subtotal, cart_items } = body;
    if (!code) return json({ valid: false, error: "Kode voucher wajib diisi" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userId = authResult.user!.id;
    const orderSubtotal = Number(subtotal) || 0;

    // 1. Find voucher by code
    const { data: voucher, error: vErr } = await supabase
      .from("vouchers")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (vErr || !voucher) {
      return json({ valid: false, error: "Kode voucher tidak ditemukan" });
    }

    // 1b. ⭐ Check voucher_redemptions (kalau voucher ini adalah voucher fisik)
    const { data: redemption } = await supabase
      .from("voucher_redemptions")
      .select("id, phone, status")
      .eq("voucher_code", code.trim().toUpperCase())
      .maybeSingle();

    if (redemption) {
      if (redemption.status === "used") {
        return json({ valid: false, error: "Voucher ini sudah digunakan sebelumnya" });
      }
    }

    // 1c. ⭐ Check point_redemptions (kalau voucher ini dari redeem poin)
    const { data: pointRedemption } = await supabase
      .from("point_redemptions")
      .select("id, status, expires_at, user_id")
      .eq("voucher_code", code.trim().toUpperCase())
      .maybeSingle();

    if (pointRedemption) {
      // Voucher dari points
      if (pointRedemption.status === "used") {
        return json({ valid: false, error: "Voucher ini sudah digunakan sebelumnya" });
      }
      if (pointRedemption.status === "expired" || new Date(pointRedemption.expires_at) < new Date()) {
        return json({ valid: false, error: "Voucher ini sudah expired" });
      }
      // Cek kepemilikan: voucher harus dipakai oleh user yang redeem
      if (pointRedemption.user_id !== userId) {
        return json({ valid: false, error: "Voucher ini bukan milik akun Anda" });
      }
    }
    // Kalau gak ada di kedua table → voucher biasa, lanjut validasi normal

    // 2. Check is_active
    if (!voucher.is_active) {
      return json({ valid: false, error: "Voucher ini tidak aktif" });
    }

    // 3. Check date range
    const now = new Date();
    if (new Date(voucher.start_at) > now) {
      return json({ valid: false, error: "Voucher belum berlaku (mulai " + new Date(voucher.start_at).toLocaleDateString("id-ID") + ")" });
    }
    if (new Date(voucher.end_at) < now) {
      return json({ valid: false, error: "Voucher sudah berakhir" });
    }

    // 4. Check min purchase (skip untuk free_product — min_purchase=0)
    if (voucher.discount_type !== "free_product" && voucher.min_purchase > 0 && orderSubtotal < voucher.min_purchase) {
      return json({ valid: false, error: `Minimum belanja Rp ${voucher.min_purchase.toLocaleString("id-ID")} untuk pakai voucher ini` });
    }

    // 5. Check total quota
    if (voucher.quota_total !== null) {
      const { count } = await supabase
        .from("voucher_usages")
        .select("*", { count: "exact", head: true })
        .eq("voucher_id", voucher.id);
      if ((count || 0) >= voucher.quota_total) {
        return json({ valid: false, error: "Kuota voucher sudah habis" });
      }
    }

    // 6. Check per-user quota
    const { count: userCount } = await supabase
      .from("voucher_usages")
      .select("*", { count: "exact", head: true })
      .eq("voucher_id", voucher.id)
      .eq("user_id", userId);
    if ((userCount || 0) >= voucher.quota_per_user) {
      return json({ valid: false, error: `Kamu sudah pakai voucher ini ${voucher.quota_per_user}x (limit per user)` });
    }

    // ─────────────────────────────────────────────────────────────────────
    // Calculate discount amount per discount_type
    // ─────────────────────────────────────────────────────────────────────
    let discountAmount = 0;
    let freeProductInfo: { sku: string; name: string; price: number } | null = null;

    if (voucher.discount_type === "fixed") {
      discountAmount = Number(voucher.discount_value);

    } else if (voucher.discount_type === "percentage") {
      discountAmount = Math.round(orderSubtotal * Number(voucher.discount_value) / 100);
      // Apply max_discount cap if set
      if (voucher.max_discount && discountAmount > Number(voucher.max_discount)) {
        discountAmount = Number(voucher.max_discount);
      }

    } else if (voucher.discount_type === "free_product") {
      // ⭐ NEW: Free product voucher — require SKU in cart_items
      if (!cart_items || !Array.isArray(cart_items) || cart_items.length === 0) {
        return json({
          valid: false,
          error: `Voucher ini berlaku untuk produk tertentu. Tambahkan produk (SKU: ${voucher.product_sku}) ke cart terlebih dahulu, lalu apply voucher lagi.`,
        });
      }

      if (!voucher.product_sku) {
        // Defensive: voucher type free_product tapi gak ada product_sku — config error
        console.error("[validate-voucher] ❌ Voucher", voucher.code, "is free_product but product_sku is NULL");
        return json({ valid: false, error: "Konfigurasi voucher salah. Hubungi admin." });
      }

      // Extract variant_ids dari cart_items (frontend passes [{ variant_id, qty }])
      const variantIds = cart_items
        .map((item: { variant_id?: string }) => item.variant_id)
        .filter(Boolean) as string[];

      if (variantIds.length === 0) {
        return json({
          valid: false,
          error: `Voucher ini berlaku untuk produk (SKU: ${voucher.product_sku}). Tambahkan produk tersebut ke cart terlebih dahulu.`,
        });
      }

      // Fetch variants dari DB untuk cek SKU + dapatkan harga terkini
      const { data: variants, error: variantsErr } = await supabase
        .from("product_variants")
        .select("id, sku, name, price, is_active")
        .in("id", variantIds);

      if (variantsErr) {
        console.error("[validate-voucher] Error fetching variants:", variantsErr.message);
        return json({ valid: false, error: "Gagal memverifikasi cart. Coba lagi." });
      }

      // Cari variant dengan SKU yang cocok dengan voucher.product_sku
      const matchingVariant = (variants || []).find((v) => v.sku === voucher.product_sku);

      if (!matchingVariant) {
        // SKU tidak ada di cart
        return json({
          valid: false,
          error: `Voucher hanya berlaku untuk produk dengan SKU ${voucher.product_sku}. Tambahkan produk tersebut ke cart, lalu apply voucher lagi.`,
          required_sku: voucher.product_sku,
        });
      }

      if (!matchingVariant.is_active) {
        return json({
          valid: false,
          error: `Produk ${matchingVariant.name} (${voucher.product_sku}) sedang tidak tersedia. Coba lagi nanti.`,
        });
      }

      // ⭐ Discount = voucher.discount_value (snapshot price saat redeem)
      // Catatan: Pakai voucher.discount_value (snapshot), BUKAN matchingVariant.price (current price)
      // supaya voucher konsisten — harga yang dijanjikan saat redeem dipakai
      discountAmount = Number(voucher.discount_value);

      freeProductInfo = {
        sku: matchingVariant.sku,
        name: matchingVariant.name,
        price: Number(voucher.discount_value),
      };

      console.log(`[validate-voucher] 🎁 Free product voucher applied — SKU: ${matchingVariant.sku}, discount: Rp ${discountAmount}`);

    } else if (voucher.discount_type === "free_shipping") {
      // Free shipping voucher — discount di-handle di shipping cost calculation
      // Untuk sekarang, set discount = 0 (frontend tetap apply sebagai free shipping flag)
      discountAmount = 0;
    }

    // Discount tidak boleh lebih besar dari subtotal
    // ⚠️ Exception untuk free_product: kalau produknya aja yang di-free, discount gak harus <= subtotal
    // ( karena customer masih harus bayar ongkir + items lain)
    // Tapi kalau cart cuma ada produk itu, subtotal = harga produk, dan discount = harga produk → subtotal jadi 0
    if (voucher.discount_type !== "free_product" && discountAmount > orderSubtotal) {
      discountAmount = orderSubtotal;
    }

    const newSubtotal = Math.max(0, orderSubtotal - discountAmount);

    return json({
      valid: true,
      discount_amount: discountAmount,
      new_subtotal: newSubtotal,
      voucher: {
        id: voucher.id,
        name: voucher.name,
        code: voucher.code,
        discount_type: voucher.discount_type,
        discount_value: voucher.discount_value,
        min_purchase: voucher.min_purchase,
        ...(voucher.product_sku ? { product_sku: voucher.product_sku } : {}),
      },
      ...(freeProductInfo ? { free_product: freeProductInfo } : {}),
    });
  } catch (e) {
    console.error("[validate-voucher]", e);
    return json({ valid: false, error: e.message }, 500);
  }
});