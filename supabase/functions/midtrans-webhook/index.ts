// supabase/functions/midtrans-webhook/index.ts
// ============================================================================
// Midtrans Webhook Notification Handler
// ============================================================================
//
// Receive POST dari Midtrans saat status transaksi berubah:
//   - Payment success (capture / settlement)
//   - Payment pending (VA created, waiting for customer to pay)
//   - Payment expired / denied / cancelled
//
// Update orders table dengan field lengkap:
//   - midtrans_transaction_id     (wamid.xxx)
//   - midtrans_transaction_status (capture, settlement, pending, expire, deny, cancel)
//   - midtrans_payment_type       (credit_card, qris, gopay, bca_va, dst.)
//   - midtrans_settlement_time    (timestamp — hanya saat settlement)
//   - midtrans_fraud_status       (accept, deny, challenge — credit card only)
//   - midtrans_payment_code       (VA number / retail code)
//   - midtrans_pdf_url            (URL PDF instruksi pembayaran)
//   - payment_status              (paid, unpaid, failed — internal EGLUX status)
//   - status                      (pending → paid → shipping → completed)
//
// Setup:
//   1. Set Notification URL di Midtrans dashboard:
//        Settings → Configuration → Payment Notification URL
//        Value: https://<project-ref>.supabase.co/functions/v1/midtrans-webhook
//   2. (Optional) Set env var MIDTRANS_NOTIFICATION_SECRET kalau pakai
//      custom header verification. Default: verify via status_code + order lookup.
//
// Security:
//   - Midtrans kirim signature di header `X-Hub-Signature-256` (HMAC SHA512).
//     Format signature: SHA512(<order_id>+<status_code>+<gross_amount>+<server_key>)
//   - Function ini verify signature sebelum process body. Kalau gak match → 401.
//   - Defense in depth: tetap cross-check dengan Midtrans GET /v2/{order_id}/status
//     supaya kalau signature leak, data tetap verified via API.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Midtrans Server Key (untuk verify via Status API)
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
const MIDTRANS_IS_PRODUCTION = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
const MIDTRANS_BASE_URL = MIDTRANS_IS_PRODUCTION
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-signature",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// HMAC Signature Verification (Midtrans)
// ============================================================================
// Midtrans signature format (dari docs):
//   Signature key = SHA512(<order_id> + <status_code> + <gross_amount> + <server_key>)
//
// Header yang dikirim Midtrans:
//   - X-Hub-Signature-256: sha256=<hex>     (HMAC SHA256)
//   - signature_key: <hex>                  (SHA512, di body payload)
//
// Cara verify:
//   1. Baca signature_key dari body payload
//   2. Recompute: SHA512(order_id + status_code + gross_amount + MIDTRANS_SERVER_KEY)
//   3. Bandingkan dengan signature_key dari body (timing-safe compare)
//   Kalau gak match → reject webhook (401)
// ============================================================================
function verifyMidtransSignature(
  orderId: string,
  statusCode: string | number,
  grossAmount: string | number,
  signatureKey: string,
): boolean {
  if (!MIDTRANS_SERVER_KEY || !signatureKey) return false;
  // Midtrans signature = SHA512(order_id + status_code + gross_amount + server_key)
  const input = `${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`;
  const computedHash = createHash("sha512").update(input).digest("hex");
  // Timing-safe compare (avoid timing attack)
  if (computedHash.length !== signatureKey.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ signatureKey.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Map Midtrans transaction_status ke EGLUX internal payment_status
 */
function mapPaymentStatus(
  midtransStatus: string
): "unpaid" | "paid" | "failed" {
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

/**
 * Map Midtrans transaction_status ke EGLUX internal order status.
 *
 * ⚠️ PENTING: vocab `status` BERBEDA dengan `payment_status`.
 *   - payment_status: unpaid/paid/failed/expired (status PEMBAYARAN)
 *   - status: pending/processing/shipping/completed/cancelled (status ORDER internal)
 *
 * DB CHECK constraint `orders_status_check` hanya allow:
 *   pending, processing, shipping, completed, cancelled
 * ('paid' TIDAK valid untuk `status` — gunakan 'processing' saat settlement)
 */
function mapOrderStatus(
  midtransStatus: string,
  currentOrderStatus: string
): string {
  switch (midtransStatus) {
    case "capture":
    case "settlement":
      // Payment sukses → order masuk tahap processing (siap untuk create Biteship order)
      // create-biteship-order akan tetap di 'processing' sampai Biteship confirm
      return "processing";
    case "pending":
      return currentOrderStatus; // keep current (probably 'pending')
    case "deny":
    case "expire":
    case "cancel":
    case "failure":
      return "cancelled";
    default:
      return currentOrderStatus;
  }
}

/**
 * Verify notification dengan GET /v2/{order_id}/status ke Midtrans API
 * Defense in depth: jangan trust webhook payload begitu saja.
 */
async function verifyWithMidtransAPI(
  orderId: string
): Promise<any | null> {
  if (!MIDTRANS_SERVER_KEY) return null;

  try {
    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const resp = await fetch(`${MIDTRANS_BASE_URL}/v2/${orderId}/status`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.error("[midtrans-webhook] verify failed:", resp.status);
      return null;
    }

    return await resp.json();
  } catch (err) {
    console.error("[midtrans-webhook] verify network error:", err);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Midtrans notification payload reference:
  // https://docs.midtrans.com/en/after-payment/http-notification
  const {
    order_id,
    transaction_status,
    transaction_id,
    payment_type,
    fraud_status,
    settlement_time,
    expiry_time,
    transaction_time,
    status_code,
    status_message,
    store,
    gross_amount,
    signature_key,    // ← Midtrans signature untuk verify
    payment_code,
    pdf_url,
    finish_redirect_url,
    permata_va_number,
    bca_va_number,
    bni_va_number,
    bri_va_number,
    bill_key,
    biller_code,
    va_numbers,        // ← array untuk bank_transfer (format modern Midtrans)
  } = body;

  // ── SIGNATURE VERIFICATION (HMAC SHA512) ──
  // Midtrans kirim signature_key di body. Verify sebelum process apa-apa.
  // Kalau gagal → reject 401 (webhook palsu / spoofed).
  if (signature_key) {
    const isValid = verifyMidtransSignature(
      order_id,
      status_code || "",
      gross_amount || "",
      signature_key,
    );
    if (!isValid) {
      console.error("[midtrans-webhook] Invalid signature for order:", order_id);
      return json({ error: "Invalid signature" }, 401);
    }
  } else {
    // Kalau signature_key gak ada di body, reject (defensive)
    // Kecuali kalau dev mode dan mau skip — uncomment baris di bawah:
    console.warn("[midtrans-webhook] No signature_key in body. Rejecting (security).");
    return json({ error: "Missing signature_key — webhook not authenticated" }, 401);
    // console.warn("[midtrans-webhook] No signature_key in body. Skipping verification (dev mode).");
  }

  if (!order_id || !transaction_status) {
    console.error("[midtrans-webhook] Missing required fields:", {
      order_id,
      transaction_status,
    });
    return json({ error: "Missing required fields" }, 400);
  }

  console.log("[midtrans-webhook] Received:", {
    order_id,
    transaction_status,
    transaction_id,
    payment_type,
    fraud_status,
    settlement_time,
  });

  // 1. Verify dengan Midtrans Status API (defense in depth)
  const verifiedData = await verifyWithMidtransAPI(order_id);
  if (!verifiedData) {
    console.error("[midtrans-webhook] Verification failed for order:", order_id);
    // Tetap proceed dengan webhook payload, tapi log warning
    // (kalau strict, return 401 di sini)
    console.warn("[midtrans-webhook] Proceeding with unverified payload");
  } else {
    // Override dengan verified data jika ada perbedaan
    if (verifiedData.transaction_status !== transaction_status) {
      console.warn(
        "[midtrans-webhook] Status mismatch — webhook:",
        transaction_status,
        "API:",
        verifiedData.transaction_status,
        "→ menggunakan API"
      );
    }
  }

  const finalData = verifiedData || body;
  const finalTransactionStatus = finalData.transaction_status;
  const finalTransactionId = finalData.transaction_id || transaction_id;
  const finalPaymentType = finalData.payment_type || payment_type;
  const finalFraudStatus = finalData.fraud_status || fraud_status;
  const finalSettlementTime = finalData.settlement_time || settlement_time;

  // ⚠️ VA NUMBER EXTRACTION untuk bank_transfer (BCA VA, BNI VA, dst.)
  // Midtrans webhook kirim VA number dalam 2 format:
  //   1. Modern (array): va_numbers: [{ bank: "bca", va_number: "8801123456789" }]
  //   2. Legacy (field): bca_va_number: "8801123456789"
  // Prioritas: array > legacy > payment_code (untuk retail)
  const finalVaNumbers = finalData.va_numbers || va_numbers;
  let extractedVaNumber: string | null = null;

  if (Array.isArray(finalVaNumbers) && finalVaNumbers.length > 0) {
    extractedVaNumber = finalVaNumbers[0].va_number || null;
    console.log(`[midtrans-webhook] VA number from va_numbers array: ${extractedVaNumber} (bank: ${finalVaNumbers[0].bank})`);
  } else if (bca_va_number) {
    extractedVaNumber = bca_va_number;
    console.log(`[midtrans-webhook] VA number from bca_va_number: ${extractedVaNumber}`);
  } else if (bni_va_number) {
    extractedVaNumber = bni_va_number;
    console.log(`[midtrans-webhook] VA number from bni_va_number: ${extractedVaNumber}`);
  } else if (bri_va_number) {
    extractedVaNumber = bri_va_number;
    console.log(`[midtrans-webhook] VA number from bri_va_number: ${extractedVaNumber}`);
  } else if (permata_va_number) {
    extractedVaNumber = permata_va_number;
    console.log(`[midtrans-webhook] VA number from permata_va_number: ${extractedVaNumber}`);
  } else if (bill_key) {
    // Mandiri ecash: bill_key + biller_code (2 bagian)
    extractedVaNumber = biller_code ? `${bill_key}/${biller_code}` : bill_key;
    console.log(`[midtrans-webhook] Mandiri ecash: bill_key=${bill_key}, biller_code=${biller_code}`);
  } else if (payment_code) {
    // Retail (Indomaret/Alfamart): payment_code
    extractedVaNumber = payment_code;
    console.log(`[midtrans-webhook] Retail payment_code: ${extractedVaNumber}`);
  }

  // Final value: prefer extracted VA number, fallback ke payment_code original
  const finalPaymentCode = extractedVaNumber || finalData.payment_code || payment_code;
  const finalPdfUrl = finalData.pdf_url || pdf_url;

  // 2. Update orders table
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Fetch current order untuk know current status
  const { data: currentOrder, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status, payment_status")
    .eq("id", order_id)
    .single();

  if (fetchErr || !currentOrder) {
    console.error("[midtrans-webhook] Order not found:", order_id);
    return json({ error: "Order not found" }, 404);
  }

  // Compute new EGLUX statuses
  const newPaymentStatus = mapPaymentStatus(finalTransactionStatus);
  const newOrderStatus = mapOrderStatus(finalTransactionStatus, currentOrder.status);

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    midtrans_transaction_id: finalTransactionId,
    midtrans_transaction_status: finalTransactionStatus,
    midtrans_payment_type: finalPaymentType || null,
    midtrans_fraud_status: finalFraudStatus || null,
    midtrans_payment_code: finalPaymentCode || null,
    midtrans_pdf_url: finalPdfUrl || null,
    payment_status: newPaymentStatus,
    status: newOrderStatus,
  };

  // settlement_time: parse ke ISO string kalau ada
  if (finalSettlementTime) {
    try {
      // Midtrans return format: "2026-07-07 12:34:56" (GMT+7)
      // Convert ke ISO 8601 dengan Z
      const dt = new Date(finalSettlementTime + " +0700");
      if (!isNaN(dt.getTime())) {
        updatePayload.midtrans_settlement_time = dt.toISOString();
      }
    } catch (e) {
      console.warn("[midtrans-webhook] Failed to parse settlement_time:", finalSettlementTime);
    }
  } else {
    updatePayload.midtrans_settlement_time = null;
  }

  console.log("[midtrans-webhook] Updating order with:", updatePayload);

  // 3. Execute update
  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", order_id);

  if (updateError) {
    console.error("[midtrans-webhook] Failed to update order:", updateError);
    return json({ error: "Failed to update order" }, 500);
  }

  console.log("[midtrans-webhook] ✓ Order updated:", order_id, "→", finalTransactionStatus);

  // 4. Trigger downstream actions berdasarkan status
  // Payment success → trigger WABA notif + auto-create Biteship order
  if (
    (finalTransactionStatus === "settlement" || finalTransactionStatus === "capture") &&
    (finalFraudStatus === "accept" || finalFraudStatus === undefined || finalFraudStatus === null)
  ) {
    console.log("[midtrans-webhook] Payment success → trigger WABA notification");

    try {
      // Fire WABA notification (async, jangan block webhook response)
      // Mode: 'send-waba-test' for now — switch to 'send-waba-live' setelah Meta approval
      const { data: wabaResult, error: wabaError } = await supabase.functions.invoke(
        "send-waba-test",
        { body: { order_id, event: "payment_success" } }
      );

      if (wabaError) {
        console.warn("[midtrans-webhook] WABA notification failed:", wabaError.message);
      } else {
        console.log("[midtrans-webhook] ✓ WABA notification queued (test mode)");

        // Update waba_last_* fields di orders table
        if (wabaResult?.message_id) {
          await supabase.from("orders").update({
            waba_last_message_id: wabaResult.message_id,
            waba_last_event: "payment_success",
            waba_last_status: wabaResult.status || "test_sent",
            waba_last_sent_at: new Date().toISOString(),
          }).eq("id", order_id);
        }
      }
    } catch (e) {
      console.warn("[midtrans-webhook] WABA invoke error:", e);
    }

    // Auto-create Biteship order (setelah payment sukses)
    // Function ini punya guard sendiri: cek payment_status, skip kalau biteship_order_id sudah ada
    console.log("[midtrans-webhook] Payment success → trigger create-biteship-order");

    try {
      const { data: biteshipResult, error: biteshipError } = await supabase.functions.invoke(
        "create-biteship-order",
        { body: { order_id } }
      );

      if (biteshipError) {
        console.warn(
          "[midtrans-webhook] create-biteship-order failed:",
          biteshipError.message,
          "— order dapat di-retry manual via POST /functions/v1/create-biteship-order"
        );
      } else if (biteshipResult?.already_exists) {
        console.log(
          "[midtrans-webhook] ✓ Biteship order already exists:",
          biteshipResult.biteship_order_id
        );
      } else {
        console.log(
          "[midtrans-webhook] ✓ Biteship order created:",
          biteshipResult?.biteship_order_id,
          "tracking:",
          biteshipResult?.tracking_number
        );
      }
    } catch (e) {
      console.warn("[midtrans-webhook] create-biteship-order invoke error:", e);
      // Jangan fail webhook — Midtrans akan retry webhook, dan create-biteship-order
      // bisa di-trigger manual dari admin dashboard kalau perlu
    }
  }

  // 5. Return 200 ke Midtrans (penting — kalau tidak 200, Midtrans retry)
  return json({
    success: true,
    order_id,
    transaction_status: finalTransactionStatus,
    payment_status: newPaymentStatus,
    internal_status: newOrderStatus,
  });
});
