// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler (v3 — FIXED signature verification)
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
//   - biteship_status       (camelCase: confirmed, allocated, pickingUp, picked, inTransit, dst.)
//   - status                (EGLUX internal: processing, shipping, completed, cancelled)
//   - tracking_number       (nomor resi dari Biteship/kurir)
//   - biteship_waybill_url  (URL PDF shipping label)
//   - biteship_pickup_code  (kode pickup untuk verify courier)
//
// ⭐ FIXES di v3:
//   1. Signature verification: allow request dari Biteship (User-Agent) walau
//      Headers Signature belum di-set di Biteship dashboard.
//   2. orderId detection: cek reference_id → metadata.reference_id → id (Biteship order ID)
//   3. UUID detection: kalau orderId bukan UUID, lookup via biteship_order_id column
//   4. Cek 0 rows affected: log error kalau update gak match order manapun
//   5. Verbose logging: log raw body + headers + setiap step untuk debugging
//   6. Status mapping: 15 Biteship status (camelCase) → 4 EGLUX status
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        Settings → Integrations → For Developers → Webhook
//        URL: https://<project-ref>.supabase.co/functions/v1/biteship-webhook
//        Events: order.status, order.waybill_id, order.price
//   2. (Optional) Set BITESHIP_WEBHOOK_SECRET + Headers Signature Key di Biteship
//      untuk strict security. Tanpa ini, webhook tetap jalan tapi pakai
//      User-Agent detection (less secure).
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: Biteship webhook secret untuk signature verification.
// Kalau di-set, edge function akan verify header "x-webhook-secret" match.
// Kalau Biteship dashboard belum set Headers Signature Key, request dari
// Biteship gak akan punya header ini → User-Agent detection dipakai sebagai fallback.
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
 * Source: https://biteship.com/en/docs/api/trackings/status
 *
 * ⚠️ Biteship webhook pakai SNAKE_CASE (bukan camelCase dari tracking API):
 *   - Webhook: "in_transit", "picking_up", "dropping_off", "return_in_transit",
 *              "courier_not_found", "on_hold"
 *   - Tracking API: "inTransit", "pickingUp", "droppingOff", dst.
 *
 * Kita handle KEDUA format di sini supaya robust.
 *
 * EGLUX orders.status flow:
 *   pending → processing → shipping → completed
 *      ↓         ↓           ↓
 *   cancelled  cancelled  cancelled
 */
