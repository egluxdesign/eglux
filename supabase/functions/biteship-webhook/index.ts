// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler v3.2 (DEEP DIVE FIX — robust waybill_url fetching)
// ============================================================================
//
// ⭐ v3.2 CHANGES (dari v3.1):
//   - FIX: fetchBiteshipOrderDetail() sekarang check MULTIPLE field paths buat
//     extract waybill_url (bukan cuma `data.waybill_url` yang sering NULL):
//       1. data.waybill_url (top-level)
//       2. data.courier?.waybill_url (nested di courier object — sering ada di sini)
//       3. Construct dari data.courier?.waybill_id:
//          https://track.biteship.com/{waybill_id}?environment={env}
//       4. Call POST /v1/orders/{id}/generate_waybill buat force-generate
//       5. Re-extract dari generate_waybill response (nested + construct)
//   - ADD: Verbose logging — log full Biteship API response buat debug visibility
//   - ADD: Construct URL pakai env-aware (development/production based on
//     BITESHIP_IS_PRODUCTION env var)
//   - KEEP: WA shipping_updatesv2 trigger saat status=allocated/picking/picked
//   - KEEP: Idempotency check buat hindari double-WA
//   - KEEP: Auth fix (fetch + Authorization eksplisit)
//
// Receive POST dari Biteship saat:
//   - order.status    → status order berubah
//   - order.waybill_id → waybill URL available
//   - order.price      → price info
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        https://mbuwpjxpxvnsxjusrnlk.supabase.co/functions/v1/biteship-webhook
//   2. Set env var BITESHIP_API_KEY (sudah required by create-biteship-order)
//   3. Set env var BITESHIP_IS_PRODUCTION (true kalau pakai Biteship production,
//      false/empty kalau pakai sandbox)
//   4. (Optional) Set BITESHIP_WEBHOOK_SECRET untuk strict security
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const BITESHIP_WEBHOOK_SECRET = Deno.env.get("BITESHIP_WEBHOOK_SECRET");
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;
const BITESHIP_API_URL = "https://api.biteship.com/v1";
const BITESHIP_IS_PRODUCTION = Deno.env.get("BITESHIP_IS_PRODUCTION") === "true";
const BITESHIP_ENV = BITESHIP_IS_PRODUCTION ? "production" : "development";

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
 * ⭐ v3.2 NEW: Construct waybill_url dari waybill_id kalau API gak return waybill_url
 * Format: https://track.biteship.com/{waybill_id}?environment={env}
 */
function constructWaybillUrlFromId(waybillId: string): string {
  return `https://track.biteship.com/${waybillId}?environment=${BITESHIP_ENV}`;
}

/**
 * ⭐ v3.2 DEEP DIVE FIX: Fetch order detail dari Biteship API dengan
 * multiple fallback strategies buat extract waybill_url.
 *
 * Strategy:
 *   1. GET /v1/orders/{id} — extract dari top-level + nested courier
 *   2. Construct URL dari waybill_id kalau waybill_url masih NULL
 *   3. POST /v1/orders/{id}/generate_waybill — force-generate waybill
 *   4. Re-extract dari generate_waybill response (top-level + nested + construct)
 */
