// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler v3.3 (DEEP DIVE FIX + TRACKINGS ENDPOINT)
// ============================================================================
//
// ⭐ v3.3 CHANGES (dari v3.2):
//   - ADD: fetchBiteshipTrackingDetail() — call GET /v1/trackings/{biteship_order_id}
//     sebagai fallback kalau GET /v1/orders/{id} gak return waybill_url.
//     Trackings endpoint sering return waybill_url yang gak ada di orders endpoint.
//   - FIX: Authorization header pakai RAW API key (tanpa "Bearer " prefix).
//     Pattern ini match dengan existing functions (get-biteship-tracking,
//     generate-biteship-waybill) yang sudah proven work.
//   - ADD: Verbose logging buat trackings endpoint — buat debug visibility
//
// ⭐ v3.2 (previous):
//   - Multiple fallback strategies buat extract waybill_url
//   - Construct URL dari waybill_id
//   - Call generate_waybill endpoint
//
// DEEP DIVE FALLBACK STRATEGY (v3.3):
//   1. GET /v1/orders/{biteship_order_id} → top-level + nested courier.waybill_url
//   2. GET /v1/trackings/{biteship_order_id} → alternative endpoint (NEW v3.3)
//   3. Construct URL dari courier.waybill_id: https://track.biteship.com/{waybill_id}?environment={env}
//   4. POST /v1/orders/{id}/generate_waybill → force-generate
//   5. Re-extract dari generate_waybill response (nested + construct)
//   6. Final fallback: https://biteship.com/waybill/{biteship_order_id}.pdf
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
 * Construct waybill_url dari waybill_id
 * Format: https://track.biteship.com/{waybill_id}?environment={env}
 */
function constructWaybillUrlFromId(waybillId: string): string {
  return `https://track.biteship.com/${waybillId}?environment=${BITESHIP_ENV}`;
}

/**
 * ⭐ v3.3 NEW: GET /v1/trackings/{biteship_order_id} — alternative endpoint
 * untuk extract waybill_url. Trackings endpoint sering return waybill_url
 * yang gak ada di orders endpoint.
 *
 * Note: Authorization pakai RAW API key (no "Bearer " prefix) — match pattern
 * existing functions (get-biteship-tracking, generate-biteship-waybill).
 */
