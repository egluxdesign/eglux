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
//
// v3 CHANGES (this version):
//   - FIXED triggerPaidActions: query order_items table (separate from orders)
//   - FIXED triggerPaidActions: join customers table for email/phone/name
//   - Stock decrement now works correctly
//   - notification_queue payload now has correct customer_email/phone/name
//   - Optional: amount verification against stored order_payments.amount

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

  console.log("[DOKU-WH] Received notification:", {
    invoice_number: invoiceNumber,
    amount,
    tx_status: txStatus,
    tx_id: txId,
    payment_type: paymentType,
    payment_channel: paymentChannel,
  });

  // ---------- Update database ----------
  let newStatus = "pending";
  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);

    // Map DOKU status → our status
    if (txStatus === "SUCCESS") newStatus = "paid";
    else if (txStatus === "FAIL" || txStatus === "FAILED") newStatus = "failed";
    else if (txStatus === "EXPIRED") newStatus = "expired";
    else if (txStatus === "PENDING") newStatus = "pending";

    try {
      // 1. Find payment session by invoice_number
      const { data: paymentRow, error: lookupError } = await supabase
        .from("order_payments")
        .select("order_id, status, amount")
        .eq("invoice_number", invoiceNumber)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        console.error("[DOKU-WH] Payment lookup error:", lookupError);
      }

      if (paymentRow?.order_id) {
        // Optional: verify amount matches (defensive against tampering)
        if (amount > 0 && paymentRow.amount && Number(paymentRow.amount) !== amount) {
          console.warn("[DOKU-WH] Amount mismatch!", {
            stored: paymentRow.amount,
            received: amount,
          });
          // Don't fail — just warn. DOKU amount is authoritative for paid transactions.
        }

        // 2. Update payment session
        await supabase
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

        // 3. Update order status (idempotent — only move forward)
        const { data: currentOrder } = await supabase
          .from("orders")
          .select("status")
          .eq("id", paymentRow.order_id)
          .maybeSingle();

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
        if (newRank >= currentRank || !currentOrder) {
          await supabase
            .from("orders")
            .update({
              status: newOrderStatus,
              payment_method: paymentChannel || "doku",
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentRow.order_id);
          console.log("[DOKU-WH] Order status updated:", paymentRow.order_id, "→", newOrderStatus);
        } else {
          console.log("[DOKU-WH] Order status already higher, skipping update:", {
            current: currentOrder?.status,
            new: newOrderStatus,
          });
        }

        // 4. If paid — trigger downstream actions (email, WhatsApp, decrement stock)
        if (newStatus === "paid") {
          await triggerPaidActions(supabase, paymentRow.order_id);
        }
      } else {
        console.warn("[DOKU-WH] No payment session found for invoice:", invoiceNumber);
      }
    } catch (e) {
      console.error("[DOKU-WH] DB update failed:", e);
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

// ─────────────────────────────────────────────────────────────────────────────
// v3 FIXED: triggerPaidActions
//
// Previously (BUGGY):
//   - Queried orders.items (which doesn't exist — items are in order_items table)
//   - Queried orders.email / orders.phone (which don't exist — customer info in customers table)
//   - Result: stock never decremented, notification_queue had null email/phone
//
// Now (FIXED):
//   - Join customers table via customer_id to get email/phone/name
//   - Query order_items table separately for line items
//   - Stock decrement works correctly
//   - notification_queue payload has correct customer info
// ─────────────────────────────────────────────────────────────────────────────
async function triggerPaidActions(supabase: any, orderId: string): Promise<void> {
  try {
    console.log("[DOKU-WH] triggerPaidActions for order:", orderId);

    // 1. Get order + customer info (join customers table)
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id,
        customer_id,
        total_amount,
        customers ( email, phone, name )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("[DOKU-WH] Order lookup error:", orderErr);
      return;
    }
    if (!order) {
      console.warn("[DOKU-WH] Order not found:", orderId);
      return;
    }

    // Extract customer info from joined customers table
    const customerData = Array.isArray(order.customers) ? order.customers[0] : order.customers;
    const customerEmail = customerData?.email || null;
    const customerPhone = customerData?.phone || null;
    const customerName = customerData?.name || null;

    console.log("[DOKU-WH] Customer info:", {
      email: customerEmail ? `${customerEmail.slice(0, 5)}...` : "null",
      phone: customerPhone ? `${customerPhone.slice(0, 5)}...` : "null",
      name: customerName,
    });

    // 2. Insert notification log row (will be processed by separate worker)
    const { error: notifError } = await supabase.from("notification_queue").insert({
      type: "payment_success",
      order_id: orderId,
      payload: {
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_name: customerName,
        total: order.total_amount,
      },
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (notifError) {
      console.warn("[DOKU-WH] notification_queue insert failed:", notifError);
    } else {
      console.log("[DOKU-WH] ✓ notification_queue inserted");
    }

    // 3. Get order_items (separate table — NOT orders.items)
    const { data: orderItems, error: itemsErr } = await supabase
      .from("order_items")
      .select("product_id, quantity, product_name_snapshot")
      .eq("order_id", orderId);

    if (itemsErr) {
      console.error("[DOKU-WH] order_items lookup error:", itemsErr);
      return;
    }

    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      console.warn("[DOKU-WH] No order_items found for order:", orderId);
      return;
    }

    console.log(`[DOKU-WH] Found ${orderItems.length} items to decrement stock`);

    // 4. Decrement product stock for each item
    let decrementedCount = 0;
    for (const item of orderItems) {
      if (item.product_id && item.quantity) {
        const { error: stockError } = await supabase.rpc("decrement_stock", {
          p_product_id: item.product_id,
          p_qty: item.quantity,
        });

        if (stockError) {
          console.error(`[DOKU-WH] Failed to decrement stock for ${item.product_name_snapshot}:`, stockError);
        } else {
          decrementedCount++;
          console.log(`[DOKU-WH] ✓ Stock decremented: ${item.product_name_snapshot} × ${item.quantity}`);
        }
      }
    }

    console.log(`[DOKU-WH] ✓ Paid actions complete for order ${orderId}: ${decrementedCount}/${orderItems.length} items stock-decremented`);
  } catch (e) {
    console.error("[DOKU-WH] triggerPaidActions failed:", e);
  }
}