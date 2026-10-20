// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Notification Handler v2.0 (Skenario B - Qiscus API)
// ============================================================================
//
// ⭐ v2.0 CHANGES:
//   - ADD: Trigger WA shipping_update saat Biteship notify status berubah ke:
//     "allocated" (courier assigned), "picking" / "pickingUp" (courier on the way),
//     "picked" (courier picked up package). Customer akan dapat WA dengan
//     tracking number + courier info.
//   - Idempotent: cek waba_messages table dulu, kalau shipping_update sudah pernah
//     di-send untuk order ini, skip (hindari double-WA kalau Biteship retry webhook)
//   - Pakai fetch dengan Authorization eksplisit (pattern yang proven work di midtrans-webhook)
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
//   - biteship_status   (camelCase: confirmed, allocated, pickingUp, dst.)
//   - status            (EGLUX internal: processing, shipping, completed, cancelled)
//   - biteship_waybill_url (kalau ada)
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        URL: https://<project-ref>.supabase.co/functions/v1/biteship-webhook
//        Events: order.status, order.waybill_id, order.price
//   2. Set env var BITESHIP_WEBHOOK_SECRET untuk strict security (recommended)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: Biteship webhook secret untuk signature verification
const BITESHIP_WEBHOOK_SECRET = Deno.env.get("BITESHIP_WEBHOOK_SECRET");

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
 *
 * ⭐ v2.0: Status mapping konsisten dengan sebelumnya
 *
 * Biteship status flow (snake_case dari webhook):
 *   confirmed → allocated → pickingUp → picked → inTransit → droppingOff → onHold → delivered
 *
 * EGLUX orders.status flow:
 *   pending → processing → shipping → completed (or cancelled)
 */