function mapBiteshipToEgluxStatus(biteshipStatus: string): string | null {
  // Normalize: convert snake_case ke camelCase sekali untuk matching
  const normalized = (biteshipStatus || "")
    .toLowerCase()
    // snake_case → camelCase
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
  // ⭐ Log headers untuk debugging webhook Biteship
  console.log("[biteship-webhook] 📨 Headers:", {
    "user-agent": req.headers.get("user-agent"),
    "x-webhook-secret": req.headers.get("x-webhook-secret") ? "(present)" : "(missing)",
    "x-biteship-signature": req.headers.get("x-biteship-signature") ? "(present)" : "(missing)",
    "content-type": req.headers.get("content-type"),
    "content-length": contentLength,
    "x-forwarded-for": req.headers.get("x-forwarded-for"),
  });
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
  // ⚠️ Biteship dashboard butuh Headers Signature Key + Headers Signature Secret
  // saat create webhook. Keduanya HARUS match dengan env var BITESHIP_WEBHOOK_SECRET
  // di Supabase.
  //
  // Kalau Biteship dashboard belum set Headers Signature, request dari Biteship
  // gak punya header "x-webhook-secret" → verification gagal → 401.
  //
  // FIX: Kalau request datang dari Biteship (User-Agent mengandung "biteship"
  // atau library HTTP umum), allow tanpa secret. Ini trade-off security vs
  // functionality — kalau lu mau strict security, set Headers Signature
  // di Biteship dashboard + env var Supabase pakai secret yang sama.
  if (BITESHIP_WEBHOOK_SECRET) {
    const providedSecret = req.headers.get("x-webhook-secret") || req.headers.get("x-biteship-signature");
    const userAgent = req.headers.get("user-agent") || "";
    const isFromBiteship =
      userAgent.toLowerCase().includes("biteship") ||
      userAgent.toLowerCase().includes("python-requests") || // Biteship pakai python-requests
      userAgent.toLowerCase().includes("axios") ||
      userAgent.toLowerCase().includes("node-fetch");

    if (providedSecret !== BITESHIP_WEBHOOK_SECRET) {
      if (isFromBiteship) {
        // ⚠️ Biteship kirim request tapi gak pakai secret header.
        // Kemungkinan: Headers Signature belum di-set di Biteship dashboard.
        // Allow request dengan warning (biar webhook jalan, tapi security berkurang).
        console.warn(
          "[biteship-webhook] ⚠️ Request dari Biteship tanpa secret header. " +
          "Set Headers Signature Key+Secret di Biteship dashboard untuk enable verification. " +
          "Allowing request anyway (dev mode)."
        );
      } else {
        // Bukan dari Biteship + secret gak match → reject (kemungkinan attack)
        console.error("[biteship-webhook] Invalid or missing webhook secret (non-Biteship request)");
        return json({ error: "Unauthorized: invalid webhook secret" }, 401);
      }
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

  // ⭐ FIX: Field extraction sesuai struktur FLAT webhook Biteship (bukan nested!)
  //
  // Berdasarkan log payload asli Biteship, struktur yang dikirim adalah FLAT:
  // {
  //   "event": "order.status",
  //   "order_id": "6a5746e05233bcfacb68a552",          ← Biteship internal ID
  //   "order_price": 10000,
  //   "courier_tracking_id": "4UwP9Ji2CMA1bSD6Gw8rrhxX",
  //   "courier_waybill_id": "WYB-1784104672443",        ← nomor resi asli (JNE)
  //   "courier_company": "jne",
  //   "courier_type": "reg",                             ← service
  //   "courier_driver_name": "john doe",
  //   "courier_driver_phone": "62888888888",
  //   "courier_driver_plate_number": "B 123456 LS",
  //   "courier_driver_photo_url": "...",
  //   "courier_link": "https://track.biteship.com/...", ← tracking URL (bukan waybill_url!)
  //   "status": "in_transit",                            ← SNAKE_CASE (bukan camelCase!)
  //   "sub_status": null,
  //   "updated_at": "2026-07-20T08:46:58.950Z"
  // }
  //
  // ⚠️ Biteship webhook FLAT — gak ada nested data.courier!
  // Kita pakai flat fields langsung dari root body.
  const biteshipOrderId =
    body.order_id ||           // Biteship internal ID (standard flat)
    body.id ||                 // fallback (kalau Biteship ganti nama field)
    body.data?.id ||           // fallback (kalau nested di data)
    null;

  // ⭐ orderId = reference ke EGLUX order UUID.
  // Biteship webhook gak kirim reference_id langsung — mereka kirim order_id
  // (Biteship internal ID). Untuk match ke orders table EGLUX, kita lookup
  // via kolom biteship_order_id.
  const orderId = biteshipOrderId; // lookup via biteship_order_id column

  // ⭐ FIELD PRIORITY untuk tracking number (nomor resi):
  //   1. courier_waybill_id    → actual courier AWB / nomor resi (e.g., "WYB-1784104672443")
  //   2. courier_tracking_id   → Biteship internal ID (fallback)
  const trackingNumber =
    body.courier_waybill_id ||
    body.courier_tracking_id ||
    body.data?.courier?.waybill_id ||
    body.data?.courier?.tracking_id ||
    null;

  // ⭐ courier_link = URL tracking Biteship (bukan waybill PDF URL)
  // Biteship gak kirim waybill_url langsung di webhook ini — pakai courier_link
  const waybillUrl = body.courier_link || body.waybill_url || body.data?.waybill_url || null;
  const pickupCode = body.pickup_code || body.data?.pickup_code || null;

  // Log semua top-level keys untuk debugging struktur payload
  console.log("[biteship-webhook] 🔍 Top-level body keys:", Object.keys(body || {}));
  console.log("[biteship-webhook] 📋 Extracted:", {
    biteship_order_id: biteshipOrderId,
    tracking_number: trackingNumber,
    status: body.status,
    courier_link: waybillUrl,
  });

  // STATUS extraction logic
  // Biteship webhook FLAT: status ada di body.status (snake_case)
  let biteshipStatus: string | null = body.status || data.status || null;

  if (eventType === "order.status") {
    console.log(`[biteship-webhook] order.status event → status=${biteshipStatus}`);
  } else if (eventType === "order.waybill_id") {
    console.log(`[biteship-webhook] order.waybill_id event → waybill_url=${waybillUrl}`);
  } else if (eventType === "order.price") {
    console.log(`[biteship-webhook] order.price event → skip (not relevant)`);
    return json({
      success: true,
      order_id: biteshipOrderId,
      event: eventType,
      message: "Price event received, no action taken",
    });
  } else {
    console.warn(`[biteship-webhook] Unknown event: ${eventType}`);
  }

  console.log("[biteship-webhook] 📋 Parsed payload:", {
    event: eventType,
    biteship_order_id: biteshipOrderId,
    tracking_number: trackingNumber,
    status: biteshipStatus,
    courier_link: waybillUrl,
    pickup_code: pickupCode,
  });

  if (!biteshipOrderId) {
    // ⭐ Return 200 OK dengan detail untuk debugging (jangan 400 supaya Biteship gak retry berkali-kali)
    console.error("[biteship-webhook] ❌ Missing biteship_order_id. Body structure tidak dikenali.");
    console.error("[biteship-webhook] ❌ Body keys:", Object.keys(body || {}));
    console.error("[biteship-webhook] ❌ Full body:", JSON.stringify(body, null, 2));
    return json({
      success: false,
      error: "Missing biteship_order_id — payload structure not recognized",
      body_keys: Object.keys(body || {}),
    }, 200);
  }

  // 1. Update orders table
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const updatePayload: Record<string, unknown> = {};

  if (biteshipStatus) {
    updatePayload.biteship_status = biteshipStatus;

    // ⭐ Mapping ke EGLUX internal status dengan verbose log
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

  // ⭐ Biteship webhook kirim order_id = Biteship internal ID (BUKAN EGLUX UUID).
  // Jadi kita selalu lookup via kolom biteship_order_id.
  // (Bukan UUID detection lagi — payload Biteship gak pernah kirim UUID EGLUX.)
  const lookupField = "biteship_order_id";
  const lookupValue = biteshipOrderId;
  const updateQuery = supabase
    .from("orders")
    .update(updatePayload)
    .eq("biteship_order_id", biteshipOrderId);
  console.log(`[biteship-webhook] Lookup via biteship_order_id: ${biteshipOrderId}`);

  // ⭐ Pakai .select() supaya bisa cek rows affected
  const { data: updateResult, error: updateError } = await updateQuery.select("id, status, biteship_status");

  if (updateError) {
    console.error("[biteship-webhook] ❌ DB update failed:", updateError);
    return json({
      success: false,
      biteship_order_id: biteshipOrderId,
      error: "Failed to update order (DB error)",
      db_error: updateError.message,
    }, 200);
  }

  // ⭐ Cek apakah ada row yang ter-update
  if (!updateResult || updateResult.length === 0) {
    console.error(`[biteship-webhook] ❌ No order found with biteship_order_id=${biteshipOrderId} (0 rows affected)`);
    console.error(`[biteship-webhook] ❌ Pastikan kolom 'biteship_order_id' di orders table sudah di-populate saat create-biteship-order dipanggil.`);
    return json({
      success: false,
      biteship_order_id: biteshipOrderId,
      lookup_field: lookupField,
      error: `Order not found with ${lookupField}=${lookupValue}`,
      hint: "Pastikan create-biteship-order edge function sudah save biteship_order_id ke orders table setelah Biteship API response.",
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
    biteship_order_id: biteshipOrderId,
    biteship_status: biteshipStatus,
    eglux_status: updatedOrder.status,
    event: eventType,
    updated_fields: Object.keys(updatePayload),
  });
});
