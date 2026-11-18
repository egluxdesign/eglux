// doku-webhook/index.ts
// Edge function: receive DOKU payment notification
// DOKU sends HTTP POST notification when payment status changes (SUCCESS/FAIL/PENDING)
//
// Setup in DOKU Dashboard:
//   Settings > Notifications > HTTP Notifications
//   URL: https://<your-supabase-project>.supabase.co/functions/v1/doku-webhook
//
// Signature verification (Non-SNAP format):
//   Component = "Client-Id:"+cid+"\n"+"Request-Id:"+rid+"\n"+"Request-Timestamp:"+ts+"\n"+"Request-Target:"+path+"\n"+"Digest:"+base64(sha256(body))
//   Expected  = "HMACSHA256=Base64(HMAC-SHA256(secret, component))"
//   Compare to incoming Signature header
//
// Required Supabase secrets:
//   DOKU_CLIENT_ID     e.g. BRN-0287-1793256156382
//   DOKU_SECRET_KEY    e.g. SK-En***...
//   DOKU_WEBHOOK_PATH  e.g. /functions/v1/doku-webhook (used in signature verification)
//   SUPABASE_URL       auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------- crypto helpers ----------

async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64Encode(new Uint8Array(hash));
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64Encode(new Uint8Array(sig));
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  // Always return 200 for HEAD/GET (DOKU install verification)
  if (req.method === "HEAD" || req.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SUPABASE_PROJECT_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("DOKU_CLIENT_ID");
  const secretKey = Deno.env.get("DOKU_SECRET_KEY");
  const webhookPath = Deno.env.get("DOKU_WEBHOOK_PATH") || "/functions/v1/doku-webhook";

  // Capture raw body bytes FIRST — needed for signature verification
  const rawBody = await req.text();

  // Parse JSON body (best-effort)
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // DOKU sometimes sends empty body on install
    return new Response("ok", { status: 200 });
  }

  // Empty body → likely install verification, return 200
  if (!payload || Object.keys(payload).length === 0) {
    return new Response("ok", { status: 200 });
  }

  // ---------- Verify signature ----------
  const headerClientId = req.headers.get("Client-Id") || "";
  const headerRequestId = req.headers.get("Request-Id") || "";
  const headerTimestamp = req.headers.get("Request-Timestamp") || "";
  const headerSignature = req.headers.get("Signature") || "";

  let signatureValid = false;
  if (clientId && secretKey && headerClientId && headerRequestId && headerTimestamp && headerSignature) {
    try {
      const digest = await sha256Base64(rawBody);
      const component =
        `Client-Id:${headerClientId}\n` +
        `Request-Id:${headerRequestId}\n` +
        `Request-Timestamp:${headerTimestamp}\n` +
        `Request-Target:${webhookPath}\n` +
        `Digest:${digest}`;
      const expectedSig = `HMACSHA256=${await hmacSha256Base64(secretKey, component)}`;
      signatureValid = timingSafeEqual(expectedSig, headerSignature);
    } catch (e) {
      console.error("Signature verification error:", e);
    }
  }

  // Always return 200 to DOKU even if signature fails (so they don't retry)
  // But don't update DB if signature invalid
  if (!signatureValid) {
    console.warn("DOKU webhook signature invalid", {
      headerClientId,
      headerRequestId,
      headerTimestamp,
      headerSignaturePresent: !!headerSignature,
    });
    // Return 200 to stop retries, but don't process
    return new Response(JSON.stringify({ status: "ignored", reason: "signature_invalid" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---------- Parse transaction info ----------
  // DOKU notification body structure:
  //   order.invoice_number, order.amount
  //   transaction.status, transaction.transaction_id, transaction.payment_type, transaction.payment_channel
  const invoiceNumber = payload?.order?.invoice_number;
  const amount = Number(payload?.order?.amount || 0);
  const txStatus = (payload?.transaction?.status || "").toUpperCase();
  const txId = payload?.transaction?.transaction_id || "";
  const txDate = payload?.transaction?.transaction_date || "";
  const paymentType = payload?.transaction?.payment_type || "";
  const paymentChannel = payload?.transaction?.payment_channel || "";

  if (!invoiceNumber) {
    console.warn("DOKU webhook missing invoice_number");
    return new Response(JSON.stringify({ status: "ignored", reason: "no_invoice" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ⭐ FIX v3.4: Map DOKU status → EGLUX statuses (mirror midtrans-webhook EXACTLY)
  //   payment_status: unpaid/paid/failed (tracks PAYMENT state)
  //   orders.status: pending/processing/cancelled (tracks ORDER fulfillment state)
  //   DOKU SUCCESS → payment_status=paid, orders.status=processing (NOT "paid"!)
  //   (midtrans-webhook also maps settlement→processing, NOT→paid)
  let paymentStatus = "unpaid";
  let orderStatus = "pending";
  if (txStatus === "SUCCESS") {
    paymentStatus = "paid";
    orderStatus = "processing";  // payment success → order enters processing
  } else if (txStatus === "FAIL" || txStatus === "FAILED") {
    paymentStatus = "failed";
    orderStatus = "cancelled";
  } else if (txStatus === "EXPIRED") {
    paymentStatus = "failed";
    orderStatus = "cancelled";
  }

  // ---------- Update database ----------
  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
      // 1. Find payment session by invoice_number
      const { data: paymentRow, error: lookupError } = await supabase
        .from("order_payments")
        .select("order_id, status")
        .eq("invoice_number", invoiceNumber)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        console.error("[webhook] Payment lookup error:", lookupError);
      }

      if (paymentRow?.order_id) {
        const orderId = paymentRow.order_id;
        console.log(`[webhook] Found payment session: order_id=${orderId}, tx=${txStatus}`);

        // 2. Update order_payments (for frontend polling)
        const { error: updatePayErr } = await supabase
          .from("order_payments")
          .update({
            status: paymentStatus,
            transaction_id: txId,
            transaction_date: txDate,
            payment_type: paymentType,
            payment_channel: paymentChannel,
            paid_at: paymentStatus === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
            raw_notification: payload,
          })
          .eq("invoice_number", invoiceNumber);

        if (updatePayErr) {
          console.error("[webhook] Failed to update order_payments:", updatePayErr);
        } else {
          console.log(`[webhook] ✓ order_payments updated: status=${paymentStatus}`);
        }

        // 3. Update orders table — BOTH status + payment_status (mirror midtrans-webhook)
        const { data: currentOrder } = await supabase
          .from("orders")
          .select("id, status, payment_status")
          .eq("id", orderId)
          .maybeSingle();

        const wasAlreadyPaid = currentOrder?.payment_status === "paid";
        console.log(`[webhook] Order: status=${currentOrder?.status}, payment_status=${currentOrder?.payment_status}, wasAlreadyPaid=${wasAlreadyPaid}`);

        if (!wasAlreadyPaid) {
          const { error: orderUpdateErr } = await supabase
            .from("orders")
            .update({
              status: orderStatus,              // processing / cancelled / pending
              payment_status: paymentStatus,    // paid / failed / unpaid  ⭐ NEW — was missing!
              payment_method: paymentChannel || "doku",
              updated_at: new Date().toISOString(),
            })
            .eq("id", orderId);

          if (orderUpdateErr) {
            console.error("[webhook] ⚠️ Failed to update orders:", orderUpdateErr);
          } else {
            console.log(`[webhook] ✓ orders updated: status=${orderStatus}, payment_status=${paymentStatus}`);
          }
        } else {
          console.log(`[webhook] Order already paid — skipping (idempotent)`);
        }

        // 4. If paid — trigger ALL downstream actions (mirror midtrans-webhook)
        if (paymentStatus === "paid" && !wasAlreadyPaid) {
          await triggerPaidActions(supabase, orderId, supabaseUrl!, serviceKey!, paymentChannel);
        }
      } else {
        console.warn("[webhook] No payment session found for invoice:", invoiceNumber);
      }
    } catch (e) {
      console.error("[webhook] DB update failed:", e);
    }
  }

  // Always return 200 OK to DOKU
  return new Response(JSON.stringify({
    status: "ok",
    invoice_number: invoiceNumber,
    transaction_status: txStatus,
    payment_status: paymentStatus,
    order_status: orderStatus,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ---------- helpers ----------

// ⭐ FIX v3.4: Mirror midtrans-webhook downstream actions EXACTLY
//   1. Decrement stock via atomic RPC (decrement_order_stock — idempotent)
//   2. Send email notification DIRECTLY via send-email-notification (NOT queue!)
//   3. Auto-create Biteship order
//   4. Create admin notification
//   5. Add loyalty points (1 poin = Rp 1.000)
//
// ROOT CAUSE v3.3: notification_queue has NO worker processing it.
// midtrans-webhook calls send-email-notification DIRECTLY via fetch — that's the working pattern.
async function triggerPaidActions(
  supabase: any,
  orderId: string,
  supabaseUrl: string,
  serviceKey: string,
  paymentChannel: string
): Promise<void> {
  try {
    console.log(`[webhook] === PAID ACTIONS for order ${orderId} ===`);

    // 1. Decrement stock via atomic RPC (idempotent — same as midtrans-webhook)
    const { data: stockResult, error: stockError } = await supabase.rpc(
      "decrement_order_stock",
      { p_order_id: orderId }
    );
    if (stockError) {
      console.warn("[webhook] Stock decrement error:", stockError.message);
    } else if (stockResult?.success) {
      console.log(`[webhook] ✓ Stock decremented: ${stockResult.success_count} items`);
    } else if (stockResult?.skipped) {
      console.log("[webhook] Stock already decremented (idempotent skip)");
    }

    // 2. Send email notification DIRECTLY (NOT via notification_queue — no worker!)
    //    Mirror midtrans-webhook: fetch send-email-notification edge function
    try {
      const emailResp = await fetch(`${supabaseUrl}/functions/v1/send-email-notification`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: "payment_success",
          order_id: orderId,
        }),
      });
      const emailText = await emailResp.text();
      let emailResult: any;
      try { emailResult = JSON.parse(emailText); } catch { emailResult = { raw: emailText }; }

      const emailStatus = emailResult.success
        ? (emailResult.skipped ? "email_skipped" : "email_sent")
        : "email_failed";
      console.log(`[webhook] Email: ${emailStatus}${emailResult.resend_id ? ` (id: ${emailResult.resend_id})` : ""}`);

      // Update orders with notification tracking (same as midtrans-webhook)
      await supabase.from("orders").update({
        waba_last_event: "payment_success",
        waba_last_status: emailStatus,
        waba_last_sent_at: new Date().toISOString(),
      }).eq("id", orderId);
    } catch (e: any) {
      console.error("[webhook] Email notification exception:", e.message);
    }

    // 3. Auto-create Biteship order (same as midtrans-webhook)
    try {
      const { data: biteshipResult, error: biteshipError } = await supabase.functions.invoke(
        "create-biteship-order",
        { body: { order_id: orderId } }
      );
      if (biteshipError) {
        console.warn("[webhook] create-biteship-order failed:", biteshipError.message);
      } else if (biteshipResult?.already_exists) {
        console.log("[webhook] ✓ Biteship order already exists:", biteshipResult.biteship_order_id);
      } else {
        console.log("[webhook] ✓ Biteship order created:", biteshipResult?.biteship_order_id);
      }
    } catch (e: any) {
      console.warn("[webhook] create-biteship-order error:", e.message);
    }

    // 4. Create admin notification (same as midtrans-webhook)
    try {
      const { data: orderData } = await supabase
        .from("orders")
        .select("id, total_amount, customer:customers(name)")
        .eq("id", orderId)
        .single();

      if (orderData) {
        const customerName = (orderData.customer as any)?.name || "Customer";
        const totalAmount = Number(orderData.total_amount) || 0;
        await supabase.from("notifications").insert({
          type: "payment",
          title: "Pembayaran Diterima (DOKU)",
          message: `${customerName} membayar Rp ${totalAmount.toLocaleString("id-ID")} (${paymentChannel || "doku"})`,
          reference_id: orderId,
          is_read: false,
        });
        console.log("[webhook] ✓ Admin notification created");
      }
    } catch (e: any) {
      console.warn("[webhook] Admin notification failed:", e.message);
    }

    // 5. Add loyalty points (1 poin = Rp 1.000 — same as midtrans-webhook)
    try {
      const { data: pointsOrder } = await supabase
        .from("orders")
        .select("id, total_amount, customer:customers(user_id)")
        .eq("id", orderId)
        .single();

      const userId = (pointsOrder?.customer as any)?.user_id;
      const totalAmount = Number(pointsOrder?.total_amount) || 0;

      if (userId && totalAmount > 0) {
        const points = Math.floor(totalAmount / 1000);
        if (points > 0) {
          // Idempotent check — prevent double-add on webhook retry
          const { data: existingTxn } = await supabase
            .from("point_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("source", "website_purchase")
            .eq("order_id", orderId)
            .maybeSingle();

          if (!existingTxn) {
            const { error: pointsErr } = await supabase.rpc("add_points", {
              p_user_id: userId,
              p_amount: points,
              p_source: "website_purchase",
              p_description: `Pembelian order #${orderId.slice(0, 8).toUpperCase()}`,
              p_order_id: orderId,
              p_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            });
            if (pointsErr) {
              console.warn("[webhook] Points add failed:", pointsErr.message);
            } else {
              console.log(`[webhook] ✓ Added ${points} loyalty points`);
            }
          } else {
            console.log("[webhook] Points already added (idempotent skip)");
          }
        }
      }
    } catch (e: any) {
      console.warn("[webhook] Loyalty points error:", e.message);
    }

    console.log(`[webhook] ✓ All paid actions completed for order ${orderId}`);
  } catch (e: any) {
    console.error("[webhook] triggerPaidActions failed:", e);
  }
}