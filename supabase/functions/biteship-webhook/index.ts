// supabase/functions/biteship-webhook/index.ts
// ============================================================================
// Biteship Webhook Handler (STUB)
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
//   - biteship_status       (confirmed, processing, shipping, delivered, cancelled)
//   - tracking_number       (Biteship assign tracking number setelah confirmed)
//   - biteship_waybill_url  (URL PDF shipping label)
//   - biteship_pickup_code  (kode pickup untuk verify courier)
//
// Setup:
//   1. Set webhook URL di Biteship dashboard:
//        Settings → Webhooks → Add Webhook
//        URL: https://<project-ref>.supabase.co/functions/v1/biteship-webhook
//        Events: order.created, order.confirmed, order.processing,
//                order.shipping, order.delivered, order.cancelled
//   2. Set env var BITESHIP_WEBHOOK_SECRET (kalau ada signature verification)
//
// TODO (belum implemented — stub only):
//   - Verify Biteship webhook signature
//   - Map Biteship event_type ke internal biteship_status
//   - Update orders table
//   - Trigger WABA notification saat status berubah (optional)
//
// Catatan: Saat ini, Biteship order creation kemungkinan dilakukan manual
// via Biteship dashboard (screenshot 2 yang Boss kasih). Webhook ini akan
// auto-update status di DB Boss saat ada perubahan di Biteship.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: Biteship webhook secret untuk signature verification.
// Biteship tidak punya signature default, jadi pakai custom secret yang di-set
// di Biteship dashboard + Supabase env var. Kalau gak di-set, webhook bisa
// di-invoke siapapun (tidak ideal untuk production).
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
 * Map Biteship event_type ke internal biteship_status
 * Reference: Biteship webhook docs
 */
