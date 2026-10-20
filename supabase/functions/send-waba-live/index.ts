// supabase/functions/send-waba-live/index.ts
// ============================================================================
// WABA Live Mode v4.2 — Qiscus Omnichannel API + 3 Events + waybill_url
// ============================================================================
//
// ⭐ v4.2 CHANGES (dari v4.1):
//   - For shipping_update event: extract `waybill_url` dari request body
//     (dari midtrans-webhook atau biteship-webhook), pass ke
//     buildShippingUpdateMessage() supaya jadi {{6}} di template shipping_updatesv2
//   - validateRequest sekarang return `waybill_url` field juga
//
// v4.1 (previous): 3 events support (payment_success, shipping_update, retur_status)
//
// Cara panggil:
//   POST /functions/v1/send-waba-live
//
//   Body untuk payment_success:
//     { "order_id": "uuid", "event": "payment_success" }
//
//   Body untuk shipping_update (v4.2 — waybill_url optional, kalau gak ada fallback ke DB):
//     {
//       "order_id": "uuid",
//       "event": "shipping_update",
//       "tracking_number": "JTR1234567890",   ← optional
//       "waybill_url": "https://track.biteship.com/DIPA3xxdVDuJAqIVapD9ldR2"  ← v4.2 NEW
//     }
//
//   Body untuk retur_status:
//     {
//       "order_id": "uuid",
//       "event": "retur_status",
//       "retur_reference": "RET-0001",
//       "status_text": "Disetujui",
//       "additional_info": "Refund akan diproses 3-5 hari kerja"
//     }
//
//   Headers: Authorization: Bearer <admin-jwt-or-service-role>
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  buildPaymentSuccessMessage,
  buildShippingUpdateMessage,
  buildReturStatusMessage,
  fetchOrderData,
  jsonResponse,
  saveWabaMessage,
  sendToQiscus,
  updateWabaMessageStatus,
  validateRequest,
} from "../_shared/waba-shared.ts";
import { requireAdmin } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Qiscus credentials (Skenario B) ──
const QISCUS_APP_ID = Deno.env.get("QISCUS_APP_ID");
const QISCUS_SECRET_KEY = Deno.env.get("QISCUS_SECRET_KEY");
const QISCUS_CHANNEL_ID = Deno.env.get("QISCUS_CHANNEL_ID");
const QISCUS_TEMPLATE_NAMESPACE = Deno.env.get("QISCUS_TEMPLATE_NAMESPACE");
const QISCUS_REGION = Deno.env.get("QISCUS_REGION") || "id";

function getQiscusBaseUrl(): string {
  if (QISCUS_REGION.toLowerCase() === "my") {
    return "https://omnichannel-my.qiscus.com";
  }
  return "https://omnichannel.qiscus.com";
}

