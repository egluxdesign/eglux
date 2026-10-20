// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler v3.1 (with WA shipping_update trigger)
// ============================================================================
//
// ⭐ v3.1 CHANGES (dari v3):
//   - ADD: Trigger WA shipping_update saat Biteship notify status berubah ke:
//     "allocated" (courier assigned), "pickingUp" (courier on the way to pickup),
//     "picked" (courier picked up package). Customer akan dapat WA dengan
//     tracking number + waybill_url (link lacak realtime dari Biteship).
//   - ADD: fetchBiteshipOrderDetail() — fetch waybill_url dari Biteship API
//     kalau webhook payload gak include waybill_url (sering terjadi saat
//     status=allocated, waybill_url belum available di webhook body)
//   - ADD: Handle event "order.waybill_id" properly — store waybill_url ke DB
//   - Idempotent: cek waba_messages table dulu, kalau shipping_update sudah pernah
//     di-send untuk order ini, skip (hindari double-WA kalau Biteship retry webhook)
//   - WA trigger pakai fetch dengan Authorization eksplisit (pattern yang proven work)
//
// Receive POST dari Biteship saat:
//   - order.status    → status order berubah
//   - order.waybill_id → waybill URL available
//   - order.price      → price info
//
// Biteship status flow (snake_case di webhook):
//   confirmed → allocated → pickingUp → picked → inTransit → droppingOff → delivered
//
// Update orders table:
//   - biteship_status   (snake_case: confirmed, allocated, picking_up, dst.)
//   - status            (EGLUX internal: processing, shipping, completed, cancelled)
//   - biteship_waybill_url (kalau ada)
//   - courier_name, courier_service, courier_link (kalau ada)
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        URL: https://<project-ref>.supabase.co/functions/v1/biteship-webhook
//        Events: order.status, order.waybill_id, order.price
//   2. Set env var BITESHIP_WEBHOOK_SECRET untuk strict security (recommended)
//   3. Set env var BITESHIP_API_KEY (already required by create-biteship-order)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BITESHIP_WEBHOOK_SECRET = Deno.env.get("BITESHIP_WEBHOOK_SECRET");
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;
const BITESHIP_API_URL = "https://api.biteship.com/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret, x-biteship-signature",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * Map Biteship status ke EGLUX internal order status.
 */
function mapBiteshipStatusToEglux(biteshipStatus: string | null | undefined): string | null {
  if (!biteshipStatus) return null;
  const normalized = String(biteshipStatus)
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  switch (normalized) {
    case "confirmed":
    case "allocated":
    case "pickingUp":
      return "processing";
    case "picked":
    case "inTransit":
    case "droppingOff":
    case "onHold":
      return "shipping";
    case "delivered":
      return "completed";
    case "cancelled":
    case "returned":
    case "rejected":
    case "courierNotFound":
    case "disposed":
    case "returnInTransit":
      return "cancelled";
    default:
      return null;
  }
}

/**
 * ⭐ v3.1 NEW: Cek apakah Biteship status menandakan order sedang dalam proses shipment.
 * Trigger WA shipping_update saat status in list ini.
 */
