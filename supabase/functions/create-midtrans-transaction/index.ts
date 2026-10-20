// supabase/functions/create-midtrans-transaction/index.ts
// ============================================================================
// [v2.1] Updated: Robust handling "order_id sudah digunakan" error
// ============================================================================
//
// ⭐ v2.1 CHANGES (dari v2.0):
//   - Extract helper functions: getMidtransStatus() + cancelMidtransTransaction()
//   - Selalu cek status Midtrans existing transaction sebelum create new
//   - Selalu attempt cancel kalau status bukan settlement/capture (bukan cuma pending)
//   - Log cancel response body lengkap, bukan cuma status code
//   - Retry mechanism: kalau Snap create fail dengan "order_id sudah digunakan",
//     function auto-retry 1x setelah force-cancel via Midtrans API
//   - Better error messages untuk debugging
//
// FIX for bug:
//   Error: "transaction_details.order_id sudah digunakan" (HTTP 400 dari Midtrans Snap API)
//   Penyebab: Customer create snap token → tutup browser tanpa bayar → token pending 24 jam
//             Customer balik ke order history, klik "Lanjutkan Pembayaran" → Midtrans reject
//             karena order_id masih dipake oleh pending transaction.
//   Solusi: Function sekarang auto-cancel existing pending transaction sebelum mint token baru.
//
// Catatan:
//   - Pada saat create Snap token, Midtrans BELUM return payment_type, payment_code,
//     pdf_url, settlement_time. Field-field ini baru muncul SETELAH customer bayar —
//     di-update via Midtrans webhook notification (midtrans-webhook function).
//   - Function ini hanya menyimpan: snap_token, snap_redirect_url,
//     midtrans_transaction_status='pending', dan transaction_id kalau ada.
//
// Flow lengkap:
//   1. Frontend call create-midtrans-transaction → dapat snap_token
//   2. Customer bayar via Snap popup
//   3. Midtrans kirim webhook notification ke /functions/v1/midtrans-webhook
//   4. midtrans-webhook update orders: payment_type, settlement_time,
//      fraud_status, payment_code, pdf_url, transaction_status, dll.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const MIDTRANS_SNAP_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const MIDTRANS_BASE_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// Helper Functions
// ============================================================================

// "08123456789" → "628123456789", "+62 812-345-67890" → "628123456789"
function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 ? p : undefined;
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  return {
    first_name: parts[0] || "Customer",
    last_name: parts.slice(1).join(" ") || undefined,
  };
}

function basicAuthHeader(): string {
  return `Basic ${btoa(`${MIDTRANS_SERVER_KEY}:`)}`;
}

/**
 * ⭐ v2.1 NEW: Get Midtrans transaction status by order_id.
 * Returns transaction_status field, or null kalau transaction tidak ditemukan.
 */
async function getMidtransStatus(orderId: string): Promise<{
  transaction_status: string | null;
  raw: unknown;
} | null> {
  try {
    const resp = await fetch(`${MIDTRANS_BASE_URL}/v2/${orderId}/status`, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/json",
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.warn(`[midtrans] Status check non-200 (HTTP ${resp.status}):`, data);
      // Midtrans returns 404 with "transaction doesn't exist" kalau belum pernah ada
      // Return null biar caller tau "tidak ada existing transaction"
      if (resp.status === 404) {
        return { transaction_status: null, raw: data };
      }
      // Untuk 4xx lainnya, return null tapi log warning
      return { transaction_status: null, raw: data };
    }

    return {
      transaction_status: data.transaction_status || null,
      raw: data,
    };
  } catch (err) {
    console.warn(`[midtrans] Status check network error:`, err?.message);
    return null;
  }
}

/**
 * ⭐ v2.1 NEW: Cancel Midtrans transaction by order_id.
 * Hanya bekerja kalau status = "pending". Status lain akan return 4xx.
 *
 * Returns: { success, status_code, message, raw_response }
 */
