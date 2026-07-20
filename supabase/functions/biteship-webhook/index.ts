// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler (v2 — FIXED)
// ============================================================================
//
// Receive POST dari Biteship saat status order berubah:
//   - Order confirmed (courier assigned)
//   - Order processing (courier picked up)
//   - Order shipping (in transit)
//   - Order delivered (sampai tujuan)
//   - Order cancelled
//
// Update orders table:
//   - biteship_status       (camelCase: confirmed, allocated, pickingUp, picked, inTransit, droppingOff, delivered, dst.)
//   - status                (EGLUX internal: processing, shipping, completed, cancelled)
//   - tracking_number       (nomor resi dari Biteship/kurir)
//   - biteship_waybill_url  (URL PDF shipping label)
//   - biteship_pickup_code  (kode pickup untuk verify courier)
//
// ⭐ FIXES di v2:
//   1. orderId detection: cek reference_id → metadata.reference_id → id (Biteship order ID)
//   2. UUID detection: kalau orderId bukan UUID, lookup via biteship_order_id column
//   3. Cek 0 rows affected: log error kalau update gak match order manapun
//   4. Verbose logging: log setiap step untuk debugging
//   5. Status mapping: 15 Biteship status (camelCase) → 4 EGLUX status
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        Settings → Integrations → For Developers → Webhook
//        URL: https://<project-ref>.supabase.co/functions/v1/biteship-webhook
//        Events: order.status, order.waybill_id, order.price
//   2. (Optional) Set BITESHIP_WEBHOOK_SECRET + Headers Signature Key di Biteship
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: Biteship webhook secret untuk signature verification.
const BITESHIP_WEBHOOK_SECRET = Deno.env.get("BITESHIP_WEBHOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-biteship-signature",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/**
 * ⭐ Map Biteship status ke EGLUX internal order status
 *
 * Source: https://biteship.com/en/docs/api/trackings/status (15 status, camelCase)
 *
 * Biteship status flow:
 *   confirmed → allocated → pickingUp → picked → inTransit → droppingOff → delivered
 *        ↓          ↓           ↓          ↓          ↓           ↓
 *    cancelled  cancelled  cancelled  cancelled  cancelled  cancelled
 *
 * EGLUX orders.status flow:
 *   pending → processing → shipping → completed
 *      ↓         ↓           ↓
 *   cancelled  cancelled  cancelled
 */
function mapBiteshipToEgluxStatus(biteshipStatus: string): string | null {
  switch (biteshipStatus) {
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
 * Cek apakah string adalah UUID v4 (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 */
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str || "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ⚠️ BITESHIP INSTALLATION VALIDATION:
  // Saat setup webhook di Biteship dashboard, Biteship kirim verification request
  // dengan EMPTY BODY atau non-JSON content. Function HARUS return 200 OK supaya
  // installation sukses.
  if (req.method === "GET" || req.method === "HEAD") {
    return json({ success: true, message: "biteship-webhook ready" }, 200);
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Cek Content-Length — kalau 0 atau tidak ada, kemungkinan installation request
  const contentLength = req.headers.get("content-length");
  if (!contentLength || contentLength === "0") {
    console.log("[biteship-webhook] Empty body received — likely installation verification");
    return json({ success: true, message: "OK — installation verification accepted" }, 200);
  }

  // Parse body secara defensive
  let body: any = null;
  let rawText = "";
  try {
    rawText = await req.text();
    if (!rawText || rawText.trim() === "") {
      console.log("[biteship-webhook] Empty text body — likely installation verification");
      return json({ success: true, message: "OK — installation verification accepted" }, 200);
    }
    body = JSON.parse(rawText);
    // ⭐ Log raw body untuk debugging (lihat di Supabase Dashboard → Logs)
    console.log("[biteship-webhook] 📥 Raw body:", rawText.substring(0, 2000));
  } catch (err) {
    console.warn("[biteship-webhook] Body bukan JSON valid, returning 200 OK for safety:", err?.message);
    return json({ success: true, message: "OK — accepted (non-JSON body)" }, 200);
  }

  // ── SIGNATURE VERIFICATION (kalau BITESHIP_WEBHOOK_SECRET di-set) ──
  if (BITESHIP_WEBHOOK_SECRET) {
    const providedSecret = req.headers.get("x-webhook-secret") || req.headers.get("x-biteship-signature");
    if (providedSecret !== BITESHIP_WEBHOOK_SECRET) {
      console.error("[biteship-webhook] Invalid or missing webhook secret");
      return json({ error: "Unauthorized: invalid webhook secret" }, 401);
    }
  } else {
    console.warn("[biteship-webhook] BITESHIP_WEBHOOK_SECRET not set — webhook unauthenticated (dev mode)");
  }

  // Validasi minimal
  if (!body || (typeof body !== "object")) {
    console.warn("[biteship-webhook] Body is not an object, returning 200 OK");
    return json({ success: true, message: "OK — accepted (non-object body)" }, 200);
  }

  // ⭐ BITESHIP HANYA ADA 3 EVENTS:
  //   - order.status    → trigger saat status berubah
  //   - order.waybill_id → trigger saat waybill/label tersedia
  //   - order.price     → trigger saat harga berubah (skip)
  //
  // Payload shape:
  // {
  //   "event": "order.status" | "order.price" | "order.waybill_id",
  //   "data": {
  //     "id": "biteship_order_id",
  //     "reference_id": "EGLUX order_id (UUID)",
  //     "courier": { "code": "jne", "service": "REG", "tracking_id": "...", "waybill_id": "..." },
  //     "waybill_url": "https://...",
  //     "pickup_code": "...",
  //     "status": "confirmed" | "processing" | "shipping" | "delivered" | "cancelled",
  //     ...
  //   }
  // }

  const eventType: string = body?.event || "";
  const data: any = body?.data || {};

  // ⭐ FIX #1: Field priority untuk orderId (EGLUX UUID):
  //   1. data.reference_id    → standard Biteship field
  //   2. data.metadata.reference_id → kalau Biteship nested di metadata
  //   3. data.id              → Biteship order ID (fallback, BUKAN EGLUX UUID)
  //
  // Bug sebelumnya: kalau reference_id gak ada di payload, orderId = undefined
  // → update .eq("id", undefined) = 0 rows affected → status gak update!
  const orderId = data.reference_id || data.metadata?.reference_id || data.id || null;
  const biteshipOrderId = data.id;

  // ⭐ FIELD PRIORITY untuk tracking number (nomor resi):
  //   1. courier.waybill_id    → actual courier AWB / nomor resi
  //   2. courier.tracking_id   → Biteship internal ID (fallback)
  //   3. courier.tracking_number → legacy field name (defensive)
  const trackingNumber = data.courier?.waybill_id || data.courier?.tracking_id || data.courier?.tracking_number;
  const waybillUrl = data.waybill_url;
  const pickupCode = data.pickup_code;

  // STATUS extraction logic
  let biteshipStatus: string | null = null;

  if (eventType === "order.status") {
    biteshipStatus = data.status || null;
    console.log(`[biteship-webhook] order.status event → status=${biteshipStatus}`);
  } else if (eventType === "order.waybill_id") {
    biteshipStatus = data.status || null;
    console.log(`[biteship-webhook] order.waybill_id event → waybill_url=${waybillUrl}`);
  } else if (eventType === "order.price") {
    console.log(`[biteship-webhook] order.price event → skip (not relevant)`);
    return json({
      success: true,
      order_id: orderId,
      event: eventType,
      message: "Price event received, no action taken",
    });
  } else {
    biteshipStatus = data.status || null;
    console.warn(`[biteship-webhook] Unknown event: ${eventType}`);
  }

  console.log("[biteship-webhook] 📋 Parsed payload:", {
    event: eventType,
    order_id: orderId,
    biteship_order_id: biteshipOrderId,
    tracking_number: trackingNumber,
    status: biteshipStatus,
    waybill_url: waybillUrl,
    pickup_code: pickupCode,
  });

  if (!orderId) {
    console.error("[biteship-webhook] ❌ Missing order identifier (reference_id, id, atau biteship_order_id)");
    return json({ error: "Missing order identifier" }, 400);
  }

  // 1. Update orders table
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const updatePayload: Record<string, unknown> = {};

  if (biteshipStatus) {
    updatePayload.biteship_status = biteshipStatus;

    // ⭐ FIX: Mapping ke EGLUX internal status dengan verbose log
    const egluxStatus = mapBiteshipToEgluxStatus(biteshipStatus);
    if (egluxStatus) {
      updatePayload.status = egluxStatus;
      console.log(`[biteship-webhook] 🔄 Status mapping: ${biteshipStatus} → ${egluxStatus}`);
    } else {
      console.warn(`[biteship-webhook] ⚠️ No mapping for biteshipStatus: ${biteshipStatus}`);
    }
  } else {
    console.warn("[biteship-webhook] ⚠️ biteshipStatus is null/empty — tidak ada status untuk update");
  }
  if (trackingNumber) updatePayload.tracking_number = trackingNumber;
  if (waybillUrl) updatePayload.biteship_waybill_url = waybillUrl;
  if (pickupCode) updatePayload.biteship_pickup_code = pickupCode;

  // Kalau payload kosong
  if (Object.keys(updatePayload).length === 0) {
    console.log("[biteship-webhook] No fields to update, returning OK");
    return json({
      success: true,
      order_id: orderId,
      event: eventType,
      message: "No fields to update",
    });
  }

  // ⭐ FIX #2: Determine update strategy
  //   - Kalau orderId adalah UUID → update by id (EGLUX orders.id)
  //   - Kalau orderId adalah Biteship order ID (bukan UUID) → lookup via biteship_order_id
  //
  // Bug sebelumnya: kalau Biteship kirim `id` (Biteship order ID) di payload
  // tapi `reference_id` kosong, update .eq("id", orderId) = 0 rows affected
  // (karena Biteship ID bukan EGLUX UUID)
  let updateQuery;
  let lookupField: string;
  if (isUUID(orderId)) {
    lookupField = "id";
    updateQuery = supabase.from("orders").update(updatePayload).eq("id", orderId);
  } else if (biteshipOrderId) {
    lookupField = "biteship_order_id";
    updateQuery = supabase.from("orders").update(updatePayload).eq("biteship_order_id", biteshipOrderId);
    console.log(`[biteship-webhook] orderId bukan UUID, lookup via biteship_order_id: ${biteshipOrderId}`);
  } else {
    console.error("[biteship-webhook] ❌ Tidak ada orderId atau biteshipOrderId untuk update");
    return json({ error: "Missing order identifier" }, 400);
  }

  // ⭐ FIX #3: Pakai .select() supaya bisa cek rows affected
  const { data: updateResult, error: updateError } = await updateQuery.select("id, status, biteship_status");

  if (updateError) {
    console.error("[biteship-webhook] ❌ DB update failed:", updateError);
    return json({
      success: false,
      order_id: orderId,
      error: "Failed to update order (DB error)",
      db_error: updateError.message,
    }, 200);
  }

  // ⭐ FIX #4: Cek apakah ada row yang ter-update
  if (!updateResult || updateResult.length === 0) {
    console.error(`[biteship-webhook] ❌ No order found with ${lookupField}=${orderId} (0 rows affected)`);
    return json({
      success: false,
      order_id: orderId,
      lookup_field: lookupField,
      error: `Order not found with ${lookupField}=${orderId}`,
    }, 200);
  }

  const updatedOrder = updateResult[0];
  console.log("[biteship-webhook] ✅ Order updated:", {
    order_id: updatedOrder.id,
    new_status: updatedOrder.status,
    new_biteship_status: updatedOrder.biteship_status,
    updated_fields: Object.keys(updatePayload),
  });

  return json({
    success: true,
    order_id: updatedOrder.id,
    biteship_status: biteshipStatus,
    eglux_status: updatedOrder.status,
    event: eventType,
    updated_fields: Object.keys(updatePayload),
  });
});