async function fetchBiteshipTrackingDetail(biteshipOrderId: string): Promise<{
  waybill_url: string | null;
  waybill_id: string | null;
  tracking_number: string | null;
  courier_link: string | null;
  courier_name: string | null;
  courier_service: string | null;
  biteship_status: string | null;
  raw: any;
} | null> {
  if (!BITESHIP_API_KEY) {
    console.warn("[biteship-webhook] BITESHIP_API_KEY not set — cannot fetch tracking detail");
    return null;
  }

  try {
    console.log(`[biteship-webhook] Fetching Biteship TRACKING detail for: ${biteshipOrderId}`);
    const resp = await fetch(`${BITESHIP_API_URL}/trackings/${biteshipOrderId}`, {
      method: "GET",
      headers: {
        // ⭐ v3.3: RAW API key (no "Bearer " prefix) — match existing pattern
        Authorization: BITESHIP_API_KEY,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.warn(`[biteship-webhook] Trackings API GET /trackings/${biteshipOrderId} returned HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    console.log(`[biteship-webhook] 📋 Trackings API response (truncated 1500 chars):`,
      JSON.stringify(data).substring(0, 1500));
    console.log(`[biteship-webhook] 📦 Trackings top-level keys:`, Object.keys(data || {}));

    // Extract from trackings response — multiple field paths
    const courier = data?.courier || {};

    return {
      // waybill_url: top-level + nested courier.waybill_url
      waybill_url: data?.waybill_url || courier.waybill_url || null,
      // waybill_id: nested courier.waybill_id + top-level
      waybill_id: courier.waybill_id || data?.waybill_id || null,
      // tracking_id
      tracking_number: data?.tracking_id || courier.tracking_id || null,
      courier_link: courier.link || null,
      courier_name: courier.name || null,
      courier_service: courier.service || null,
      biteship_status: data?.status || null,
      raw: data,
    };
  } catch (err) {
    console.warn(`[biteship-webhook] Trackings API fetch error:`, err?.message);
    return null;
  }
}

/**
 * ⭐ v3.3: Comprehensive waybill_url fetcher with multiple fallback strategies
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
  raw_order: any;
  raw_tracking: any;
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
  let rawOrder: any = null;
  let rawTracking: any = null;
  let waybillUrlSource = "none";
  let generateAttempted = false;
  let generateError: string | null = null;

  // ── Step 1: GET /v1/orders/{id} ──
  try {
    console.log(`[biteship-webhook] Step 1: GET /v1/orders/${biteshipOrderId}`);
    const resp = await fetch(`${BITESHIP_API_URL}/orders/${biteshipOrderId}`, {
      method: "GET",
      headers: {
        // ⭐ v3.3: RAW API key (match existing pattern)
        Authorization: BITESHIP_API_KEY,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      console.warn(`[biteship-webhook] Orders API returned HTTP ${resp.status}`);
    } else {
      rawOrder = await resp.json();

      console.log(`[biteship-webhook] 📋 Orders API response (truncated 1500 chars):`,
        JSON.stringify(rawOrder).substring(0, 1500));
      console.log(`[biteship-webhook] 📦 Orders top-level keys:`, Object.keys(rawOrder || {}));
      console.log(`[biteship-webhook] 📦 Orders courier keys:`, rawOrder?.courier ? Object.keys(rawOrder.courier) : "(no courier)");

      // Extract fields
      const courier = rawOrder?.courier || {};
      waybillUrl = rawOrder?.waybill_url || courier.waybill_url || null;
      waybillUrlSource = waybillUrl ? "orders_api" : "none";

      waybillId = courier.waybill_id || rawOrder?.waybill_id || null;
      trackingNumber = rawOrder?.tracking_id || courier.tracking_id || null;
      courierLink = courier.link || null;
      courierName = courier.name || null;
      courierService = courier.service || null;
      biteshipStatus = rawOrder?.status || null;
      pickupCode = rawOrder?.pickup_code || null;

      console.log(`[biteship-webhook] After Step 1 (Orders API):`, {
        waybill_url: waybillUrl || "(null)",
        waybill_id: waybillId || "(null)",
        tracking_id: trackingNumber || "(null)",
        courier_link: courierLink ? "(present)" : "(null)",
        courier_name: courierName || "(null)",
        biteship_status: biteshipStatus || "(null)",
      });

      // Construct dari waybill_id kalau waybill_url masih NULL
      if (!waybillUrl && waybillId) {
        waybillUrl = constructWaybillUrlFromId(waybillId);
        waybillUrlSource = "constructed_from_orders_waybill_id";
        console.log(`[biteship-webhook] ✓ Constructed waybill_url from orders waybill_id: ${waybillUrl}`);
      }
    }
  } catch (err) {
    console.warn(`[biteship-webhook] Orders API fetch error:`, err?.message);
  }

  // ── Step 2: GET /v1/trackings/{biteship_order_id} (NEW v3.3) ──
  if (!waybillUrl) {
    console.log(`[biteship-webhook] Step 2: waybill_url still NULL — calling trackings endpoint...`);
    const trackingResult = await fetchBiteshipTrackingDetail(biteshipOrderId);
    if (trackingResult) {
      rawTracking = trackingResult.raw;

      // Extract from trackings response (same field paths)
      if (trackingResult.waybill_url) {
        waybillUrl = trackingResult.waybill_url;
        waybillUrlSource = "trackings_api";
        console.log(`[biteship-webhook] ✓ Got waybill_url from trackings API: ${waybillUrl}`);
      }

      // Update waybill_id kalau belum ada
      if (!waybillId && trackingResult.waybill_id) {
        waybillId = trackingResult.waybill_id;
      }

      // Update other fields kalau belum ada
      if (!trackingNumber && trackingResult.tracking_number) {
        trackingNumber = trackingResult.tracking_number;
      }
      if (!courierLink && trackingResult.courier_link) {
        courierLink = trackingResult.courier_link;
      }
      if (!courierName && trackingResult.courier_name) {
        courierName = trackingResult.courier_name;
      }
      if (!courierService && trackingResult.courier_service) {
        courierService = trackingResult.courier_service;
      }
      if (!biteshipStatus && trackingResult.biteship_status) {
        biteshipStatus = trackingResult.biteship_status;
      }

      // Construct dari waybill_id kalau waybill_url masih NULL (tapi waybill_id dari trackings)
      if (!waybillUrl && waybillId) {
        waybillUrl = constructWaybillUrlFromId(waybillId);
        waybillUrlSource = "constructed_from_trackings_waybill_id";
        console.log(`[biteship-webhook] ✓ Constructed waybill_url from trackings waybill_id: ${waybillUrl}`);
      }
    }
  }

  // ── Step 3: POST /v1/orders/{id}/generate_waybill (force-generate) ──
  if (!waybillUrl) {
    console.log(`[biteship-webhook] Step 3: waybill_url still NULL — calling generate_waybill endpoint...`);
    generateAttempted = true;

    try {
      const genResp = await fetch(
        `${BITESHIP_API_URL}/orders/${biteshipOrderId}/generate_waybill`,
        {
          method: "POST",
          headers: {
            Authorization: BITESHIP_API_KEY,  // RAW key
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
        const genCourier = genData.courier || {};

        if (genData.waybill_url) {
          waybillUrl = genData.waybill_url;
          waybillUrlSource = "generate_waybill_api";
        } else if (genCourier.waybill_url) {
          waybillUrl = genCourier.waybill_url;
          waybillUrlSource = "generate_waybill_courier";
        }

        if (!waybillId) {
          waybillId = genCourier.waybill_id || genData.waybill_id || null;
        }

        // Construct dari waybill_id kalau waybill_url masih NULL
        if (!waybillUrl && waybillId) {
          waybillUrl = constructWaybillUrlFromId(waybillId);
          waybillUrlSource = "constructed_from_generate_waybill_id";
          console.log(`[biteship-webhook] ✓ Constructed waybill_url from generate_waybill waybill_id: ${waybillUrl}`);
        }

        // Update other fields
        if (!courierName) courierName = genCourier.name || null;
        if (!courierService) courierService = genCourier.service || null;
        if (!courierLink) courierLink = genCourier.link || null;
        if (!trackingNumber) trackingNumber = genData.tracking_id || genCourier.tracking_id || null;

        console.log(`[biteship-webhook] After generate_waybill:`, {
          waybill_url: waybillUrl || "(null)",
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

  // ── Step 4: Final fallback (kalau semua cara gagal) ──
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
    raw_order: rawOrder,
    raw_tracking: rawTracking,
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

  // ⭐ v3.3: Fetch Biteship order detail kalau waybill_url atau courier info NULL
  // Sekarang pakai multiple fallback strategies (orders + trackings + generate_waybill + construct)
  let fetchedWaybillUrl: string | null = waybillUrl;
  let fetchedTrackingNumber: string | null = null;
  let waybillUrlSource = waybillUrl ? "webhook_body" : "none";
  let generateAttempted = false;
  let generateError: string | null = null;

  if (!waybillUrl || !courierLink) {
    console.log("[biteship-webhook] waybill_url/courier_link missing — fetching from Biteship API (deep dive with trackings endpoint)...");
    const orderDetail = await fetchBiteshipOrderDetail(biteshipOrderId);
    if (orderDetail) {
      waybillUrlSource = orderDetail.waybill_url_source;
      generateAttempted = orderDetail.generate_attempted;
      generateError = orderDetail.generate_error;

      if (!waybillUrl && orderDetail.waybill_url) {
        fetchedWaybillUrl = orderDetail.waybill_url;
        updatePayload.biteship_waybill_url = orderDetail.waybill_url;
        console.log(`[biteship-webhook] ✓ Fetched waybill_url (source: ${waybillUrlSource}):`, orderDetail.waybill_url);
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
  // Trigger WA shipping_update saat shipment started
  // ============================================================================
  let waShippingResult: { success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string } | null = null;

  if (isShipmentStarted(biteshipStatus)) {
    console.log(`[biteship-webhook] 📦 Shipment started (status=${biteshipStatus}). Triggering WA shipping_update...`);

    const trackingNumber = updatedOrder.tracking_number || fetchedTrackingNumber || undefined;
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