function mapBiteshipStatus(eventType: string): string | null {
  // Biteship event types (typical — verifikasi di Biteship dashboard):
  if (eventType.includes("confirmed")) return "confirmed";
  if (eventType.includes("processing")) return "processing";
  if (eventType.includes("shipping") || eventType.includes("in_transit")) return "shipping";
  if (eventType.includes("delivered")) return "delivered";
  if (eventType.includes("cancelled") || eventType.includes("cancel")) return "cancelled";
  return null;
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
 * Edge cases:
 *   - onHold: paket ditahan sementara (masalah dokumen, alamat, dst.) — tetap "shipping"
 *   - returnInTransit: dikembalikan ke pengirim — tetap "processing" (perlu follow-up)
 *   - returned: berhasil dikembalikan — "cancelled"
 *   - rejected: ditolak penerima — "cancelled"
 *   - courierNotFound: gak ada kurir — "cancelled"
 *   - disposed: disposal selesai — "cancelled"
 *
 * EGLUX orders.status flow (dari orders-schema-reference.md):
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
      return "cancelled";
    // returnInTransit: paket dikembalikan ke pengirim — anggap cancelled
    case "returnInTransit":
      return "cancelled";
    default:
      return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ⚠️ BITESHIP INSTALLATION VALIDATION:
  // Saat Boss setup webhook di Biteship dashboard, Biteship kirim verification request
  // dengan EMPTY BODY atau non-JSON content. Function HARUS return 200 OK supaya
  // installation sukses. Setelah installation, validation boleh di-applied.
  //
  // Strategy:
  //   - GET / HEAD: return 200 OK (health check)
  //   - POST dengan empty body: return 200 OK (installation verification)
  //   - POST dengan non-JSON body: return 200 OK (defensive — jangan fail)
  //   - POST dengan JSON body: process normally

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

  // Parse body secara defensive — return 200 OK walau JSON invalid
  let body: any = null;
  let rawText = "";
  try {
    rawText = await req.text();
    if (!rawText || rawText.trim() === "") {
      console.log("[biteship-webhook] Empty text body — likely installation verification");
      return json({ success: true, message: "OK — installation verification accepted" }, 200);
    }
    body = JSON.parse(rawText);
  } catch (err) {
    // Jangan fail — Biteship mungkin kirim format lain saat installation
    console.warn("[biteship-webhook] Body bukan JSON valid, returning 200 OK for safety:", err?.message);
    return json({ success: true, message: "OK — accepted (non-JSON body)" }, 200);
  }

  // ── SIGNATURE VERIFICATION (kalau BITESHIP_WEBHOOK_SECRET di-set) ──
  // Cara pakai:
  //   1. Set BITESHIP_WEBHOOK_SECRET di Supabase Edge Function env vars
  //   2. Add custom header di Biteship webhook config: X-Webhook-Secret: <secret>
  //   3. Function akan verify header ini cocok dengan env var
  // Kalau secret gak di-set (dev mode), skip check (akan log warning).
  if (BITESHIP_WEBHOOK_SECRET) {
    const providedSecret = req.headers.get("x-webhook-secret") || req.headers.get("x-biteship-signature");
    if (providedSecret !== BITESHIP_WEBHOOK_SECRET) {
      console.error("[biteship-webhook] Invalid or missing webhook secret");
      return json({ error: "Unauthorized: invalid webhook secret" }, 401);
    }
  } else {
    console.warn("[biteship-webhook] BITESHIP_WEBHOOK_SECRET not set — webhook unauthenticated (dev mode)");
  }

  // Validasi minimal — kalau body ada tapi tidak punya field yang expected,
  // tetap return 200 OK (Biteship bisa kirim webhook dengan shape berbeda dari asumsi kita)
  if (!body || (typeof body !== "object")) {
    console.warn("[biteship-webhook] Body is not an object, returning 200 OK");
    return json({ success: true, message: "OK — accepted (non-object body)" }, 200);
  }

  // ⚠️ BITESHIP HANYA ADA 3 EVENTS (verified by Boss):
  //   - order.status    → trigger saat status berubah (confirmed/processing/shipping/delivered/cancelled)
  //   - order.price     → trigger saat harga berubah (skip — tidak relevan untuk operasional)
  //   - order.waybill_id → trigger saat waybill/label tersedia
  //
  // Payload shape (per Biteship docs):
  // {
  //   "event": "order.status" | "order.price" | "order.waybill_id",
  //   "data": {
  //     "id": "biteship_order_id",
  //     "reference_id": "EGLUX order_id (UUID)",
  //     "courier": { "code": "jne", "service": "REG", "tracking_id": "JNE123456", "waybill_id": "..." },
  //     "waybill_url": "https://...",
  //     "pickup_code": "...",
  //     "status": "confirmed" | "processing" | "shipping" | "delivered" | "cancelled",
  //     ...
  //   }
  // }

  const eventType: string = body?.event || "";
  const data: any = body?.data || {};

  // reference_id = order_id EGLUX (yang kita pass saat create-biteship-order)
  const orderId = data.reference_id;
  const biteshipOrderId = data.id;

  // ⚠️ FIELD PRIORITY untuk tracking number (nomor resi):
  //   1. courier.waybill_id    → actual courier AWB / nomor resi (e.g., "WYB-1783418334923" untuk JNE)
  //   2. courier.tracking_id   → Biteship internal ID (e.g., "yvbKGFqRxOEfhH42DDsCxny0") — fallback kalau waybill belum generated
  //   3. courier.tracking_number → legacy field name (defensive)
  //
  // Customer butuh yang #1 (waybill_id) untuk tracking paket di website kurir.
  // tracking_id cuma untuk internal Biteship debugging.
  const trackingNumber = data.courier?.waybill_id || data.courier?.tracking_id || data.courier?.tracking_number;
  const waybillUrl = data.waybill_url;
  const pickupCode = data.pickup_code;

  // STATUS extraction logic untuk 3 events:
  //   - order.status event → ambil dari data.status (Biteship kirim value baru)
  //   - order.waybill_id event → status tetap, tapi waybill_url tersedia
  //   - order.price event → skip, return 200 OK tapi tidak update apa-apa
  let biteshipStatus: string | null = null;

  if (eventType === "order.status") {
    // Status berubah — ambil value dari data.status
    biteshipStatus = data.status || null;
    console.log(`[biteship-webhook] order.status event → status=${biteshipStatus}`);
  } else if (eventType === "order.waybill_id") {
    // Waybill tersedia — status tetap, tapi update waybill_url
    biteshipStatus = data.status || null; // mungkin tetap current status
    console.log(`[biteship-webhook] order.waybill_id event → waybill_url=${waybillUrl}`);
  } else if (eventType === "order.price") {
    // Price change — skip update, return OK
    console.log(`[biteship-webhook] order.price event → skip (not relevant)`);
    return json({
      success: true,
      order_id: orderId,
      event: eventType,
      message: "Price event received, no action taken",
    });
  } else {
    // Unknown event — defensive, tetap coba ambil status
    biteshipStatus = data.status || null;
    console.warn(`[biteship-webhook] Unknown event: ${eventType}`);
  }

  if (!orderId) {
    console.error("[biteship-webhook] Missing reference_id (order_id)");
    return json({ error: "Missing reference_id" }, 400);
  }

  console.log("[biteship-webhook] Received:", {
    event: eventType,
    order_id: orderId,
    biteship_order_id: biteshipOrderId,
    tracking_number: trackingNumber,
    status: biteshipStatus,
    waybill_url: waybillUrl,
  });

  // 1. Update orders table
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const updatePayload: Record<string, unknown> = {};

  // Hanya update field yang punya value baru
  if (biteshipStatus) {
    updatePayload.biteship_status = biteshipStatus;

    // ⭐ Mapping ke EGLUX internal status (orders.status)
    // Tanpa ini, UI order history/lacak pesanan stuck di "Diproses"
    // padahal Biteship sudah "shipping"/"delivered".
    const egluxStatus = mapBiteshipToEgluxStatus(biteshipStatus);
    if (egluxStatus) {
      updatePayload.status = egluxStatus;
    }
  }
  if (trackingNumber) updatePayload.tracking_number = trackingNumber;
  if (waybillUrl) updatePayload.biteship_waybill_url = waybillUrl;
  if (pickupCode) updatePayload.biteship_pickup_code = pickupCode;

  // Kalau payload kosong (tidak ada field baru), return OK tanpa update
  if (Object.keys(updatePayload).length === 0) {
    console.log("[biteship-webhook] No fields to update, returning OK");
    return json({
      success: true,
      order_id: orderId,
      event: eventType,
      message: "No fields to update",
    });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId);

  if (updateError) {
    console.error("[biteship-webhook] Failed to update order:", updateError);
    // Tetap return 200 OK supaya Biteship tidak retry
    return json({
      success: false,
      order_id: orderId,
      error: "Failed to update order (DB error)",
      db_error: updateError.message,
    }, 200);
  }

  console.log("[biteship-webhook] ✓ Order updated:", orderId, "→", JSON.stringify(updatePayload));

  // 2. TODO: Trigger WABA notification untuk status shipping/delivered
  // Sekarang orders.status sudah sinkron dengan biteship_status lewat mapping di atas.
  // Contoh: kalau mau kirim notif WA saat paket shipping/delivered:
  // if (biteshipStatus === "shipping") {
  //   await supabase.functions.invoke("send-waba-test", {
  //     body: { order_id: orderId, event: "order_shipping" },
  //   });
  // }
  // if (biteshipStatus === "delivered") {
  //   await supabase.functions.invoke("send-waba-test", {
  //     body: { order_id: orderId, event: "order_delivered" },
  //   });
  // }

  return json({
    success: true,
    order_id: orderId,
    biteship_status: biteshipStatus,
    event: eventType,
  });
});
