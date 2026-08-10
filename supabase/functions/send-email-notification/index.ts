// supabase/functions/send-email-notification/index.ts
// ============================================================================
// send-email-notification — Generic email sender via Resend API
// ============================================================================
//
// Pakai:
//   POST /functions/v1/send-email-notification
//   Headers:
//     Authorization: Bearer <service_role_key>  ← internal call (dari webhook)
//     atau user JWT (untuk admin manual send)
//   Body: {
//     event: "payment_success" | "payment_pending" | "shipping" | "expired",
//     order_id: "uuid",
//   }
//
// Flow:
//   1. Fetch order + customer + items dari DB
//   2. Check duplicate (unique idx order_id + event) — skip kalau sudah ada
//   3. Generate HTML email dari template
//   4. Insert email_messages row (status='pending')
//   5. Call Resend API: POST https://api.resend.com/emails
//   6. Update email_messages: status='sent' + resend_id + sent_at
//      Kalau fail: status='failed' + error_message + next_retry_at (exponential backoff)
//
// Required env vars:
//   RESEND_API_KEY   — API key dari resend.com
//   (optional) FROM_EMAIL — default: EGLUX <noreply@eglux.id>
//   (optional) STOREFRONT_URL — default: https://eglux.vercel.app
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";
import {
  paymentSuccessEmail,
  paymentPendingEmail,
  shippingUpdateEmail,
  orderExpiredEmail,
  type OrderEmailData,
} from "../_shared/email-templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "EGLUX <noreply@eglux.id>";
const STOREFRONT_URL = Deno.env.get("STOREFRONT_URL") || "https://eglux.vercel.app";
const RESEND_API_URL = "https://api.resend.com/emails";

// ============================================================================
// Helper: Fetch order data lengkap (customer + items + totals)
// ============================================================================
async function fetchOrderData(supabase: any, orderId: string): Promise<OrderEmailData | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id, status, payment_status, total_amount, subtotal, shipping_cost,
      courier_code, courier_service, tracking_number, biteship_waybill_url,
      shipping_address, shipping_city, shipping_postal_code,
      payment_method, midtrans_payment_type,
      voucher_code, voucher_discount,
      tax_percent, tax_base, tax_amount,
      customer:customers(name, phone, email),
      order_items (
        product_name_snapshot, variant_name_snapshot,
        unit_price_snapshot, quantity, subtotal
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error("[send-email] Failed to fetch order:", error?.message);
    return null;
  }

  const customer = order.customer || {};
  const items = (order.order_items || []).map((it: any) => ({
    name: it.product_name_snapshot || "",
    variantName: it.variant_name_snapshot || undefined,
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.unit_price_snapshot) || 0,
    subtotal: Number(it.subtotal) || 0,
  }));

  // Generate short ID (8 chars uppercase)
  const shortId = (order.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();

  // Payment method label
  const paymentMethod = order.midtrans_payment_type || order.payment_method || "";

  return {
    orderId: order.id,
    orderShortId: shortId,
    customerName: customer.name || "Pelanggan",
    customerEmail: customer.email || "",
    customerPhone: customer.phone,
    totalAmount: Number(order.total_amount) || 0,
    subtotal: Number(order.subtotal) || 0,
    shippingCost: Number(order.shipping_cost) || 0,
    taxAmount: Number(order.tax_amount) || 0,
    voucherDiscount: Number(order.voucher_discount) || 0,
    voucherCode: order.voucher_code || undefined,
    items,
    paymentMethod,
    shippingAddress: order.shipping_address,
    shippingCity: order.shipping_city,
    shippingPostalCode: order.shipping_postal_code,
    courierCode: order.courier_code,
    courierService: order.courier_service,
    trackingNumber: order.tracking_number,
    biteshipWaybillUrl: order.biteship_waybill_url,
    storefrontUrl: STOREFRONT_URL,
  };
}

// ============================================================================
// Helper: Generate email content based on event
// ============================================================================
function generateEmailContent(event: string, data: OrderEmailData): { subject: string; html: string } | null {
  switch (event) {
    case "payment_success":
      return paymentSuccessEmail(data);
    case "payment_pending":
      return paymentPendingEmail(data);
    case "shipping":
      return shippingUpdateEmail(data);
    case "expired":
      return orderExpiredEmail(data);
    default:
      console.error("[send-email] Unknown event:", event);
      return null;
  }
}

// ============================================================================
// Helper: Call Resend API
// ============================================================================
async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; resendId?: string; error?: string }> {
  // ⭐ Check 1: RESEND_API_KEY env var
  if (!RESEND_API_KEY) {
    console.error("[send-email] RESEND_API_KEY env var not set");
    return { success: false, error: "RESEND_API_KEY env var not set — set it in Supabase Dashboard → Edge Functions → Environment Variables" };
  }

  // ⭐ Check 2: Validate FROM_EMAIL format (rough check)
  if (!FROM_EMAIL || !FROM_EMAIL.includes("@")) {
    console.error("[send-email] Invalid FROM_EMAIL:", FROM_EMAIL);
    return { success: false, error: `Invalid FROM_EMAIL: ${FROM_EMAIL}` };
  }

  console.log(`[send-email] Sending email to: ${to}, subject: ${subject.substring(0, 50)}, from: ${FROM_EMAIL}`);

  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // ⭐ Detailed error logging — Resend return specific error messages
      // Common errors:
      //   401: invalid API key
      //   403: domain not verified / not allowed
      //   422: validation error (e.g., invalid email format)
      //   429: rate limit exceeded
      console.error(`[send-email] Resend API error (HTTP ${resp.status}):`, JSON.stringify(data));
      const errorMsg = data?.message || data?.error || JSON.stringify(data);
      return {
        success: false,
        error: `Resend API ${resp.status}: ${errorMsg}`,
      };
    }

    console.log(`[send-email] ✓ Email sent (resend_id: ${data.id})`);
    return { success: true, resendId: data.id };
  } catch (e) {
    console.error("[send-email] Resend API fetch failed:", e?.message);
    return { success: false, error: `Network error: ${e?.message || "unknown"}` };
  }
}