const TEMPLATE_LANGUAGE = "id";

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── AUTH: Admin-only (team_dev / master / admin) ──
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return authResult.response!;
  }

  // ── Preflight check: pastikan Qiscus env vars sudah diset ──
  const missingVars: string[] = [];
  if (!QISCUS_APP_ID) missingVars.push("QISCUS_APP_ID");
  if (!QISCUS_SECRET_KEY) missingVars.push("QISCUS_SECRET_KEY");
  if (!QISCUS_CHANNEL_ID) missingVars.push("QISCUS_CHANNEL_ID");
  if (!QISCUS_TEMPLATE_NAMESPACE) missingVars.push("QISCUS_TEMPLATE_NAMESPACE");

  if (missingVars.length > 0) {
    console.error("[waba-live] Missing Qiscus env vars:", missingVars);
    return jsonResponse({
      error: `Qiscus env vars not configured. Set in Supabase Edge Function Secrets: ${missingVars.join(", ")}`,
      hint: "Dapatkan credentials di Qiscus Omnichannel Dashboard → App Settings & WhatsApp Channel.",
    }, 500);
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Validate — returns event-specific fields (including waybill_url sekarang)
  const validation = validateRequest(requestBody);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const {
    order_id,
    event,
    tracking_number,
    waybill_url,  // ⭐ v4.2 NEW
    retur_reference,
    status_text,
    additional_info,
  } = validation;

  console.log(`[waba-live] Received: order_id=${order_id}, event=${event}`, {
    has_tracking_override: !!tracking_number,
    has_waybill_url_override: !!waybill_url,  // ⭐ v4.2
    has_retur_ref: !!retur_reference,
    has_status: !!status_text,
  });

  // 1. Fetch order data
  const order = await fetchOrderData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, order_id);
  if (!order) {
    return jsonResponse({ error: "Order not found" }, 404);
  }

  // 2. Validate phone
  if (!order.customer_phone) {
    return jsonResponse({
      error: "Customer phone is empty or invalid format (must be E.164: 628xxx)",
    }, 400);
  }

  // 3. Build message based on event
  let message: {
    template_name: string;
    template_params: Record<string, string>;
    body: string;
  };

  if (event === "payment_success") {
    message = buildPaymentSuccessMessage(order);
  } else if (event === "shipping_update") {
    // ⭐ v4.2: shipping_update — butuh tracking_number + waybill_url
    if (!tracking_number && !order.tracking_number) {
      return jsonResponse({
        error: "tracking_number is required for shipping_update event. Either pass in body or ensure orders.tracking_number is set in DB.",
      }, 400);
    }
    // ⭐ v4.2: pass waybill_url ke builder (kalau gak ada, builder fallback ke DB)
    message = buildShippingUpdateMessage(order, tracking_number, waybill_url);
  } else if (event === "retur_status") {
    message = buildReturStatusMessage(
      order,
      retur_reference!,
      status_text!,
      additional_info,
    );
  } else {
    return jsonResponse({ error: `Unsupported event: ${event}` }, 400);
  }

  // 4. Save ke DB dengan status pending (sebelum hit API)
  const messageId = await saveWabaMessage(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      order_id: order.order_id,
      phone: order.customer_phone,
      event: event!,
      template_name: message.template_name,
      template_params: message.template_params,
      message_body: message.body,
      mode: "live",
      status: "pending",
    }
  );

  if (!messageId) {
    return jsonResponse({
      error: "Failed to save WABA message to audit table",
    }, 500);
  }

  // 5. Build Qiscus API endpoint URL
  const qiscusBaseUrl = getQiscusBaseUrl();
  const qiscusApiUrl = `${qiscusBaseUrl}/whatsapp/v1/${QISCUS_APP_ID}/${QISCUS_CHANNEL_ID}/messages`;

  console.log(`[waba-live] Sending to Qiscus API:`, {
    url: qiscusApiUrl,
    to: order.customer_phone,
    template: message.template_name,
    namespace: QISCUS_TEMPLATE_NAMESPACE,
    params_count: Object.keys(message.template_params).length,
    params_preview: message.template_params,
  });

  // 6. Hit Qiscus Omnichannel API
  const qiscusResult = await sendToQiscus(
    qiscusApiUrl,
    QISCUS_APP_ID!,
    QISCUS_SECRET_KEY!,
    order.customer_phone,
    message.template_name,
    QISCUS_TEMPLATE_NAMESPACE!,
    message.template_params,
    TEMPLATE_LANGUAGE,
  );

  console.log(`[waba-live] Qiscus API response:`, qiscusResult);

  // 7. Handle Qiscus API response
  if (!qiscusResult.success) {
    console.error(`[waba-live] Qiscus API error:`, qiscusResult);

    await updateWabaMessageStatus(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      messageId,
      {
        status: "failed",
        provider_response: qiscusResult.response,
        error_message: qiscusResult.error_message || "Unknown Qiscus API error",
        error_code: qiscusResult.error_code || "QISCUS_ERROR",
      }
    );

    return jsonResponse({
      success: false,
      mode: "live",
      message_id: messageId,
      event: event,
      error: qiscusResult.error_message,
      error_code: qiscusResult.error_code,
      qiscus_response: qiscusResult.response,
    }, 502);
  }

  // 8. Success — update status
  const qiscusMessageId = qiscusResult.message_id || `qiscus-${Date.now()}`;

  await updateWabaMessageStatus(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    messageId,
    {
      status: "sent",
      provider_response: qiscusResult.response,
      provider_message_id: qiscusMessageId,
    }
  );

  console.log(`[waba-live] ✓ Message sent: event=${event}, qiscus_id=${qiscusMessageId}`);

  return jsonResponse({
    success: true,
    mode: "live",
    message_id: messageId,
    event: event,
    qiscus_message_id: qiscusMessageId,
    recipient: `+${order.customer_phone}`,
    template: message.template_name,
    template_params: message.template_params,
    qiscus_response: qiscusResult.response,
  });
});