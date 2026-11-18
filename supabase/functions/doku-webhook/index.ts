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

  // ---------- Update database ----------
  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Map DOKU status → our status
    let newStatus = "pending";
    if (txStatus === "SUCCESS") newStatus = "paid";
  else if (txStatus === "FAIL" || txStatus === "FAILED") newStatus = "failed";
  else if (txStatus === "EXPIRED") newStatus = "expired";
  else if (txStatus === "PENDING") newStatus = "pending";

    try {
      // 1. Find payment session by invoice_number
      const { data: paymentRow, error: lookupError } = await supabase
        .from("order_payments")
        .select("order_id, status")
        .eq("invoice_number", invoiceNumber)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        console.error("Payment lookup error:", lookupError);
      }

      if (paymentRow?.order_id) {
        console.log(`[webhook] Found payment session: order_id=${paymentRow.order_id}, current_status=${paymentRow.status}`);

        // 2. Update payment session
        const { error: updatePayErr } = await supabase
          .from("order_payments")
          .update({
            status: newStatus,
            transaction_id: txId,
            transaction_date: txDate,
            payment_type: paymentType,
            payment_channel: paymentChannel,
            paid_at: newStatus === "paid" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
            raw_notification: payload,
          })
          .eq("invoice_number", invoiceNumber);

        if (updatePayErr) {
          console.error("[webhook] Failed to update order_payments:", updatePayErr);
        } else {
          console.log(`[webhook] order_payments updated: status=${newStatus}`);
        }

        // 3. Update order status (idempotent — only move forward)
        const { data: currentOrder, error: orderLookupErr } = await supabase
          .from("orders")
          .select("status")
          .eq("id", paymentRow.order_id)
          .maybeSingle();

        if (orderLookupErr) {
          console.error("[webhook] Failed to lookup orders:", orderLookupErr);
        }

        const orderStatusMap: Record<string, string> = {
          paid: "paid",
          failed: "cancelled",
          expired: "cancelled",
          pending: "pending_payment",
        };
        const newOrderStatus = orderStatusMap[newStatus] || "pending_payment";

        // Only update if it improves status (pending → paid, never paid → pending)
        const statusRank = ["pending_payment", "paid", "cancelled", "expired"];
        const currentRank = statusRank.indexOf(currentOrder?.status || "pending_payment");
        const newRank = statusRank.indexOf(newOrderStatus);
        const shouldUpdate = newRank >= currentRank || !currentOrder;

        console.log(`[webhook] Order status: current=${currentOrder?.status} → new=${newOrderStatus} (shouldUpdate=${shouldUpdate})`);

        if (shouldUpdate) {
          const { error: orderUpdateErr } = await supabase
            .from("orders")
            .update({
              status: newOrderStatus,
              payment_method: paymentChannel || "doku",
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentRow.order_id);

          if (orderUpdateErr) {
            console.error("[webhook] ⚠️ Failed to update orders:", orderUpdateErr);
          } else {
            console.log(`[webhook] ✓ orders updated: status=${newOrderStatus}, payment_method=${paymentChannel || "doku"}`);
          }
        }

        // 4. If paid — trigger downstream actions (email, WhatsApp, decrement stock)
        if (newStatus === "paid") {
          await triggerPaidActions(supabase, paymentRow.order_id);
        }
      } else {
        console.warn("[webhook] No payment session found for invoice:", invoiceNumber);
      }
    } catch (e) {
      console.error("DB update failed:", e);
      // Still return 200 to DOKU
    }
  }

  // Always return 200 OK to DOKU
  return new Response(JSON.stringify({
    status: "ok",
    invoice_number: invoiceNumber,
    transaction_status: txStatus,
    new_status: newStatus,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ---------- helpers ----------

async function triggerPaidActions(supabase: any, orderId: string): Promise<void> {
  try {
    // ⭐ FIX v3.2: Query CORRECT columns from orders table
    // orders has: id, customer_id, total_amount (NOT "total"), status, payment_status
    // orders does NOT have email/phone/items — those are in customers + order_items tables
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, customer_id, total_amount, status, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("[webhook] triggerPaidActions: Failed to fetch order:", orderErr);
      return;
    }
    if (!order) {
      console.warn(`[webhook] triggerPaidActions: Order not found: ${orderId}`);
      return;
    }

    // ⭐ FIX: Get customer email/phone from customers table (orders doesn't have them)
    let customerEmail = "";
    let customerPhone = "";
    let customerName = "";
    if (order.customer_id) {
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("name, phone, email")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (custErr) {
        console.warn("[webhook] Failed to fetch customer:", custErr);
      } else if (customer) {
        customerEmail = customer.email || "";
        customerPhone = customer.phone || "";
        customerName = customer.name || "";
      }
    }

    // ⭐ FIX: Get order items from order_items table (orders doesn't have items array)
    const { data: orderItems, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity, name, price")
      .eq("order_id", orderId);

    if (itemsErr) {
      console.warn("[webhook] Failed to fetch order_items:", itemsErr);
    }

    console.log(`[webhook] triggerPaidActions: phone=${customerPhone}, email=${customerEmail}, items=${orderItems?.length || 0}`);

    // 1. Insert notification queue row (WABA + email worker will pick this up)
    const { error: notifError } = await supabase.from("notification_queue").insert({
      type: "payment_success",
      order_id: orderId,
      payload: {
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_name: customerName,
        total: order.total_amount,
        items: orderItems || [],
      },
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (notifError) {
      console.warn("[webhook] notification_queue insert failed:", notifError);
    } else {
      console.log(`[webhook] ✓ Notification queued for order ${orderId} (phone=${customerPhone})`);
    }

    // 2. Decrement product stock
    if (Array.isArray(orderItems)) {
      for (const item of orderItems) {
        if (item.product_id && item.quantity) {
          const { error: stockErr } = await supabase.rpc("decrement_stock", {
            p_product_id: item.product_id,
            p_qty: item.quantity,
          });
          if (stockErr) {
            console.warn(`[webhook] Stock decrement failed for ${item.product_id}:`, stockErr);
          }
        }
      }
    }

    console.log(`[webhook] ✓ triggerPaidActions completed for order ${orderId}`);
  } catch (e) {
    console.error("[webhook] triggerPaidActions failed:", e);
  }
}