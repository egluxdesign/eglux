// supabase/functions/midtrans-webhook/index.ts
// ============================================================================
// Midtrans Webhook Notification Handler v3.4.1 (PATCHED AUTH FIX)
// ============================================================================
//
// ⭐ v3.4.1 PATCH (dari v3.4):
//   - FIX BUG: Ganti supabase.functions.invoke → fetch dengan Authorization
//     header eksplisit. Sebelumnya, send-waba-live ngereturn 401
//     "Missing Authorization header" karena supabase.functions.invoke
//     gak selalu set Authorization header dengan benar di edge function
//     context. Fix ini memastikan Authorization: Bearer <SERVICE_ROLE_KEY>
//     selalu dikirim → auth.ts service_role bypass jalan → send-waba-live
//     bisa lanjut ke saveWabaMessage() → row muncul di waba_messages.
//
// ⭐ v3.4 CHANGES (dari v3.3):
//   - Tambah trigger WA payment_notification (event="payment_success")
//
// ⭐ v3.3 CHANGES (dari v3.2):
//   - After Biteship create → trigger send-waba-live (shipping_update)
//
// NOTIFICATION FLOW (v3.4.1):
//   1. Payment settlement → trigger email (payment_success)
//   2. Payment settlement → trigger WA payment_notification (FETCH with Authorization)
//   3. Auto-create Biteship order (gets tracking_number)
//   4. After Biteship create → trigger WA shipping_update (FETCH with Authorization)
//   5. Add loyalty points
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// ⭐ v3.4.1 NEW: Helper untuk invoke send-waba-live pakai fetch + Authorization eksplisit
// Pattern ini dijamin work karena auth.ts detect service_role bypass dari Authorization header
async function triggerWabaNotification(
  event: "payment_success" | "shipping_update",
  order_id: string,
  tracking_number?: string,
  context: string = "midtrans-webhook"
): Promise<{ success: boolean; data?: any; error?: string; httpStatus?: number }> {
  const requestBody: any = { order_id, event };
  if (tracking_number) {
    requestBody.tracking_number = tracking_number;
  }

  console.log(`[${context}] Triggering send-waba-live (${event})...`, { order_id, tracking_number: tracking_number || "(none)" });

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-waba-live`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,  // ⭐ EKSPLISIT
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[${context}] send-waba-live (${event}) HTTP status:`, response.status);

    // Parse response — handle non-JSON gracefully
    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`[${context}] send-waba-live (${event}) returned non-JSON:`, responseText.substring(0, 200));
      result = {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 100)}`,
      };
    }

    if (!response.ok) {
      console.warn(`[${context}] ✗ send-waba-live (${event}) HTTP ${response.status}:`, result?.error || result);
      return {
        success: false,
        data: result,
        error: result?.error || `HTTP ${response.status}`,
        httpStatus: response.status,
      };
    }

    if (result?.success) {
      console.log(`[${context}] ✓ WA ${event} sent:`, result.qiscus_message_id);
    } else {
      console.warn(`[${context}] send-waba-live (${event}) returned non-success:`, result?.error);
    }

    return { success: !!result?.success, data: result, httpStatus: response.status };
  } catch (err) {
    console.error(`[${context}] send-waba-live (${event}) invoke error:`, err?.message);
    return { success: false, error: err?.message };
  }
}

// ============================================================================
// Midtrans Signature Verification
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
  } = body;

  if (!order_id || !txStatus) {
    return json({ error: "Missing required fields: order_id, transaction_status" }, 400);
  }

  // Verify signature
  if (MIDTRANS_SERVER_KEY && signatureKey) {
    const isValid = verifyMidtransSignature(order_id, statusCode || "", grossAmount || "0", signatureKey);
    if (!isValid) {
      console.error("[midtrans-webhook] Signature verification FAILED");
      return json({ error: "Invalid signature" }, 401);
    }
    console.log("[midtrans-webhook] ✓ Signature verified");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Map Midtrans transaction_status ke EGLUX payment_status
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

  // Update orders table
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

  // Cross-check dengan Midtrans Status API
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
  try {
    console.log("[midtrans-webhook] Triggering send-email-notification...");
    const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "payment_success", order_id }),
    });

    const responseText = await emailResp.text();
    let emailResult;
    try {
      emailResult = JSON.parse(responseText);
    } catch (parseErr) {
      emailResult = { success: false, error: `HTTP ${emailResp.status}: ${responseText.substring(0, 100)}` };
    }

    if (emailResult.success && !emailResult.skipped) {
      emailStatus = "email_sent";
      console.log(`[midtrans-webhook] ✓ Email sent (resend_id: ${emailResult.resend_id || 'N/A'})`);
    } else if (emailResult.success && emailResult.skipped) {
      emailStatus = "email_skipped";
      console.log(`[midtrans-webhook] ℹ️ Email skipped: ${emailResult.reason || 'duplicate'}`);
    } else {
      emailStatus = "email_failed";
      console.error(`[midtrans-webhook] ✗ Email FAILED:`, emailResult.error || emailResult);
    }

    await supabase.from("orders").update({
      waba_last_event: "payment_success",
      waba_last_status: emailStatus,
      waba_last_sent_at: new Date().toISOString(),
    }).eq("id", order_id);
  } catch (e) {
    emailStatus = "email_failed";
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
  // ⭐ v3.4.1 STEP 2: Trigger WA payment_notification (FETCH with explicit Authorization)
  // ============================================================================
  const paymentNotifResult = await triggerWabaNotification(
    "payment_success",
    order_id,
    undefined,  // tracking_number tidak diperlukan untuk payment_notification
    "midtrans-webhook"
  );

  // ============================================================================
  // STEP 3: Auto-create Biteship order
  // ============================================================================
  console.log("[midtrans-webhook] Payment success → trigger create-biteship-order");
  let biteshipTrackingNumber: string | undefined;

  try {
    // create-biteship-order juga pakai fetch dengan Authorization eksplisit (ganti dari invoke)
    const biteshipResp = await fetch(`${SUPABASE_URL}/functions/v1/create-biteship-order`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ order_id }),
    });

    const responseText = await biteshipResp.text();
    let biteshipResult;
    try {
      biteshipResult = JSON.parse(responseText);
    } catch (parseErr) {
      biteshipResult = { success: false, error: `HTTP ${biteshipResp.status}: ${responseText.substring(0, 100)}` };
    }

    if (biteshipResult?.already_exists) {
      console.log("[midtrans-webhook] ✓ Biteship order already exists:", biteshipResult.biteship_order_id);
      biteshipTrackingNumber = biteshipResult?.tracking_number;
    } else if (biteshipResult?.success !== false && biteshipResult?.biteship_order_id) {
      console.log("[midtrans-webhook] ✓ Biteship order created:", biteshipResult.biteship_order_id, "tracking:", biteshipResult.tracking_number);
      biteshipTrackingNumber = biteshipResult.tracking_number;
    } else {
      console.warn("[midtrans-webhook] create-biteship-order failed:", biteshipResult?.error || biteshipResult);
    }
  } catch (e) {
    console.warn("[midtrans-webhook] create-biteship-order fetch error:", e.message);
  }

  // ============================================================================
  // ⭐ v3.4.1 STEP 4: After Biteship create → trigger WA shipping_update
  // ============================================================================
  if (biteshipTrackingNumber) {
    await triggerWabaNotification(
      "shipping_update",
      order_id,
      biteshipTrackingNumber,
      "midtrans-webhook"
    );
  } else {
    console.warn("[midtrans-webhook] No tracking_number from Biteship — skip shipping_update WA");
  }

  // ============================================================================
  // STEP 5: Create admin notification
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
  // STEP 6: Auto-add loyalty points
  // ============================================================================
  try {
    const { data: pointsOrder } = await supabase
      .from("orders")
      .select(`id, total_amount, customer:customers(user_id)`)
      .eq("id", order_id)
      .single();

    const userId = (pointsOrder?.customer as any)?.user_id;
    const totalAmount = Number(pointsOrder?.total_amount) || 0;

    if (userId && totalAmount > 0) {
      const points = Math.floor(totalAmount / 1000);
      if (points > 0) {
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
            console.log(`[midtrans-webhook] ✓ Added ${points} points to user ${userId.slice(0, 8)}`);
          }
        }
      }
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
    wa_payment_notification: {
      success: paymentNotifResult.success,
      error: paymentNotifResult.error,
    },
    wa_shipping_update: {
      tracking_number: biteshipTrackingNumber || null,
      triggered: !!biteshipTrackingNumber,
    },
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