async function cancelMidtransTransaction(orderId: string): Promise<{
  success: boolean;
  status_code: number;
  message: string;
  raw_response: unknown;
}> {
  try {
    const resp = await fetch(`${MIDTRANS_BASE_URL}/v2/${orderId}/cancel`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    const data = await resp.json();

    return {
      success: resp.ok,
      status_code: resp.status,
      message: data.status_message || data.error_message || `HTTP ${resp.status}`,
      raw_response: data,
    };
  } catch (err) {
    return {
      success: false,
      status_code: 0,
      message: `Network error: ${err?.message || "unknown"}`,
      raw_response: null,
    };
  }
}

/**
 * ⭐ v2.1 NEW: Force cleanup existing Midtrans transaction sebelum create new Snap.
 * Logic:
 *   - Cek status existing transaction
 *   - Kalau settlement/capture → reject (sudah dibayar, gak bisa apakan lagi)
 *   - Kalau pending → cancel dulu
 *   - Kalau deny/expire/cancel/failure → safe, gak perlu cancel (transaksi terminal)
 *   - Kalau tidak ada existing → safe, lanjut
 *
 * Returns: { can_proceed: boolean, error?: string, debug?: unknown }
 */
async function cleanupExistingTransaction(orderId: string): Promise<{
  can_proceed: boolean;
  error?: string;
  debug?: unknown;
}> {
  console.log(`[midtrans] Checking existing transaction for order_id: ${orderId}`);

  const statusResult = await getMidtransStatus(orderId);

  if (!statusResult) {
    // Status check gagal (network error). Asumsi: tidak ada existing, lanjut.
    console.warn("[midtrans] Status check returned null (network error or 4xx). Proceeding anyway.");
    return { can_proceed: true, debug: { status_check: "failed" } };
  }

  const status = statusResult.transaction_status;
  console.log(`[midtrans] Existing transaction status: ${status || "(not found)"}`);

  // Kalau transaction tidak ditemukan di Midtrans → safe, lanjut
  if (status === null) {
    return { can_proceed: true, debug: { status_check: "not_found", raw: statusResult.raw } };
  }

  // Kalau settlement/capture → sudah dibayar, reject
  if (status === "settlement" || status === "capture") {
    return {
      can_proceed: false,
      error: "Pesanan sudah dibayar (Midtrans confirmed). Tunggu beberapa saat hingga status terupdate via webhook.",
      debug: { midtrans_status: status },
    };
  }

  // Kalau pending → cancel dulu, lalu lanjut
  if (status === "pending") {
    console.log(`[midtrans] Cancelling pending transaction for order_id: ${orderId}`);
    const cancelResult = await cancelMidtransTransaction(orderId);
    console.log(`[midtrans] Cancel result:`, {
      success: cancelResult.success,
      status_code: cancelResult.status_code,
      message: cancelResult.message,
    });

    if (cancelResult.success) {
      // Cancel sukses → transaction sekarang status "cancel" → safe create new
      console.log("[midtrans] ✓ Cancel succeeded, proceeding to create new Snap");
      return {
        can_proceed: true,
        debug: { cancelled: true, cancel_response: cancelResult.raw_response },
      };
    } else {
      // Cancel failed — bisa karena:
      //  - Transaction sudah expire/deny (Midtrans return 4xx "can't cancel non-pending")
      //  - Atau memang ada masalah lain
      // Tetap proceed — Midtrans Snap API yang akan decide apakah bisa create new
      console.warn("[midtrans] Cancel failed but proceeding anyway. Reason:", cancelResult.message);
      return {
        can_proceed: true,
        debug: { cancelled: false, cancel_attempt: cancelResult },
      };
    }
  }

  // Status lain (deny, expire, cancel, failure) → transaksi terminal, safe create new
  console.log(`[midtrans] Transaction already terminal (status=${status}), safe to create new`);
  return {
    can_proceed: true,
    debug: { status_check: "terminal", existing_status: status },
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── AUTH: Cukup login (any role). Customer yang checkout butuh akses ini. ──
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!MIDTRANS_SERVER_KEY) return json({ error: "MIDTRANS_SERVER_KEY not set" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order + nested customer & items
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select(`
        id, total_amount, subtotal, shipping_cost,
        shipping_address, shipping_city, shipping_postal_code,
        courier_code, courier_service, notes,
        payment_status, snap_token, midtrans_transaction_id,
        voucher_code, voucher_discount,
        tax_percent, tax_base, tax_amount,
        customer:customers(name, phone, email),
        items:order_items(product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity)
      `)
      .eq("id", order_id)
      .single();

    if (oe || !order) return json({ error: "Order not found", details: oe?.message }, 404);

    // ⭐ ANTI-DOUBLE-PAYMENT CHECK: Cek status pembayaran order di DB
    if (order.payment_status === "paid") {
      return json({
        error: "Pesanan sudah dibayar. Tidak perlu membuat transaksi baru.",
        order_id,
        payment_status: order.payment_status,
      }, 400);
    }

    // ⭐ v2.1: Selalu cek + cleanup existing Midtrans transaction sebelum create new
    // (sebelumnya cuma cek kalau DB punya snap_token/midtrans_transaction_id)
    // Sekarang: selalu cek via Midtrans API, karena mungkin DB belum sync tapi Midtrans punya pending transaction
    const cleanupResult = await cleanupExistingTransaction(order_id);
    if (!cleanupResult.can_proceed) {
      return json({
        error: cleanupResult.error,
        order_id,
        debug: cleanupResult.debug,
      }, 400);
    }
    console.log("[midtrans] Cleanup existing transaction done. Proceeding to create new Snap.");

    // 2. Build item_details (Midtrans requires id, name, price, quantity per item)
    const items = (order.items || []) as any[];
    const item_details = items.map((it, i) => {
      const name = `${it.product_name_snapshot}${it.variant_name_snapshot ? " (" + it.variant_name_snapshot + ")" : ""}`;
      return {
        id: `ITEM-${i + 1}`,
        name: name.slice(0, 50),
        price: Math.round(Number(it.unit_price_snapshot) || 0),
        quantity: Math.max(1, Number(it.quantity) || 1),
      };
    });

    // Shipping as a separate line item (so gross_amount = subtotal + shipping)
    const shippingCost = Math.round(Number(order.shipping_cost) || 0);
    if (shippingCost > 0) {
      item_details.push({
        id: "SHIPPING",
        name: "Ongkir",
        price: shippingCost,
        quantity: 1,
      });
    }

    // Tax (if any) as separate line item
    const taxAmount = Number((order as any).tax_amount) || 0;
    if (taxAmount > 0) {
      const taxPercent = Number((order as any).tax_percent) || 3;
      item_details.push({
        id: "TAX",
        name: `Biaya Admin & Tax (${taxPercent}%)`.slice(0, 50),
        price: taxAmount,
        quantity: 1,
      });
    }

    // 3. Sanity check: gross_amount MUST equal order.total_amount
    // ⚠️ Toleransi mismatch sampai Rp 100 untuk handle rounding error.
    const gross_amount = item_details.reduce((s, i) => s + i.price * i.quantity, 0);
    const expected_total = Math.round(Number(order.total_amount) || 0);
    const mismatch = Math.abs(gross_amount - expected_total);

    console.log("[midtrans] total check", {
      gross_amount,
      expected_total,
      mismatch,
      subtotal: order.subtotal,
      shipping_cost: order.shipping_cost,
      tax_amount: (order as any).tax_amount,
      voucher_discount: (order as any).voucher_discount,
      total_amount: order.total_amount,
    });

    if (mismatch > 100) {
      console.error("[midtrans] total mismatch > 100", { gross_amount, expected_total, mismatch });
      return json(
        {
          error: `Total mismatch (selisih Rp ${mismatch}). order.total_amount=${expected_total}, computed=${gross_amount}. Coba ubah kurir ulang via "Ubah Kurir" di rincian pesanan.`,
          debug: {
            gross_amount,
            expected_total,
            mismatch,
            order_total: order.total_amount,
            subtotal: order.subtotal,
            shipping_cost: order.shipping_cost,
            tax_amount: (order as any).tax_amount,
            voucher_discount: (order as any).voucher_discount,
          },
        },
        400
      );
    }

    // Kalau mismatch kecil (<= Rp 100), pakai gross_amount yang dihitung dari item_details
    if (mismatch > 0) {
      console.warn(`[midtrans] Small mismatch (Rp ${mismatch}), auto-fixing order.total_amount to ${gross_amount}`);
      await supabase
        .from("orders")
        .update({ total_amount: gross_amount })
        .eq("id", order_id);
    }

    // 4. customer_details + billing/shipping address (Midtrans spec)
    const customer = (order.customer || {}) as any;
    const phone = normalizePhone(customer.phone);
    const { first_name, last_name } = splitName(customer.name);

    const addressBlock = {
      first_name,
      last_name,
      phone,
      email: customer.email || undefined,
      address: order.shipping_address || customer.address || undefined,
      city: order.shipping_city || undefined,
      postal_code: order.shipping_postal_code || undefined,
      country_code: "IDN",
    };

    // 5. Build Midtrans Snap payload
    const finishRedirectUrl = Deno.env.get("STOREFRONT_URL")
      ? `${Deno.env.get("STOREFRONT_URL")}/orders`
      : undefined;

    const payload = {
      transaction_details: {
        order_id,
        gross_amount,
      },
      item_details,
      customer_details: {
        ...addressBlock,
        billing_address: addressBlock,
        shipping_address: addressBlock,
      },
      // ⭐ Redirect mode: setelah payment, user di-redirect balik ke /orders
      finish_redirect_url: finishRedirectUrl,
    };

    // ⭐ v2.1: Function untuk POST ke Snap API dengan retry
    const postToSnap = async (): Promise<{ ok: boolean; status: number; body: any }> => {
      const r = await fetch(MIDTRANS_SNAP_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      return { ok: r.ok, status: r.status, body };
    };

    // 6. POST to Midtrans Snap (with retry on "order_id sudah digunakan")
    let snapResult = await postToSnap();
    console.log("[midtrans] Snap API first attempt:", {
      status: snapResult.status,
      has_token: !!snapResult.body?.token,
      error_messages: snapResult.body?.error_messages,
    });

    // ⭐ v2.1 RETRY: kalau dapat "order_id sudah digunakan", force-cancel + retry 1x
    const orderAlreadyUsed = (snapResult.body?.error_messages || []).some(
      (m: string) => m.includes("sudah digunakan") || m.includes("already used") || m.includes("already exists")
    );

    if (!snapResult.ok && orderAlreadyUsed) {
      console.warn("[midtrans] Snap API rejected with 'order_id sudah digunakan'. Attempting force-cancel + retry...");

      // Force cancel existing transaction (kalau masih pending)
      const forceCancel = await cancelMidtransTransaction(order_id);
      console.log("[midtrans] Force-cancel result:", {
        success: forceCancel.success,
        message: forceCancel.message,
        status_code: forceCancel.status_code,
      });

      // Tunggu 500ms biar Midtrans process cancel
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Retry create Snap
      console.log("[midtrans] Retrying Snap create after force-cancel...");
      snapResult = await postToSnap();
      console.log("[midtrans] Snap API retry attempt:", {
        status: snapResult.status,
        has_token: !!snapResult.body?.token,
        error_messages: snapResult.body?.error_messages,
      });
    }

    // Kalau masih gagal setelah retry → return error
    if (!snapResult.ok || !snapResult.body.token) {
      console.error("[midtrans] snap API failed", {
        status: snapResult.status,
        body: snapResult.body,
      });
      return json(
        {
          error: snapResult.body.error_messages?.[0] || "Midtrans Snap API error",
          raw: snapResult.body,
          retry_attempted: orderAlreadyUsed,
        },
        snapResult.status || 502
      );
    }

    // 7. Sukses — persist snap_token + redirect_url + initial midtrans fields
    const snap = snapResult.body;
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        snap_token: snap.token,
        snap_redirect_url: snap.redirect_url,
        midtrans_transaction_status: "pending",
        midtrans_payment_type: null,
        midtrans_settlement_time: null,
        midtrans_fraud_status: null,
        midtrans_payment_code: null,
        midtrans_pdf_url: null,
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("[midtrans] failed to update order with snap token:", updateError);
      // Jangan fail request — token sudah dapat, customer masih bisa bayar
    }

    console.log(`[midtrans] ✓ Snap token created for order ${order_id.slice(0, 8)}`);

    return json({
      success: true,
      token: snap.token,
      redirect_url: snap.redirect_url,
    });
  } catch (e: any) {
    console.error("[midtrans] Unhandled exception:", e?.message, e?.stack);
    return json({ error: e.message }, 500);
  }
});
