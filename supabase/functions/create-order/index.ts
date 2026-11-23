// supabase/functions/create-order/index.ts
// ============================================================================
// create-order — Customer-facing endpoint untuk save order ke DB
// ============================================================================
//
// Mengapa edge function ini ada?
//   Setelah SQL 006 (tighten RLS), anon key TIDAK BISA INSERT ke
//   customers/orders/order_items. Hanya service_role yang bisa.
//   Frontend (CheckoutModalDoku / CheckoutModalMidtrans) pakai anon key
//   → akan FAIL.
//
//   Solusi: frontend call edge function ini, edge function pakai
//   service_role key untuk INSERT. Auth verify via JWT user (any role
//   boleh, asal sudah login).
//
// Cara panggil:
//   POST /functions/v1/create-order
//   Headers:
//     Authorization: Bearer <user-jwt>  ← WAJIB, hasil dari supabase.auth
//   Body: {
//     customer: { name, phone, email?, address },
//     order: {
//       subtotal, shipping_cost, total_amount,
//       shipping_address, shipping_city, shipping_postal_code,
//       shipping_area_id?, shipping_area_name?,
//       courier_code, courier_service?, courier_duration?, courier_rate,
//       notes?,
//       // ⭐ Payment method (v3 NEW): gateway yang dipilih customer
//       payment_method_selected?,  // 'doku' | 'midtrans_snap' | etc.
//       // ⭐ Tax (biaya admin) — optional, default 3% dari base price
//       tax_percent?, tax_base?, tax_amount?,
//       // ⭐ Voucher fields (optional)
//       voucher_code?, voucher_discount?
//     },
//     items: [
//       { product_id, variant_id?, product_name_snapshot, variant_name_snapshot?,
//         unit_price_snapshot, original_unit_price?, quantity, subtotal, weight_gram }
//     ]
//   }
//
// Response:
//   { success: true, order_id: "uuid", customer_id: "uuid" }
//   { success: false, error: "..." }
//
// v3 CHANGES (this version):
//   - FIXED: payment_method now reads from body.order.payment_method_selected
//     (previously hardcoded to "midtrans_snap" → wrong for DOKU orders)
//   - UPDATED: success message is gateway-agnostic (no longer mentions midtrans)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// Validation helpers
// ============================================================================
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function isE164(phone: string): boolean {
  // +62xxxxxxxxxxxx (8-15 digits after country code)
  return /^\+\d{8,15}$/.test(phone);
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Normalize payment_method_selected → safe string for DB column
// Accepts: 'doku', 'midtrans_snap', 'midtrans', 'qris', etc.
// Default: 'midtrans_snap' (backward compat for existing Midtrans flow)
function normalizePaymentMethod(value: any): string {
  if (!value) return "midtrans_snap";
  const s = String(value).trim().toLowerCase();
  // Whitelist known gateways to prevent injection
  const allowed = ["doku", "midtrans_snap", "midtrans", "qris", "manual"];
  if (allowed.includes(s)) return s;
  // Unknown → log warning but still accept (future-proof for new gateways)
  console.warn(`[create-order] Unknown payment_method_selected: ${s}, defaulting to 'midtrans_snap'`);
  return "midtrans_snap";
}

// ============================================================================
// Main
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── AUTH: Customer-facing endpoint, cukup login (any role) ──
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const body = await req.json();
    const { customer, order, items } = body;

    // ── Validate customer ──
    if (!customer || !customer.name || !customer.phone || !customer.address) {
      return json({ error: "customer.{name,phone,address} are required" }, 400);
    }
    if (customer.phone && !isE164(customer.phone)) {
      return json(
        { error: `customer.phone must be E.164 format (+628xxx), got: ${customer.phone}` },
        400,
      );
    }
    if (customer.email && !isEmail(customer.email)) {
      return json({ error: "customer.email format invalid" }, 400);
    }

    // ── Validate order ──
    if (!order) {
      return json({ error: "order is required" }, 400);
    }
    const requiredOrderFields = [
      "subtotal", "shipping_cost", "total_amount",
      "shipping_address", "shipping_city", "shipping_postal_code",
      "courier_code", "courier_rate",
    ];
    for (const field of requiredOrderFields) {
      if (order[field] === undefined || order[field] === null) {
        return json({ error: `order.${field} is required` }, 400);
      }
    }
    if (Number(order.subtotal) < 0 || Number(order.shipping_cost) < 0 || Number(order.total_amount) < 0) {
      return json({ error: "order amounts must be >= 0" }, 400);
    }

    // ── Validate items ──
    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "items array is required (cannot be empty)" }, 400);
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id || !isUUID(item.product_id)) {
        return json({ error: `items[${i}].product_id must be a valid UUID` }, 400);
      }
      if (item.variant_id && !isUUID(item.variant_id)) {
        return json({ error: `items[${i}].variant_id must be a valid UUID` }, 400);
      }
      if (!item.product_name_snapshot) {
        return json({ error: `items[${i}].product_name_snapshot is required` }, 400);
      }
      if (Number(item.unit_price_snapshot) < 0) {
        return json({ error: `items[${i}].unit_price_snapshot must be >= 0` }, 400);
      }
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
        return json({ error: `items[${i}].quantity must be positive integer` }, 400);
      }
      if (Number(item.subtotal) < 0) {
        return json({ error: `items[${i}].subtotal must be >= 0` }, 400);
      }
    }

    // ── Execute INSERT pakai service_role (bypass RLS) ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ⭐ v3 FIX: Normalize payment method from frontend (default = midtrans_snap for backward compat)
    const paymentMethod = normalizePaymentMethod(order.payment_method_selected);
    console.log("[create-order] payment_method_selected:", order.payment_method_selected, "→ normalized:", paymentMethod);

    // 1. Insert customer (generate UUID)
    // ⭐ Set user_id supaya orders bisa di-filter by user (untuk order history)
    const customerId = crypto.randomUUID();
    const { error: customerError } = await supabase.from("customers").insert({
      id: customerId,
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email?.trim() || null,
      address: customer.address.trim(),
      user_id: authResult.user!.id, // ⭐ link customer ke user yang login
    });
    if (customerError) {
      return json({ error: "Failed to insert customer", details: customerError.message }, 500);
    }

    // 2. Insert order
    // NOTE: user_id tidak di-include karena column belum ada di orders table.
    // Kalau nanti mau link order ke user (untuk order history di user account),
    // tambah migration: ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES auth.users(id).
    // Lalu uncomment baris user_id di bawah.

    // ⭐ Tax calculation (defensive): read settings from DB.
    // Frontend kirim tax_*, tapi backend VALIDATE ulang dari app_settings table.
    // Kalau admin set tax_enabled=false → force tax_amount=0 (jangan percaya frontend).
    const DEFAULT_TAX_PERCENT = 3;
    let taxPercent = DEFAULT_TAX_PERCENT;
    let taxEnabled = true;

    try {
      const { data: settingsRow } = await supabase
        .from("app_settings")
        .select("tax_enabled, tax_percent")
        .eq("id", 1)
        .maybeSingle();
      if (settingsRow) {
        taxEnabled = settingsRow.tax_enabled !== false;
        taxPercent = Number(settingsRow.tax_percent) || DEFAULT_TAX_PERCENT;
      }
    } catch (settingsErr) {
      console.warn("[create-order] Failed to read app_settings, using defaults:", settingsErr?.message);
    }

    let taxBase = 0;
    let taxAmount = 0;

    if (taxEnabled) {
      // Compute tax_base dari items (sum original_price × qty)
      taxBase = items.reduce((s, item) => {
        const orig = (item.original_unit_price != null && item.original_unit_price !== "")
          ? Number(item.original_unit_price)
          : Number(item.unit_price_snapshot) || 0;
        const qty = Number(item.quantity) || 1;
        return s + (orig * qty);
      }, 0);
      taxAmount = Math.round(taxBase * taxPercent / 100);
    }
    // Jika tax disabled: taxBase=0, taxAmount=0 (frontend kirim apapun, di-ignore)

    const orderId = crypto.randomUUID();
    const { error: orderError } = await supabase.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      // user_id: authResult.user!.id,  // ← enable setelah migration
      status: "pending",
      // ⭐ v3 FIX: read from body instead of hardcoded "midtrans_snap"
      payment_method: paymentMethod,
      payment_status: "unpaid",
      subtotal: Number(order.subtotal),
      shipping_cost: Number(order.shipping_cost),
      total_amount: Number(order.total_amount),
      shipping_address: order.shipping_address.trim(),
      shipping_city: order.shipping_city.trim(),
      shipping_postal_code: String(order.shipping_postal_code).trim(),
      shipping_area_id: order.shipping_area_id ? String(order.shipping_area_id).trim() : null,
      shipping_area_name: order.shipping_area_name || null,
      courier_code: String(order.courier_code).toLowerCase(),
      courier_service: order.courier_service || null,
      courier_duration: order.courier_duration || null,
      courier_rate: Number(order.courier_rate),
      notes: order.notes?.trim() || null,
      // ⭐ Voucher fields (optional — dari checkout)
      voucher_code: order.voucher_code?.trim() || null,
      voucher_discount: Number(order.voucher_discount) || 0,
      // ⭐ Tax fields (biaya admin % dari base price)
      tax_percent: taxPercent,
      tax_base: taxBase,
      tax_amount: taxAmount,
      // ⭐ v3.2 NEW: Payment method + admin fee (dari CheckoutModalMidtrans v2.2)
      // Frontend kirim payment_method_selected + admin_fee (sudah include VAT).
      // create-midtrans-transaction edge function baca ini untuk gross_amount calc.
      payment_method_selected: order.payment_method_selected || null,
      admin_fee: Number(order.admin_fee) || 0,
    });
    if (orderError) {
      // Cleanup: hapus customer yang baru di-insert (order gagal)
      await supabase.from("customers").delete().eq("id", customerId);
      return json({ error: "Failed to insert order", details: orderError.message }, 500);
    }

    // ⭐ v3.1 FIX: Mark voucher redemption as 'used' + INSERT into voucher_usages for quota tracking
    // Tanpa voucher_usages INSERT, validate-voucher gak bisa cek quota_total/quota_per_user
    // → voucher bisa dipakai unlimited times meski quota di-set
    if (order.voucher_code) {
      const normalizedVoucherCode = order.voucher_code.trim().toUpperCase();
      try {
        // 1. Update voucher_redemptions (untuk physical voucher yang di-claim via WA)
        await supabase
          .from("voucher_redemptions")
          .update({
            status: "used",
            used_at: new Date().toISOString(),
            used_in_order: orderId,
          })
          .eq("voucher_code", normalizedVoucherCode)
          .eq("status", "claimed");
        console.log("[create-order] ✓ Voucher redemption marked as used:", normalizedVoucherCode);

        // 2. ⭐ v3.1 NEW: Update point_redemptions status (untuk voucher dari redeem poin)
        await supabase
          .from("point_redemptions")
          .update({ status: "used", used_at: new Date().toISOString() })
          .eq("voucher_code", normalizedVoucherCode)
          .eq("user_id", authResult.user!.id)
          .in("status", ["claimed", "active"]);
        console.log("[create-order] ✓ Point redemption marked as used:", normalizedVoucherCode);

        // 3. ⭐ v3.1 NEW: INSERT into voucher_usages (untuk quota tracking di validate-voucher)
        //    Cari voucher ID dulu dari vouchers table
        const { data: voucherRow, error: voucherLookupErr } = await supabase
          .from("vouchers")
          .select("id")
          .eq("code", normalizedVoucherCode)
          .maybeSingle();

        if (voucherLookupErr) {
          console.warn("[create-order] Voucher lookup failed:", voucherLookupErr?.message);
        } else if (voucherRow?.id) {
          const { error: usageInsertErr } = await supabase.from("voucher_usages").insert({
            voucher_id: voucherRow.id,
            user_id: authResult.user!.id,
            order_id: orderId,
            used_at: new Date().toISOString(),
          });
          if (usageInsertErr) {
            console.warn("[create-order] voucher_usages insert failed:", usageInsertErr?.message);
          } else {
            console.log("[create-order] ✓ voucher_usages inserted for quota tracking:", voucherRow.id);
          }
        } else {
          // Voucher tidak ada di vouchers table — bisa jadi voucher fisik atau points voucher
          // yang tidak terdaftar di vouchers table. Skip insert (quota tracking tidak berlaku).
          console.log("[create-order] Voucher not in vouchers table — skip voucher_usages insert");
        }
      } catch (redemptionErr) {
        console.warn("[create-order] Voucher redemption update failed (non-blocking):", redemptionErr?.message);
      }
    }

    // 3. Insert order_items
    // ⭐ Simpan original_unit_price + discount_amount untuk transparent discount display
    const itemsPayload = items.map((item: any) => {
      const unitPrice = Number(item.unit_price_snapshot) || 0;
      // ⭐ Explicit null check — jangan pakai Number(x) || null karena 0 jadi null
      const originalPrice = (item.original_unit_price !== null && item.original_unit_price !== undefined && item.original_unit_price !== "")
        ? Number(item.original_unit_price)
        : null;
      const qty = Number(item.quantity) || 1;
      // discount_amount = (original - unit) * qty — hanya kalau original > unit
      const discountAmount = (originalPrice !== null && originalPrice > unitPrice)
        ? Math.round((originalPrice - unitPrice) * qty)
        : 0;

      return {
        order_id: orderId,
        product_id: item.product_id,
        variant_id: item.variant_id ?? null,
        product_name_snapshot: item.product_name_snapshot,
        variant_name_snapshot: item.variant_name_snapshot ?? null,
        unit_price_snapshot: unitPrice,
        original_unit_price: originalPrice,
        discount_amount: discountAmount,
        quantity: qty,
        subtotal: Number(item.subtotal),
        weight_gram: Number(item.weight_gram) || 500,
      };
    });
    const { error: itemsError } = await supabase.from("order_items").insert(itemsPayload);
    if (itemsError) {
      // Cleanup: hapus order + customer (items gagal)
      await supabase.from("orders").delete().eq("id", orderId);
      await supabase.from("customers").delete().eq("id", customerId);
      return json({ error: "Failed to insert order_items", details: itemsError.message }, 500);
    }

    // ── Success ──
    // ⭐ v3: gateway-agnostic message (was: "Lanjutkan ke create-midtrans-transaction")
    const nextStepHint = paymentMethod === "doku"
      ? "Lanjutkan ke create-doku-payment untuk dapat payment URL."
      : paymentMethod === "midtrans_snap"
        ? "Lanjutkan ke create-midtrans-transaction untuk dapat Snap token."
        : `Lanjutkan ke payment integration untuk ${paymentMethod}.`;

    return json({
      success: true,
      order_id: orderId,
      customer_id: customerId,
      payment_method: paymentMethod,
      message: `Order saved. ${nextStepHint}`,
    });
  } catch (e) {
    console.error("[create-order]", e);
    return json({ error: e.message }, 500);
  }
});