// ============================================================================
// Helper: Calculate next retry time (exponential backoff)
// ============================================================================
function getNextRetryAt(retryCount: number): string {
  // Backoff: 1m, 5m, 15m, 60m, 240m
  const backoffs = [1, 5, 15, 60, 240];
  const minutes = backoffs[Math.min(retryCount, backoffs.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

// ============================================================================
// Main
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { event, order_id, retry = false } = body;

    // Validate
    if (!event || !order_id) {
      return new Response(JSON.stringify({ error: "event and order_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validEvents = ["payment_success", "payment_pending", "shipping", "expired"];
    if (!validEvents.includes(event)) {
      console.error(`[send-email] Invalid event: ${event}`);
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid event: ${event}`,
        step: "validate_event",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[send-email] ===== START: order=${order_id} event=${event} =====`);
    console.log(`[send-email] Step 1: Fetch order data`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Step 1: Fetch order data ──
    const orderData = await fetchOrderData(supabase, order_id);
    if (!orderData) {
      console.error(`[send-email] ✗ Step 1 failed: Order not found`);
      return new Response(JSON.stringify({
        success: false,
        error: "Order not found",
        step: "fetch_order",
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[send-email] ✓ Step 1: Order fetched (customer_email=${orderData.customerEmail || 'EMPTY'})`);

    // ── Step 2: Check customer email ──
    console.log(`[send-email] Step 2: Check customer email`);
    if (!orderData.customerEmail) {
      console.warn(`[send-email] ⚠️ Step 2: Order ${order_id} has no customer email — skip`);
      return new Response(JSON.stringify({
        success: false,
        skipped: true,
        reason: "Customer has no email address",
        step: "check_email",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[send-email] ✓ Step 2: Customer email exists: ${orderData.customerEmail}`);

    // ── Step 3: Check duplicate (unless retry) ──
    console.log(`[send-email] Step 3: Check duplicate`);
    if (!retry) {
      const { data: existing, error: dupErr } = await supabase
        .from("email_messages")
        .select("id, status")
        .eq("order_id", order_id)
        .eq("event", event)
        .maybeSingle();

      if (dupErr) {
        console.warn(`[send-email] ⚠️ Step 3: Duplicate check query error (continue): ${dupErr.message}`);
      }

      if (existing) {
        console.log(`[send-email] ℹ️ Step 3: Duplicate email skipped (existing status=${existing.status})`);
        return new Response(JSON.stringify({
          success: true,
          skipped: true,
          reason: "Email already sent (or pending)",
          existing_status: existing.status,
          step: "check_duplicate",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Step 4: Generate email content ──
    console.log(`[send-email] Step 4: Generate email content`);
    const emailContent = generateEmailContent(event, orderData);
    if (!emailContent) {
      console.error(`[send-email] ✗ Step 4 failed: Failed to generate email content`);
      return new Response(JSON.stringify({
        success: false,
        error: "Failed to generate email content",
        step: "generate_content",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[send-email] ✓ Step 4: Email content generated (subject: ${emailContent.subject.substring(0, 50)})`);

    // ── Step 5: Insert email_messages row (status='pending') ──
    console.log(`[send-email] Step 5: Insert email_messages row (status=pending)`);
    const { data: emailRow, error: insertErr } = await supabase
      .from("email_messages")
      .insert({
        order_id,
        event,
        to_email: orderData.customerEmail,
        to_name: orderData.customerName,
        subject: emailContent.subject,
        html_body: emailContent.html,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr || !emailRow) {
      console.error("[send-email] ✗ Failed to insert email_messages:", insertErr?.message);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to log email: ${insertErr?.message || 'Unknown insert error'}`,
        step: "insert_email_log",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log(`[send-email] ✓ Inserted email_messages row: ${emailRow.id}`);

    // ── Step 6: Call Resend API ──
    console.log(`[send-email] Step 6: Call Resend API`);
    const result = await sendViaResend(
      orderData.customerEmail,
      emailContent.subject,
      emailContent.html,
    );

    // ── Step 7: Update email_messages row ──
    if (result.success) {
      await supabase
        .from("email_messages")
        .update({
          status: "sent",
          resend_id: result.resendId,
          sent_at: new Date().toISOString(),
        })
        .eq("id", emailRow.id);

      console.log(`[send-email] ✓ Email sent: order=${order_id} event=${event} resend_id=${result.resendId}`);

      return new Response(JSON.stringify({
        success: true,
        email_id: emailRow.id,
        resend_id: result.resendId,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Failed — set retry
      const nextRetry = getNextRetryAt(0);
      await supabase
        .from("email_messages")
        .update({
          status: "failed",
          error_message: result.error,
          next_retry_at: nextRetry,
        })
        .eq("id", emailRow.id);

      console.error(`[send-email] ✗ Email failed: order=${order_id} event=${event} error=${result.error}`);

      return new Response(JSON.stringify({
        success: false,
        email_id: emailRow.id,
        error: result.error,
        error_detail: result.error,  // duplicate field supaya midtrans-webhook gampang parse
        next_retry_at: nextRetry,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("[send-email] Top-level Error:", e?.message, e?.stack);
    return new Response(JSON.stringify({
      success: false,
      error: e?.message || "Unknown error in send-email-notification",
      error_detail: e?.message || "Unknown error in send-email-notification",
      stack: e?.stack,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
