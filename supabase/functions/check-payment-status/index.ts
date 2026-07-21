// supabase/functions/check-payment-status/index.ts
// ============================================================================
// check-payment-status — Cek status pembayaran langsung ke Midtrans API
// ============================================================================
//
// Kapan dipanggil?
//   Setelah user bayar via Midtrans Snap popup, frontend polling endpoint ini
//   tiap 3 detik untuk instant notification (gak nunggu webhook Midtrans yang
//   bisa delay 5-30 detik di sandbox).
//
// Flow:
//   1. User login (requireAuthenticated)
//   2. POST { order_id: "EGLUX UUID" }
//   3. Fetch order dari DB (verify ownership)
//   4. Call Midtrans API: GET /v2/{order_id}/status
//   5. Kalau status = settlement/capture → update DB (paid) + return paid
//   6. Kalau status = pending → return pending
//   7. Kalau status = deny/expire/cancel → return failed
//
// Cara panggil:
//   POST /functions/v1/check-payment-status
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { "order_id": "uuid" }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIDTRANS_BASE_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;

function mapPaymentStatus(midtransStatus: string): "unpaid" | "paid" | "failed" {
  switch (midtransStatus) {
    case "capture":
    case "settlement":
      return "paid";
    case "pending":
      return "unpaid";
    case "deny":
    case "expire":
    case "cancel":
    case "failure":
      return "failed";
    default:
      return "unpaid";
  }
}

function mapOrderStatus(midtransStatus: string, currentStatus: string): string {
  switch (midtransStatus) {
    case "capture":
    case "settlement":
      return "processing"; // bayar sukses → processing (siap create Biteship order)
    case "pending":
      return currentStatus; // tetap pending
    case "deny":
    case "expire":
    case "cancel":
    case "failure":
      return "cancelled";
    default:
      return currentStatus;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!MIDTRANS_SERVER_KEY) return json({ error: "MIDTRANS_SERVER_KEY not set" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order dari DB + verify ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id, status, payment_status, total_amount,
        midtrans_transaction_id, midtrans_transaction_status,
        midtrans_payment_type, midtrans_settlement_time,
        customer:customers(email)
      `)
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return json({ error: "Order not found" }, 404);
    }

    const customerEmail = (order.customer as any)?.email;
    if (customerEmail !== authResult.user!.email) {
      return json({ error: "Unauthorized: this order does not belong to you" }, 403);
    }

    // 2. Call Midtrans API: GET /v2/{order_id}/status
    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const midtransResp = await fetch(`${MIDTRANS_BASE_URL}/v2/${order_id}/status`, {
      method: "GET",
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });

    if (!midtransResp.ok) {
      const errData = await midtransResp.json().catch(() => ({}));
      console.error("[check-payment-status] Midtrans API error:", midtransResp.status, errData);
      // Kalau 404 dari Midtrans (transaction not found), return current DB status
      if (midtransResp.status === 404) {
        return json({
          success: true,
          order_id,
          payment_status: order.payment_status,
          order_status: order.status,
          source: "db",
          message: "Transaksi belum dibuat di Midtrans",
        });
      }
      return json({
        error: "Midtrans API error",
        details: errData,
      }, 502);
    }

    const midtransData = await midtransResp.json();
    const midtransStatus = midtransData.transaction_status;
    const newPaymentStatus = mapPaymentStatus(midtransStatus);
    const newOrderStatus = mapOrderStatus(midtransStatus, order.status);

    console.log("[check-payment-status] Midtrans status:", {
      order_id,
      midtrans_status: midtransStatus,
      mapped_payment: newPaymentStatus,
      mapped_order: newOrderStatus,
      db_payment: order.payment_status,
    });

    // 3. Update DB kalau status berubah (paid/failed)
    let dbUpdated = false;
    if (newPaymentStatus !== order.payment_status) {
      const updatePayload: Record<string, unknown> = {
        payment_status: newPaymentStatus,
        status: newOrderStatus,
        midtrans_transaction_id: midtransData.transaction_id || order.midtrans_transaction_id,
        midtrans_transaction_status: midtransStatus,
        midtrans_payment_type: midtransData.payment_type || order.midtrans_payment_type,
        midtrans_fraud_status: midtransData.fraud_status || null,
      };

      // settlement_time
      if (midtransData.settlement_time) {
        try {
          const dt = new Date(midtransData.settlement_time + " +0700");
          if (!isNaN(dt.getTime())) {
            updatePayload.midtrans_settlement_time = dt.toISOString();
          }
        } catch (e) {}
      }

      // payment_code + pdf_url untuk VA/retail
      if (midtransData.payment_code) {
        updatePayload.midtrans_payment_code = midtransData.payment_code;
      }
      if (midtransData.pdf_url) {
        updatePayload.midtrans_pdf_url = midtransData.pdf_url;
      }

      const { error: updateErr } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", order_id);

      if (updateErr) {
        console.error("[check-payment-status] DB update failed:", updateErr);
      } else {
        dbUpdated = true;
        console.log("[check-payment-status] ✓ DB updated:", { order_id, newPaymentStatus, newOrderStatus });
      }
    }

    // 4. Return result
    return json({
      success: true,
      order_id,
      payment_status: newPaymentStatus,
      order_status: newOrderStatus,
      midtrans_status: midtransStatus,
      midtrans_payment_type: midtransData.payment_type || null,
      midtrans_settlement_time: midtransData.settlement_time || null,
      db_updated: dbUpdated,
      source: "midtrans_api",
      raw_midtrans: midtransData, // untuk debugging
    });
  } catch (e) {
    console.error("[check-payment-status]", e);
    return json({ error: e.message }, 500);
  }
});
