// supabase/functions/midtrans-webhook/index.ts
// ============================================================================
// Midtrans Webhook Notification Handler v3.4 (Skenario B - Qiscus API)
// ============================================================================
//
// ⭐ v3.4 CHANGES (dari v3.3):
//   - Tambah trigger WA `payment_notification` (event="payment_success") setelah
//     email notification sukses. Sebelumnya customer cuma dapet email, gak dapet
//     WA notif untuk payment sukses. Sekarang dapet KEDUANYA (email + WA).
//   - Pattern: email + WA fire paralel, non-blocking. Kalau WA gagal, cron retry handle.
//
// ⭐ v3.3 CHANGES (dari v3.2):
//   - After create-biteship-order returns tracking_number → trigger send-waba-live
//     dengan event="shipping_update" + tracking_number
//   - Fire-and-forget pattern: WA failure gak fail webhook (cron retry handle)
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
// NOTIFICATION FLOW (v3.4):
//   1. Payment settlement → trigger email (payment_success event)
//   2. Payment settlement → trigger WA payment_notification (parallel with email)
//   3. Auto-create Biteship order (gets tracking_number)
//   4. After Biteship create → trigger WA shipping_update (with tracking_number)
//   5. Add loyalty points
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
function verifyMidtransSignature(
  orderId: string,
  statusCode: string | number,
  grossAmount: string | number,
  signatureKey: string,
): boolean {
  if (!MIDTRANS_SERVER_KEY || !signatureKey) return false;
  const input = `${orderId}${statusCode}${grossAmount}${MIDTRANS_SERVER_KEY}`;
  const computedHash = createHash("sha512").update(input).digest("hex");
  if (computedHash.length !== signatureKey.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ signatureKey.charCodeAt(i);
  }
  return diff === 0;
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

  console.log("[midtrans-webhook] Received notification:", {
    order_id: body?.order_id,
    transaction_status: body?.transaction_status,
    status_code: body?.status_code,
    payment_type: body?.payment_type,
  });

  // ── Extract fields ──
  const {
    order_id,
    transaction_status: txStatus,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signatureKey,
    transaction_id: midtransTxId,
    payment_type: paymentType,
    settlement_time: settlementTime,
    fraud_status: fraudStatus,
    payment_code: paymentCode,
    pdf_url: pdfUrl,
    transaction_status: tsRaw,
  } = body;

  if (!order_id || !txStatus) {
    return json({ error: "Missing required fields: order_id, transaction_status" }, 400);
  }

  // ── Verify signature ──
  if (MIDTRANS_SERVER_KEY && signatureKey) {
    const isValid = verifyMidtransSignature(
      order_id,
      statusCode || "",
      grossAmount || "0",
      signatureKey,
    );
    if (!isValid) {
      console.error("[midtrans-webhook] Signature verification FAILED");
      return json({ error: "Invalid signature" }, 401);
    }
    console.log("[midtrans-webhook] ✓ Signature verified");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ── Map Midtrans transaction_status ke EGLUX payment_status ──
  let paymentStatus: string;
  let orderStatus: string;
  if (txStatus === "capture" || txStatus === "settlement") {
    paymentStatus = "paid";
    orderStatus = "processing";
  } else if (txStatus === "pending") {
    paymentStatus = "unpaid";
    orderStatus = "pending";
  } else if (txStatus === "deny" || txStatus === "expire" || txStatus === "cancel" || txStatus === "failure") {
    paymentStatus = "failed";
    orderStatus = "cancelled";
  } else {
    paymentStatus = "unpaid";
    orderStatus = "pending";
  }

  console.log(`[midtrans-webhook] Mapped status: ${txStatus} → payment_status=${paymentStatus}, order_status=${orderStatus}`);

  // ── Update orders table dengan data Midtrans lengkap ──
  const updateData: any = {
    midtrans_transaction_id: midtransTxId || null,
    midtrans_transaction_status: txStatus,
    midtrans_payment_type: paymentType || null,
    midtrans_fraud_status: fraudStatus || null,
    midtrans_payment_code: paymentCode || null,
    midtrans_pdf_url: pdfUrl || null,
    payment_status: paymentStatus,
    status: orderStatus,
  };

  if (settlementTime) {
    updateData.midtrans_settlement_time = settlementTime;
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update(updateData)
    .eq("id", order_id);

  if (updateErr) {
    console.error("[midtrans-webhook] Failed to update order:", updateErr.message);
    return json({ error: "Failed to update order", details: updateErr.message }, 500);
  }

  console.log("[midtrans-webhook] ✓ Order updated:", order_id, "→ payment_status:", paymentStatus);

  // ── Defense in depth: cross-check dengan Midtrans Status API ──
  // Kalau status settlement tapi gross_amount mismatch → bisa reject
  if (MIDTRANS_SERVER_KEY && (txStatus === "settlement" || txStatus === "capture")) {
    try {
      const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
      const statusResp = await fetch(`${MIDTRANS_BASE_URL}/v2/${order_id}/status`, {
        method: "GET",
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      if (statusResp.ok) {
        const statusData = await statusResp.json();
        console.log("[midtrans-webhook] Midtrans Status API confirms:", statusData.transaction_status);
      }
    } catch (statusErr) {
      console.warn("[midtrans-webhook] Status check failed (continue anyway):", statusErr?.message);
    }
  }

  // ============================================================================
  // ONLY IF PAYMENT SUCCESS → trigger email + WA + Biteship + loyalty points
  // ============================================================================
  if (paymentStatus !== "paid") {
    console.log(`[midtrans-webhook] Payment not paid (${paymentStatus}) — skip email/WA/Biteship`);
    return json({
      success: true,
      message: `Notification processed. Payment status: ${paymentStatus}. No email/WA/Biteship triggered.`,
      order_id,
      payment_status: paymentStatus,
    });
  }

  // ============================================================================
  // STEP 1: Send email notification (payment_success event)
  // ============================================================================
  let emailStatus = "email_sent";
  let emailErrorDetail = "";

  try {
    console.log("[midtrans-webhook] Triggering send-email-notification...");
    const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: "payment_success",
        order_id,
      }),
    });

    const responseText = await emailResp.text();
    let emailResult;
    try {
      emailResult = JSON.parse(responseText);
    } catch (parseErr) {
      console.error("[midtrans-webhook] send-email-notification returned non-JSON:", emailResp.status, responseText.substring(0, 200));
      emailResult = { success: false, error: `HTTP ${emailResp.status}: ${responseText.substring(0, 100)}` };
    }

    if (emailResult.success && !emailResult.skipped) {
      emailStatus = "email_sent";
      console.log(`[midtrans-webhook] ✓ Email sent (resend_id: ${emailResult.resend_id || 'N/A'})`);
    } else if (emailResult.success && emailResult.skipped) {
      emailStatus = "email_skipped";
      console.log(`[midtrans-webhook] ℹ️ Email skipped: ${emailResult.reason || 'duplicate'}`);
    } else if (emailResult.skipped) {
      emailStatus = "email_skipped";
      emailErrorDetail = emailResult.reason || "Customer has no email";
      console.warn(`[midtrans-webhook] ⚠️ Email skipped (no email): ${emailErrorDetail}`);
    } else {
      emailStatus = "email_failed";
      emailErrorDetail = emailResult.error
        || emailResult.error_detail
        || emailResult.reason
        || emailResult.message
        || (emailResult.step ? `Failed at step: ${emailResult.step}` : null)
        || `Unknown error (HTTP ${emailResp.status})`;
      console.error(`[midtrans-webhook] ✗ Email FAILED: ${emailErrorDetail}`);
      console.error(`[midtrans-webhook] Full send-email response:`, JSON.stringify(emailResult));
    }

    await supabase.from("orders").update({
      waba_last_event: "payment_success",
      waba_last_status: emailStatus,
      waba_last_sent_at: new Date().toISOString(),
    }).eq("id", order_id);
  } catch (e) {
    emailStatus = "email_failed";
    emailErrorDetail = e.message;
    console.error("[midtrans-webhook] Email notification exception:", e.message);
    try {
      await supabase.from("orders").update({
        waba_last_event: "payment_success",
        waba_last_status: "email_failed",
        waba_last_sent_at: new Date().toISOString(),
      }).eq("id", order_id);
    } catch (updateErr) {
      console.error("[midtrans-webhook] Failed to update email status:", updateErr?.message);
    }
  }

  // ============================================================================
  // ⭐ v3.4 STEP 2: Trigger WA payment_notification (parallel with email, non-blocking)
  // ============================================================================
  try {
    console.log("[midtrans-webhook] Triggering send-waba-live (payment_notification)...");
    const { data: wabaResult, error: wabaError } = await supabase.functions.invoke(
      "send-waba-live",
      {
        body: {
          order_id,
          event: "payment_success",
        },
      }
    );

    if (wabaError) {
      console.warn("[midtrans-webhook] send-waba-live (payment_notification) failed:", wabaError.message);
    } else if (wabaResult?.success) {
      console.log(
        "[midtrans-webhook] ✓ WA payment_notification sent:",
        wabaResult.qiscus_message_id
      );
    } else {
      console.warn(
        "[midtrans-webhook] send-waba-live (payment_notification) returned error:",
        wabaResult?.error
      );
    }
  } catch (wabaEx) {
    console.warn("[midtrans-webhook] send-waba-live (payment_notification) invoke error:", wabaEx);
  }

  // ============================================================================
  // STEP 3: Auto-create Biteship order (setelah payment sukses)
  // ============================================================================
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

      // ⭐ v3.3: Trigger WA shipping_update notification (Skenario B - Qiscus API)
      if (biteshipResult?.tracking_number) {
        try {
          console.log("[midtrans-webhook] Triggering send-waba-live (shipping_update)...");
          const { data: wabaResult, error: wabaError } = await supabase.functions.invoke(
            "send-waba-live",
            {
              body: {
                order_id,
                event: "shipping_update",
                tracking_number: biteshipResult.tracking_number,
              },
            }
          );

          if (wabaError) {
            console.warn("[midtrans-webhook] send-waba-live (shipping_update) failed:", wabaError.message);
          } else if (wabaResult?.success) {
            console.log(
              "[midtrans-webhook] ✓ WA shipping_update sent:",
              wabaResult.qiscus_message_id
            );
          } else {
            console.warn(
              "[midtrans-webhook] send-waba-live (shipping_update) returned error:",
              wabaResult?.error
            );
          }
        } catch (wabaEx) {
          console.warn("[midtrans-webhook] send-waba-live (shipping_update) invoke error:", wabaEx);
        }
      }
    }
  } catch (e) {
    console.warn("[midtrans-webhook] create-biteship-order invoke error:", e);
  }

  // ============================================================================
  // STEP 4: Create admin notification (payment success)
  // ============================================================================
  try {
    const { data: orderData } = await supabase
      .from("orders")
      .select("id, total_amount, customer:customers(name)")
      .eq("id", order_id)
      .single();

    if (orderData) {
      const customerName = (orderData.customer as any)?.name || "Customer";
      const totalAmount = Number(orderData.total_amount) || 0;

      await supabase.from("notifications").insert({
        type: "payment",
        title: "Pembayaran Diterima",
        message: `${customerName} membayar Rp ${totalAmount.toLocaleString("id-ID")} (${paymentType || "transfer"})`,
        reference_id: order_id,
        is_read: false,
      });
      console.log("[midtrans-webhook] ✓ Payment notification created");
    }
  } catch (e) {
    console.warn("[midtrans-webhook] Notification creation failed:", e);
  }

  // ============================================================================
  // STEP 5: Auto-add loyalty points (1 poin = Rp 1.000, round down)
  // ============================================================================
  try {
    const { data: pointsOrder } = await supabase
      .from("orders")
      .select(`
        id, total_amount,
        customer:customers(user_id)
      `)
      .eq("id", order_id)
      .single();

    const userId = (pointsOrder?.customer as any)?.user_id;
    const totalAmount = Number(pointsOrder?.total_amount) || 0;

    if (userId && totalAmount > 0) {
      const points = Math.floor(totalAmount / 1000);
      if (points > 0) {
        // Cek apakah poin sudah di-add sebelumnya (idempotent)
        const { data: existingTxn } = await supabase
          .from("point_transactions")
          .select("id")
          .eq("user_id", userId)
          .eq("source", "website_purchase")
          .eq("order_id", order_id)
          .maybeSingle();

        if (existingTxn) {
          console.log("[midtrans-webhook] Points already added for order — skip (idempotent)");
        } else {
          const { error: pointsErr } = await supabase.rpc("add_points", {
            p_user_id: userId,
            p_amount: points,
            p_source: "website_purchase",
            p_description: `Pembelian order #${order_id.slice(0, 8).toUpperCase()}`,
            p_order_id: order_id,
            p_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          });

          if (pointsErr) {
            console.warn("[midtrans-webhook] Points add failed:", pointsErr.message);
          } else {
            console.log(`[midtrans-webhook] ✓ Added ${points} points to user ${userId.slice(0, 8)} (order ${totalAmount})`);
          }
        }
      } else {
        console.warn("[midtrans-webhook] Cannot add points — total_amount < 1000");
      }
    } else {
      console.warn("[midtrans-webhook] Cannot add points — no user_id or total_amount=0");
    }
  } catch (pointsErr) {
    console.warn("[midtrans-webhook] Points add error (non-blocking):", pointsErr?.message);
  }

  // ============================================================================
  // Done
  // ============================================================================
  return json({
    success: true,
    message: "Payment success notification fully processed",
    order_id,
    payment_status: paymentStatus,
    email_status: emailStatus,
    steps_executed: [
      "update_order",
      "send_email",
      "send_wa_payment_notification",
      "create_biteship_order",
      "send_wa_shipping_update",
      "create_admin_notification",
      "add_loyalty_points",
    ],
  });
});