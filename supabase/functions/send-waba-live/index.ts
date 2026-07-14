// supabase/functions/send-waba-live/index.ts
// ============================================================================
// WABA Live Mode — Real WhatsApp Business Cloud API call
// ============================================================================
//
// Behavior:
//   1. Fetch order data dari Supabase (service_role)
//   2. Build message dari template
//   3. Save ke waba_messages dengan status='pending', mode='live'
//   4. Hit Meta Cloud API: POST /v21.0/{PHONE_NUMBER_ID}/messages
//      with template payload
//   5. Update status ke 'sent' (sukses) atau 'failed' (error)
//   6. Return Meta API response
//
// PREREQUISITES (sebelum deploy function ini):
//   1. Meta Business Manager: daftar WhatsApp Business Account
//   2. Create WhatsApp App → dapatkan PHONE_NUMBER_ID
//   3. Generate System User Token (permanent) dengan whatsapp_business_messaging permission
//   4. Submit template 'eglux_payment_success' untuk approval (1-2 hari kerja)
//   5. Add phone number ke WhatsApp Business → test number untuk dev
//   6. Set env vars di Supabase Edge Function:
//        WABA_ACCESS_TOKEN  = EAAB... (system user token)
//        WABA_PHONE_NUMBER_ID = 1234567890
//        WABA_API_VERSION = v21.0 (default kalau tidak diset)
//
// Cara panggil:
//   POST /functions/v1/send-waba-live
//   Body: { "order_id": "uuid", "event": "payment_success" }
//   Headers: Authorization: Bearer <anon_key>
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  buildPaymentSuccessMessage,
  fetchOrderData,
  jsonResponse,
  saveWabaMessage,
  updateWabaMessageStatus,
  validateRequest,
  type SupportedEvent,
} from "../_shared/waba-shared.ts";
import { requireAdmin } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// WABA env vars
const WABA_ACCESS_TOKEN = Deno.env.get("WABA_ACCESS_TOKEN");
const WABA_PHONE_NUMBER_ID = Deno.env.get("WABA_PHONE_NUMBER_ID");
const WABA_API_VERSION = Deno.env.get("WABA_API_VERSION") || "v21.0";

const META_GRAPH_URL = `https://graph.facebook.com/${WABA_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

// Meta template language — sesuaikan kalau submit template pakai bahasa lain
const TEMPLATE_LANGUAGE = "id"; // ISO 639-1, lowercase

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── AUTH: Admin-only (team_dev / master / admin) ──
  // Live mode hit real Meta API → biaya per pesan. WAJIB admin-only.
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return authResult.response!;
  }

  // Preflight check: pastikan env vars sudah diset
  if (!WABA_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    console.error("[waba-live] Missing env vars:", {
      has_token: !!WABA_ACCESS_TOKEN,
      has_phone_id: !!WABA_PHONE_NUMBER_ID,
    });
    return jsonResponse({
      error: "WABA env vars not configured. Set WABA_ACCESS_TOKEN & WABA_PHONE_NUMBER_ID in Supabase Edge Function settings.",
    }, 500);
  }

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // Validate
  const validation = validateRequest(requestBody);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const { order_id, event } = validation;
  const finalEvent: SupportedEvent = event!;

  console.log(`[waba-live] Received request: order_id=${order_id}, event=${finalEvent}`);

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

  // 3. Build message
  const message = buildPaymentSuccessMessage(order);

  // 4. Save ke DB dengan status pending (sebelum hit API)
  const messageId = await saveWabaMessage(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      order_id: order.order_id,
      phone: order.customer_phone,
      event: finalEvent,
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

  // 5. Build Meta Cloud API payload (template message)
  // Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/message-templates
  const metaPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: order.customer_phone,
    type: "template",
    template: {
      name: message.template_name,
      language: {
        code: TEMPLATE_LANGUAGE,
      },
      components: [
        {
          type: "body",
          parameters: Object.entries(message.template_params).map(
            ([key, value]) => ({
              type: "text",
              text: value,
            })
          ),
        },
      ],
    },
  };

  console.log(`[waba-live] Sending to Meta API:`, {
    url: META_GRAPH_URL,
    to: order.customer_phone,
    template: message.template_name,
    params_count: Object.keys(message.template_params).length,
  });

  // 6. Hit Meta Cloud API
  let metaResponse: any;
  let metaOk = false;

  try {
    const response = await fetch(META_GRAPH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WABA_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metaPayload),
    });

    metaResponse = await response.json();
    metaOk = response.ok;

    console.log(`[waba-live] Meta API response status: ${response.status}`);
    console.log(`[waba-live] Meta API response body:`, metaResponse);
  } catch (err) {
    // Network error
    console.error(`[waba-live] Network error hitting Meta API:`, err);

    await updateWabaMessageStatus(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      messageId,
      {
        status: "failed",
        provider_response: { error: err.message },
        error_message: `Network error: ${err.message}`,
        error_code: "NETWORK_ERROR",
      }
    );

    return jsonResponse({
      success: false,
      mode: "live",
      message_id: messageId,
      error: `Network error: ${err.message}`,
    }, 502);
  }

  // 7. Handle Meta API response
  if (!metaOk || !metaResponse?.messages?.[0]?.id) {
    // Meta returned error
    const errorMessage =
      metaResponse?.error?.message ||
      metaResponse?.error?.error_user_msg ||
      "Unknown Meta API error";
    const errorCode = metaResponse?.error?.code?.toString() || "META_ERROR";

    console.error(`[waba-live] Meta API error:`, metaResponse);

    await updateWabaMessageStatus(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      messageId,
      {
        status: "failed",
        provider_response: metaResponse,
        error_message: errorMessage,
        error_code: errorCode,
      }
    );

    return jsonResponse({
      success: false,
      mode: "live",
      message_id: messageId,
      error: errorMessage,
      meta_error: metaResponse?.error || null,
    }, 502);
  }

  // 8. Success — update status
  const metaMessageId = metaResponse.messages[0].id;

  await updateWabaMessageStatus(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    messageId,
    {
      status: "sent",
      provider_response: metaResponse,
      provider_message_id: metaMessageId,
    }
  );

  console.log(`[waba-live] ✓ Message sent: meta_id=${metaMessageId}`);

  return jsonResponse({
    success: true,
    mode: "live",
    message_id: messageId,
    meta_message_id: metaMessageId,
    recipient: `+${order.customer_phone}`,
    template: message.template_name,
    meta_response: metaResponse,
  });
});