function isShipmentStarted(biteshipStatus: string | null | undefined): boolean {
  if (!biteshipStatus) return false;
  const normalized = String(biteshipStatus)
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return ["allocated", "pickingUp", "picked", "inTransit", "droppingOff"].includes(normalized);
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/**
 * ⭐ v3.1 NEW: Fetch order detail dari Biteship API
 * Untuk dapat waybill_url, courier.link, dan field lain yang gak ada di webhook body
 */
async function fetchBiteshipOrderDetail(biteshipOrderId: string): Promise<{
  waybill_url: string | null;
  courier_link: string | null;
  tracking_number: string | null;
  courier_name: string | null;
  courier_service: string | null;
  raw?: any;
} | null> {
  if (!BITESHIP_API_KEY) {
    console.warn("[biteship-webhook] BITESHIP_API_KEY not set — cannot fetch order detail");
    return null;
  }

  try {
    console.log(`[biteship-webhook] Fetching Biteship order detail for: ${biteshipOrderId}`);
    const resp = await fetch(`${BITESHIP_API_URL}/orders/${biteshipOrderId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${BITESHIP_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.warn(`[biteship-webhook] Biteship API GET /orders/${biteshipOrderId} returned HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    console.log(`[biteship-webhook] ✓ Biteship API returned order detail:`, {
      status: data.status,
      waybill_url: data.waybill_url ? "(present)" : "(null)",
      courier_link: data.courier?.link ? "(present)" : "(null)",
      tracking_id: data.tracking_id || data.courier?.tracking_id || "(null)",
    });

    return {
      waybill_url: data.waybill_url || null,
      courier_link: data.courier?.link || null,
      tracking_number: data.tracking_id || data.courier?.tracking_id || null,
      courier_name: data.courier?.name || null,
      courier_service: data.courier?.service || null,
      raw: data,
    };
  } catch (err) {
    console.warn(`[biteship-webhook] Biteship API fetch error:`, err?.message);
    return null;
  }
}

/**
 * ⭐ v3.1 NEW: Trigger WA shipping_update via fetch dengan Authorization eksplisit
 */
async function triggerWabaShippingUpdate(
  order_id: string,
  tracking_number: string | undefined,
  waybill_url: string | undefined,
  context: string = "biteship-webhook"
): Promise<{ success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string }> {
  // Idempotency check
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: existingWaba, error: checkErr } = await supabase
      .from("waba_messages")
      .select("id, status, event")
      .eq("order_id", order_id)
      .eq("event", "shipping_update")
      .in("status", ["sent", "pending", "test_sent"])
      .limit(1);

    if (checkErr) {
      console.warn(`[${context}] Idempotency check failed:`, checkErr.message);
    } else if (existingWaba && existingWaba.length > 0) {
      console.log(`[${context}] ✓ shipping_update WA already sent (idempotent skip):`, existingWaba[0].id);
      return { success: false, skipped: true, skip_reason: "shipping_update WA already sent for this order" };
    }
  } catch (idempErr) {
    console.warn(`[${context}] Idempotency check error:`, idempErr?.message);
  }

  const requestBody: any = { order_id, event: "shipping_update" };
  if (tracking_number) requestBody.tracking_number = tracking_number;
  if (waybill_url) requestBody.waybill_url = waybill_url;

  console.log(`[${context}] Triggering send-waba-live (shipping_update)...`, {
    order_id,
    tracking_number: tracking_number || "(none)",
    waybill_url: waybill_url ? "(present)" : "(none)"
  });

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-waba-live`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[${context}] send-waba-live HTTP status:`, response.status);

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 100)}` };
    }

    if (!response.ok) {
      console.warn(`[${context}] ✗ send-waba-live HTTP ${response.status}:`, result?.error || result);
      return { success: false, data: result, error: result?.error || `HTTP ${response.status}` };
    }

    if (result?.success) {
      console.log(`[${context}] ✓ WA shipping_update sent:`, result.qiscus_message_id);
    } else {
      console.warn(`[${context}] send-waba-live returned non-success:`, result?.error);
    }

    return { success: !!result?.success, data: result };
  } catch (err) {
    console.error(`[${context}] send-waba-live invoke error:`, err?.message);
    return { success: false, error: err?.message };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  console.log("[biteship-webhook] 📨 Webhook received");

  // ── Webhook secret verification ──
  if (BITESHIP_WEBHOOK_SECRET) {
    const providedSecret = req.headers.get("x-webhook-secret") || req.headers.get("x-biteship-signature");
    if (!providedSecret) {
      console.warn("[biteship-webhook] ⚠️ Request without secret header. Allowing with warning.");
    } else if (providedSecret !== BITESHIP_WEBHOOK_SECRET) {
      console.error("[biteship-webhook] Invalid webhook secret");
      return json({ error: "Unauthorized: invalid webhook secret" }, 401);
    }
  } else {
    console.warn("[biteship-webhook] BITESHIP_WEBHOOK_SECRET not set — dev mode (unauthenticated)");
  }

  // ── Parse body ──
  let body: any;
  try {
    const rawText = await req.text();
    console.log("[biteship-webhook] 📥 Raw body:", rawText.substring(0, 2000));
    body = JSON.parse(rawText);
  } catch (err) {
    console.warn("[biteship-webhook] Body bukan JSON valid:", err?.message);
    return json({ success: true, message: "biteship-webhook ready (invalid JSON, acknowledged)" }, 200);
  }

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return json({ success: true, message: "biteship-webhook ready" }, 200);
  }

  // ── Extract fields ──
  const eventType: string = body.event || "order.status";
  const data: any = body.data || body;

  let biteshipStatus: string | null = body.status || data.status || null;
  let waybillUrl: string | null = body.waybill_url || data.waybill_url || body.courier?.waybill_url || null;
  const courierName: string | null = body.courier?.name || data.courier?.name || body.courier_name || null;
  const courierService: string | null = body.courier?.service || data.courier?.service || body.courier_service || null;
  const courierLink: string | null = body.courier?.link || data.courier?.link || body.courier_link || null;
  const biteshipOrderId: string | null = body.id || data.id || body.order_id || data.order_id || null;

  if (eventType === "order.status") {
    console.log(`[biteship-webhook] order.status event → status=${biteshipStatus}`);
  } else if (eventType === "order.waybill_id") {
    console.log(`[biteship-webhook] order.waybill_id event → waybill_url=${waybillUrl}`);
  } else if (eventType === "order.price") {
    console.log(`[biteship-webhook] order.price event → skip (not relevant)`);
    return json({ success: true, message: "Price event acknowledged" }, 200);
  } else {
    console.warn(`[biteship-webhook] Unknown event: ${eventType}`);
  }

  console.log("[biteship-webhook] 📋 Parsed payload:", {
    event: eventType,
    biteship_order_id: biteshipOrderId,
    biteship_status: biteshipStatus,
    waybill_url: waybillUrl,
    courier_name: courierName,
    courier_service: courierService,
    courier_link: courierLink,
  });

  if (!biteshipOrderId) {
    console.error("[biteship-webhook] ❌ Missing biteship_order_id");
    return json({ error: "Missing biteship_order_id" }, 400);
  }

  // ── Map status ──
  const egluxStatus = mapBiteshipStatusToEglux(biteshipStatus);

  // ── Build initial update payload dari webhook body ──
  const updatePayload: any = {};
  if (biteshipStatus) {
    updatePayload.biteship_status = biteshipStatus;
    if (egluxStatus) {
      updatePayload.status = egluxStatus;
      console.log(`[biteship-webhook] 🔄 Status mapping: ${biteshipStatus} → ${egluxStatus}`);
    }
  }
  if (waybillUrl) updatePayload.biteship_waybill_url = waybillUrl;
  if (courierName) updatePayload.courier_name = courierName;
  if (courierService) updatePayload.courier_service = courierService;
  if (courierLink) updatePayload.courier_link = courierLink;

  // ⭐ v3.1: Fetch Biteship order detail kalau waybill_url atau courier info NULL
  // (sering terjadi saat webhook status=allocated — Biteship belum kasih waybill_url di body)
  let fetchedWaybillUrl: string | null = waybillUrl;
  let fetchedTrackingNumber: string | null = null;

  if (!waybillUrl || !courierLink) {
    console.log("[biteship-webhook] waybill_url/courier_link missing in webhook body — fetching from Biteship API...");
    const orderDetail = await fetchBiteshipOrderDetail(biteshipOrderId);
    if (orderDetail) {
      if (!waybillUrl && orderDetail.waybill_url) {
        fetchedWaybillUrl = orderDetail.waybill_url;
        updatePayload.biteship_waybill_url = orderDetail.waybill_url;
        console.log("[biteship-webhook] ✓ Fetched waybill_url from Biteship API");
      }
      if (!courierLink && orderDetail.courier_link) {
        updatePayload.courier_link = orderDetail.courier_link;
      }
      if (orderDetail.tracking_number) {
        fetchedTrackingNumber = orderDetail.tracking_number;
      }
      if (orderDetail.courier_name && !courierName) {
        updatePayload.courier_name = orderDetail.courier_name;
      }
      if (orderDetail.courier_service && !courierService) {
        updatePayload.courier_service = orderDetail.courier_service;
      }
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    console.log("[biteship-webhook] No fields to update, returning OK");
    return json({ success: true, message: "No fields to update" }, 200);
  }

  // ── Update orders table (lookup by biteship_order_id) ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: updateResult, error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("biteship_order_id", biteshipOrderId)
    .select("id, status, biteship_status, tracking_number, biteship_waybill_url, courier_code, courier_service, courier_link");

  if (updateError) {
    console.error("[biteship-webhook] ❌ DB update failed:", updateError);
    return json({ error: "Failed to update order", details: updateError.message }, 500);
  }

  if (!updateResult || updateResult.length === 0) {
    console.error(`[biteship-webhook] ❌ No order found with biteship_order_id=${biteshipOrderId}`);
    return json({ error: "Order not found by biteship_order_id" }, 404);
  }

  const updatedOrder = updateResult[0];
  console.log("[biteship-webhook] ✅ Order updated:", {
    order_id: updatedOrder.id,
    new_status: updatedOrder.status,
    new_biteship_status: updatedOrder.biteship_status,
    tracking_number: updatedOrder.tracking_number,
    biteship_waybill_url: updatedOrder.biteship_waybill_url ? "(present)" : "(null)",
    courier_link: updatedOrder.courier_link ? "(present)" : "(null)",
  });

  // ============================================================================
  // ⭐ v3.1: Trigger WA shipping_update saat shipment started
  // Sekarang kirim waybill_url ke send-waba-live (yang akan pakai waybill_url
  // untuk {{6}} di template shipping_updatesv2)
  // ============================================================================
  let waShippingResult: { success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string } | null = null;

  if (isShipmentStarted(biteshipStatus)) {
    console.log(`[biteship-webhook] 📦 Shipment started (status=${biteshipStatus}). Triggering WA shipping_update...`);

    const trackingNumber = updatedOrder.tracking_number || fetchedTrackingNumber || undefined;
    const finalWaybillUrl = updatedOrder.biteship_waybill_url || fetchedWaybillUrl || undefined;

    waShippingResult = await triggerWabaShippingUpdate(
      updatedOrder.id,
      trackingNumber,
      finalWaybillUrl,
      "biteship-webhook"
    );
  } else {
    console.log(`[biteship-webhook] Shipment not yet started (status=${biteshipStatus}). Skip WA shipping_update.`);
  }

  // ============================================================================
  // EMAIL NOTIFICATION via Resend: trigger saat status berubah ke 'shipping'
  // (Biteship picked/inTransit → EGLUX status='shipping')
  // ============================================================================
  if (egluxStatus === "shipping") {
    try {
      const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: "shipping",
          order_id: updatedOrder.id,
        }),
      });
      const emailResult = await emailResp.json();
      if (emailResult.success) {
        console.log(`[biteship-webhook] ✓ Shipping email sent (skipped: ${emailResult.skipped || false})`);
      } else {
        console.warn(`[biteship-webhook] Shipping email failed:`, emailResult.error || emailResult.reason);
      }
    } catch (emailErr) {
      console.warn("[biteship-webhook] Shipping email error:", emailErr?.message);
    }
  }

  return json({
    success: true,
    order_id: updatedOrder.id,
    biteship_order_id: biteshipOrderId,
    biteship_status: biteshipStatus,
    eglux_status: updatedOrder.status,
    event: eventType,
    updated_fields: Object.keys(updatePayload),
    waybill_url_source: waybillUrl ? "webhook_body" : (fetchedWaybillUrl ? "biteship_api" : "none"),
    wa_shipping_update: waShippingResult ? {
      triggered: true,
      success: waShippingResult.success,
      skipped: waShippingResult.skipped || false,
      skip_reason: waShippingResult.skip_reason || null,
      error: waShippingResult.error || null,
    } : {
      triggered: false,
      reason: `Biteship status ${biteshipStatus} not in shipment-started list`,
    },
  });
});