async function fetchBiteshipOrderDetail(biteshipOrderId: string): Promise<{
  waybill_url: string | null;
  waybill_id: string | null;
  courier_link: string | null;
  tracking_number: string | null;
  courier_name: string | null;
  courier_service: string | null;
  biteship_status: string | null;
  pickup_code: string | null;
  raw: any;
  waybill_url_source: string;
  generate_attempted: boolean;
  generate_error: string | null;
} | null> {
  if (!BITESHIP_API_KEY) {
    console.warn("[biteship-webhook] BITESHIP_API_KEY not set — cannot fetch order detail");
    return null;
  }

  let waybillUrl: string | null = null;
  let waybillId: string | null = null;
  let courierLink: string | null = null;
  let trackingNumber: string | null = null;
  let courierName: string | null = null;
  let courierService: string | null = null;
  let biteshipStatus: string | null = null;
  let pickupCode: string | null = null;
  let rawDetail: any = null;
  let waybillUrlSource = "none";
  let generateAttempted = false;
  let generateError: string | null = null;

  // ── Step 1: GET /v1/orders/{id} ──
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

    rawDetail = await resp.json();

    // ⭐ v3.2: Verbose logging buat debug — lihat semua field yang Biteship kasih
    console.log(`[biteship-webhook] 📋 Full Biteship API response (truncated 1500 chars):`,
      JSON.stringify(rawDetail).substring(0, 1500));
    console.log(`[biteship-webhook] 📦 Top-level keys:`, Object.keys(rawDetail || {}));
    console.log(`[biteship-webhook] 📦 courier keys:`, rawDetail?.courier ? Object.keys(rawDetail.courier) : "(no courier)");

    // Extract fields dari multiple paths
    const courier = rawDetail?.courier || {};

    // waybill_url (check top-level dulu, lalu nested courier.waybill_url)
    waybillUrl = rawDetail?.waybill_url || courier.waybill_url || null;
    waybillUrlSource = waybillUrl ? "api_top_or_nested" : "none";

    // waybill_id (check nested courier.waybill_id dulu, lalu top-level)
    waybillId = courier.waybill_id || rawDetail?.waybill_id || null;

    // tracking_id (AWB number)
    trackingNumber = rawDetail?.tracking_id || courier.tracking_id || null;

    // courier info
    courierLink = courier.link || null;
    courierName = courier.name || null;
    courierService = courier.service || null;

    // other fields
    biteshipStatus = rawDetail?.status || null;
    pickupCode = rawDetail?.pickup_code || null;

    console.log(`[biteship-webhook] After step 1 (GET):`, {
      waybill_url: waybillUrl ? "(present)" : "(null)",
      waybill_id: waybillId || "(null)",
      tracking_id: trackingNumber || "(null)",
      courier_link: courierLink ? "(present)" : "(null)",
      courier_name: courierName || "(null)",
      biteship_status: biteshipStatus || "(null)",
    });

    // ⭐ v3.2 Step 2: Construct URL dari waybill_id kalau waybill_url masih NULL
    if (!waybillUrl && waybillId) {
      waybillUrl = constructWaybillUrlFromId(waybillId);
      waybillUrlSource = "constructed_from_waybill_id";
      console.log(`[biteship-webhook] ✓ Constructed waybill_url from waybill_id: ${waybillUrl}`);
    }
  } catch (err) {
    console.warn(`[biteship-webhook] Biteship API GET fetch error:`, err?.message);
    return null;
  }

  // ⭐ v3.2 Step 3: Kalau waybill_url masih NULL → call generate_waybill endpoint
  if (!waybillUrl) {
    console.log(`[biteship-webhook] waybill_url still NULL after GET — calling generate_waybill endpoint...`);
    generateAttempted = true;

    try {
      const genResp = await fetch(
        `${BITESHIP_API_URL}/orders/${biteshipOrderId}/generate_waybill`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${BITESHIP_API_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      console.log(`[biteship-webhook] generate_waybill HTTP status: ${genResp.status}`);

      const genData = await genResp.json();
      console.log(`[biteship-webhook] 📋 generate_waybill response (truncated 800 chars):`,
        JSON.stringify(genData).substring(0, 800));

      if (genResp.ok && genData) {
        // Extract dari generate_waybill response
        const genCourier = genData.courier || {};

        // waybill_url (top-level + nested)
        if (genData.waybill_url) {
          waybillUrl = genData.waybill_url;
          waybillUrlSource = "generate_waybill_api";
        } else if (genCourier.waybill_url) {
          waybillUrl = genCourier.waybill_url;
          waybillUrlSource = "generate_waybill_courier";
        }

        // waybill_id (top-level + nested)
        if (!waybillId) {
          waybillId = genCourier.waybill_id || genData.waybill_id || null;
        }

        // ⭐ v3.2 Step 4: Construct URL dari waybill_id kalau waybill_url masih NULL
        if (!waybillUrl && waybillId) {
          waybillUrl = constructWaybillUrlFromId(waybillId);
          waybillUrlSource = "constructed_from_generate_waybill_id";
          console.log(`[biteship-webhook] ✓ Constructed waybill_url from generate_waybill waybill_id: ${waybillUrl}`);
        }

        // Update courier info kalau ada di generate_waybill response
        if (!courierName) courierName = genCourier.name || null;
        if (!courierService) courierService = genCourier.service || null;
        if (!courierLink) courierLink = genCourier.link || null;
        if (!trackingNumber) trackingNumber = genData.tracking_id || genCourier.tracking_id || null;

        console.log(`[biteship-webhook] After generate_waybill:`, {
          waybill_url: waybillUrl ? "(present)" : "(null)",
          waybill_id: waybillId || "(null)",
          waybill_url_source: waybillUrlSource,
        });
      } else {
        generateError = genData?.error?.message || `HTTP ${genResp.status}: ${JSON.stringify(genData).substring(0, 200)}`;
        console.warn(`[biteship-webhook] generate_waybill failed: ${generateError}`);
      }
    } catch (err) {
      generateError = `Network error: ${err?.message}`;
      console.warn(`[biteship-webhook] generate_waybill network error:`, err?.message);
    }
  }

  // ⭐ v3.2 Final fallback: kalau waybill_url MASIH NULL, construct dari biteship_order_id (PDF link)
  // Pattern: https://biteship.com/waybill/{biteship_order_id}.pdf
  // Ini bukan customer tracking URL, tapi minimal ada URL untuk waybill PDF
  if (!waybillUrl) {
    waybillUrl = `https://biteship.com/waybill/${biteshipOrderId}.pdf`;
    waybillUrlSource = "fallback_pdf_constructed";
    console.log(`[biteship-webhook] ⚠️ Final fallback — constructed PDF waybill URL: ${waybillUrl}`);
  }

  return {
    waybill_url: waybillUrl,
    waybill_id: waybillId,
    courier_link: courierLink,
    tracking_number: trackingNumber,
    courier_name: courierName,
    courier_service: courierService,
    biteship_status: biteshipStatus,
    pickup_code: pickupCode,
    raw: rawDetail,
    waybill_url_source: waybillUrlSource,
    generate_attempted: generateAttempted,
    generate_error: generateError,
  };
}

/**
 * Trigger WA shipping_update via fetch dengan Authorization eksplisit
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
    console.log("[biteship-webhook] 📥 Raw body (truncated 2000 chars):", rawText.substring(0, 2000));
    body = JSON.parse(rawText);
  } catch (err) {
    console.warn("[biteship-webhook] Body bukan JSON valid:", err?.message);
    return json({ success: true, message: "biteship-webhook ready (invalid JSON, acknowledged)" }, 200);
  }

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return json({ success: true, message: "biteship-webhook ready" }, 200);
  }

  // ── Extract fields dari webhook body ──
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

  console.log("[biteship-webhook] 📋 Parsed payload from webhook body:", {
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

  // ⭐ v3.2 DEEP DIVE FIX: Fetch Biteship order detail kalau waybill_url atau courier info NULL
  // Sekarang pakai fetchBiteshipOrderDetail yang lebih robust (multiple fallback strategies)
  let fetchedWaybillUrl: string | null = waybillUrl;
  let fetchedTrackingNumber: string | null = null;
  let fetchDetailResult: any = null;
  let waybillUrlSource = waybillUrl ? "webhook_body" : "none";
  let generateAttempted = false;
  let generateError: string | null = null;

  if (!waybillUrl || !courierLink) {
    console.log("[biteship-webhook] waybill_url/courier_link missing in webhook body — fetching from Biteship API with deep dive fallback...");
    const orderDetail = await fetchBiteshipOrderDetail(biteshipOrderId);
    if (orderDetail) {
      fetchDetailResult = orderDetail;
      waybillUrlSource = orderDetail.waybill_url_source;
      generateAttempted = orderDetail.generate_attempted;
      generateError = orderDetail.generate_error;

      if (!waybillUrl && orderDetail.waybill_url) {
        fetchedWaybillUrl = orderDetail.waybill_url;
        updatePayload.biteship_waybill_url = orderDetail.waybill_url;
        console.log(`[biteship-webhook] ✓ Fetched waybill_url from Biteship API (source: ${waybillUrlSource}):`, orderDetail.waybill_url);
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
      // Update biteship_status kalau belum ada di webhook body tapi ada di API response
      if (!biteshipStatus && orderDetail.biteship_status) {
        updatePayload.biteship_status = orderDetail.biteship_status;
        const newEgluxStatus = mapBiteshipStatusToEglux(orderDetail.biteship_status);
        if (newEgluxStatus) {
          updatePayload.status = newEgluxStatus;
          console.log(`[biteship-webhook] 🔄 Status mapping (from API): ${orderDetail.biteship_status} → ${newEgluxStatus}`);
        }
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
    biteship_waybill_url: updatedOrder.biteship_waybill_url || "(NULL)",
    courier_link: updatedOrder.courier_link ? "(present)" : "(null)",
  });

  // ============================================================================
  // ⭐ v3.2: Trigger WA shipping_update saat shipment started
  // WAYBILL_URL yang dikirim = biteship_waybill_url dari DB (bukan fallback)
  // ============================================================================
  let waShippingResult: { success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string } | null = null;

  if (isShipmentStarted(biteshipStatus)) {
    console.log(`[biteship-webhook] 📦 Shipment started (status=${biteshipStatus}). Triggering WA shipping_update...`);

    const trackingNumber = updatedOrder.tracking_number || fetchedTrackingNumber || undefined;
    // ⭐ v3.2: prioritas waybill_url dari DB (sudah di-fetch dengan robust logic)
    const finalWaybillUrl = updatedOrder.biteship_waybill_url || fetchedWaybillUrl || undefined;

    console.log(`[biteship-webhook] WA shipping_update details:`, {
      order_id: updatedOrder.id,
      tracking_number: trackingNumber || "(none)",
      waybill_url: finalWaybillUrl || "(none)",
      waybill_url_source: waybillUrlSource,
    });

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
    waybill_url_source: waybillUrlSource,
    waybill_url_final: updatedOrder.biteship_waybill_url || null,
    generate_waybill: {
      attempted: generateAttempted,
      error: generateError,
    },
    wa_shipping_update: waShippingResult ? {
      triggered: true,
      success: waShippingResult.success,
      skipped: waShippingResult.skipped || false,
      skip_reason: waShippingResult.skip_reason || null,
      error: waShippingResult.error || null,
      waybill_url_used: waShippingResult.data?.template_params?.["6"] || null,
    } : {
      triggered: false,
      reason: `Biteship status ${biteshipStatus} not in shipment-started list`,
    },
  });
});