function mapBiteshipStatusToEglux(biteshipStatus: string | null | undefined): string | null {
  if (!biteshipStatus) return null;

  // Normalisasi: snake_case → camelCase (kalau webhook kirim snake_case)
  // "in_transit" → "inTransit", "picking_up" → "pickingUp"
  const normalized = String(biteshipStatus)
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  switch (normalized) {
    // Pre-pickup (courier belum ambil paket) → processing
    case "confirmed":
    case "allocated":
    case "pickingUp":
      return "processing";
    // Pickup done, dalam perjalanan → shipping
    case "picked":
    case "inTransit":
    case "droppingOff":
    case "onHold":
      return "shipping";
    // Sampai tujuan → completed
    case "delivered":
      return "completed";
    // Semua status cancelled-like → cancelled
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
 * ⭐ v2.0 NEW: Cek apakah Biteship status menandakan order sedang dalam proses
 * shipment (courier assigned / picking up / picked up). Ini trigger WA shipping_update.
 */
function isShipmentStarted(biteshipStatus: string | null | undefined): boolean {
  if (!biteshipStatus) return false;
  const normalized = String(biteshipStatus)
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // allocated: courier assigned, belum pickup
  // pickingUp: courier on the way to pickup
  // picked: courier picked up package, in transit
  // inTransit: in transit to destination
  // droppingOff: dropping off at destination
  return ["allocated", "pickingUp", "picked", "inTransit", "droppingOff"].includes(normalized);
}

/**
 * Cek apakah string adalah UUID v4
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ⭐ v2.0 NEW: Helper untuk trigger WA via fetch dengan Authorization eksplisit
async function triggerWabaShippingUpdate(
  order_id: string,
  tracking_number: string | undefined,
  context: string = "biteship-webhook"
): Promise<{ success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string }> {
  // ── Idempotency check: jangan kirim WA ganda kalau webhook retry ──
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: existingWaba, error: checkErr } = await supabase
      .from("waba_messages")
      .select("id, status, event")
      .eq("order_id", order_id)
      .eq("event", "shipping_update")
      .in("status", ["sent", "pending", "test_sent"])  // sukses atau lagi pending
      .limit(1);

    if (checkErr) {
      console.warn(`[${context}] Idempotency check failed (continue anyway):`, checkErr.message);
    } else if (existingWaba && existingWaba.length > 0) {
      console.log(`[${context}] ✓ shipping_update WA sudah pernah dikirim untuk order ini (idempotent skip). existing_id:`, existingWaba[0].id);
      return { success: false, skipped: true, skip_reason: "shipping_update WA already sent for this order" };
    }
  } catch (idempErr) {
    console.warn(`[${context}] Idempotency check error (continue anyway):`, idempErr?.message);
  }

  // ── Trigger send-waba-live via fetch (Authorization eksplisit) ──
  const requestBody: any = { order_id, event: "shipping_update" };
  if (tracking_number) {
    requestBody.tracking_number = tracking_number;
  }

  console.log(`[${context}] Triggering send-waba-live (shipping_update)...`, { order_id, tracking_number: tracking_number || "(none from body, will fetch from DB)" });

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-waba-live`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`[${context}] send-waba-live (shipping_update) HTTP status:`, response.status);

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      result = { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 100)}` };
    }

    if (!response.ok) {
      console.warn(`[${context}] ✗ send-waba-live (shipping_update) HTTP ${response.status}:`, result?.error || result);
      return { success: false, data: result, error: result?.error || `HTTP ${response.status}` };
    }

    if (result?.success) {
      console.log(`[${context}] ✓ WA shipping_update sent:`, result.qiscus_message_id);
    } else {
      console.warn(`[${context}] send-waba-live (shipping_update) returned non-success:`, result?.error);
    }

    return { success: !!result?.success, data: result };
  } catch (err) {
    console.error(`[${context}] send-waba-live (shipping_update) invoke error:`, err?.message);
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
      console.warn("[biteship-webhook] ⚠️ Request dari Biteship tanpa secret header. Allowing with warning.");
    } else if (providedSecret !== BITESHIP_WEBHOOK_SECRET) {
      console.error("[biteship-webhook] Invalid or missing webhook secret (non-Biteship request)");
      return json({ error: "Unauthorized: invalid webhook secret" }, 401);
    }
  } else {
    console.warn("[biteship-webhook] BITESHIP_WEBHOOK_SECRET not set — webhook unauthenticated (dev mode)");
  }

  // ── Parse body ──
  let body: any;
  try {
    const rawText = await req.text();
    console.log("[biteship-webhook] 📥 Raw body:", rawText.substring(0, 2000));
    body = JSON.parse(rawText);
  } catch (err) {
    console.warn("[biteship-webhook] Body bukan JSON valid, returning 200 OK for safety:", err?.message);
    return json({ success: true, message: "biteship-webhook ready (invalid JSON, acknowledged)" }, 200);
  }

  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    // Verification request dari Biteship saat setup webhook
    return json({ success: true, message: "biteship-webhook ready" }, 200);
  }

  // Extract fields
  const eventType: string = body.event || "order.status";
  const data: any = body.data || body;

  // Biteship webhook FLAT: status ada di body.status (snake_case)
  let biteshipStatus: string | null = body.status || data.status || null;

  // courier info
  const courierName: string | null = body.courier?.name || data.courier?.name || body.courier_name || null;
  const courierService: string | null = body.courier?.service || data.courier?.service || body.courier_service || null;
  const courierLink: string | null = body.courier?.link || data.courier?.link || body.courier_link || null;
  const waybillUrl: string | null = body.waybill_url || data.waybill_url || body.courier?.waybill_url || null;

  // Biteship internal order_id
  const biteshipOrderId: string | null = body.id || data.id || body.order_id || data.order_id || null;

  // Notes/price (for order.price event)
  const price: number | null = body.price || data.price || null;

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
    courier_name: courierName,
    courier_service: courierService,
    waybill_url: waybillUrl,
    courier_link: courierLink,
    price,
  });

  if (!biteshipOrderId) {
    console.error("[biteship-webhook] ❌ Missing biteship_order_id");
    return json({ error: "Missing biteship_order_id" }, 400);
  }

  // ── Map Biteship status ke EGLUX status ──
  const egluxStatus = mapBiteshipStatusToEglux(biteshipStatus);

  // ── Build update payload ──
  const updatePayload: any = {};

  if (biteshipStatus) {
    updatePayload.biteship_status = biteshipStatus;
    if (egluxStatus) {
      updatePayload.status = egluxStatus;
      console.log(`[biteship-webhook] 🔄 Status mapping: ${biteshipStatus} → ${egluxStatus}`);
    } else {
      console.warn(`[biteship-webhook] ⚠️ No mapping for biteshipStatus: ${biteshipStatus}`);
    }
  } else {
    console.warn("[biteship-webhook] ⚠️ biteshipStatus is null/empty");
  }

  if (waybillUrl) {
    updatePayload.biteship_waybill_url = waybillUrl;
  }
  if (courierName) {
    updatePayload.courier_name = courierName;
  }
  if (courierService) {
    updatePayload.courier_service = courierService;
  }

  if (Object.keys(updatePayload).length === 0) {
    console.log("[biteship-webhook] No fields to update, returning OK");
    return json({ success: true, message: "No fields to update" }, 200);
  }

  // ── Update orders table (lookup by biteship_order_id) ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const updateQuery = supabase
    .from("orders")
    .update(updatePayload)
    .eq("biteship_order_id", biteshipOrderId);

  const { data: updateResult, error: updateError } = await updateQuery.select("id, status, biteship_status, tracking_number, courier_code, courier_service");

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
    updated_fields: Object.keys(updatePayload),
  });

  // ============================================================================
  // ⭐ v2.0 NEW: Trigger WA shipping_update saat Biteship notify shipment started
  // Condition: biteshipStatus menandakan shipment sudah mulai (allocated/picking/picked)
  // Idempotent: cek waba_messages dulu (kalau sudah dikirim, skip)
  // ============================================================================
  let waShippingResult: { success: boolean; data?: any; error?: string; skipped?: boolean; skip_reason?: string } | null = null;

  if (isShipmentStarted(biteshipStatus)) {
    console.log(`[biteship-webhook] 📦 Shipment started (status=${biteshipStatus}). Triggering WA shipping_update...`);
    waShippingResult = await triggerWabaShippingUpdate(
      updatedOrder.id,
      updatedOrder.tracking_number || undefined,
      "biteship-webhook"
    );
  } else {
    console.log(`[biteship-webhook] Shipment not yet started (status=${biteshipStatus}). Skip WA shipping_update.`);
  }

  // ============================================================================
  // EMAIL NOTIFICATION via Resend: trigger saat status berubah ke 'shipping'
  // (Biteship picking_up/picked/in_transit → EGLUX status='shipped')
  // ============================================================================
  if (egluxStatus === "shipping") {
    try {
      const emailResp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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