// supabase/functions/send-waba-test/index.ts
// ============================================================================
// WABA Test Mode — Mock WhatsApp message (TIDAK hit Meta API)
// ============================================================================
//
// Behavior:
//   1. Fetch order data dari Supabase (service_role)
//   2. Build message dari template
//   3. Save ke waba_messages dengan status='test_sent', mode='test'
//   4. Console.log message body (untuk debugging di Supabase dashboard)
//   5. Return mock response { success, mode, message_id, mocked_response }
//
// TIDAK hit Meta API. Aman untuk development & testing.
//
// Cara panggil:
//   POST /functions/v1/send-waba-test
//   Body: { "order_id": "uuid", "event": "payment_success" }
//   Headers: Authorization: Bearer <admin-jwt-or-service-role>
//
// Switch ke live: ganti URL ke /functions/v1/send-waba-live
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  TEMPLATE_NAMES,
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

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── AUTH: Admin-only ──
  // Note: midtrans-webhook invoke function ini pakai service_role key.
  // _shared/auth.ts sudah bypass service_role (return success tanpa JWT check).
  // Frontend manual trigger (dari admin dashboard) pakai user JWT.
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return authResult.response!;
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

  console.log(`[waba-test] Received request: order_id=${order_id}, event=${finalEvent}`);

  // 1. Fetch order data
  const order = await fetchOrderData(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, order_id);
  if (!order) {
    return jsonResponse({ error: "Order not found" }, 404);
  }

  // 2. Validate phone
  if (!order.customer_phone) {
    return jsonResponse({
      error: "Customer phone is empty or invalid format",
      customer_phone_raw: order.customer_phone,
    }, 400);
  }

  // 3. Build message
  const message = buildPaymentSuccessMessage(order);

  console.log(`[waba-test] ===== MOCK WHATSAPP MESSAGE =====`);
  console.log(`[waba-test] To: +${order.customer_phone}`);
  console.log(`[waba-test] Template: ${message.template_name}`);
  console.log(`[waba-test] Params:`, message.template_params);
  console.log(`[waba-test] ----- Message Body -----`);
  console.log(message.body);
  console.log(`[waba-test] ===============================`);

  // 4. Save ke DB dengan status test_sent
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
      mode: "test",
      status: "test_sent",
    }
  );

  if (!messageId) {
    return jsonResponse({
      error: "Failed to save WABA message to audit table",
    }, 500);
  }

  // 5. Update status dengan mock provider response
  const mockResponse = {
    messaging_product: "whatsapp",
    contacts: [
      {
        input: order.customer_phone,
        wa_id: order.customer_phone,
      },
    ],
    messages: [
      {
        id: `wamid.test_${Date.now()}_${messageId.slice(0, 8)}`,
        message_status: "test_mocked",
      },
    ],
    _mock: true,
    _note: "This is a mocked response. No real WhatsApp message was sent.",
  };

  await updateWabaMessageStatus(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    messageId,
    {
      status: "test_sent",
      provider_response: mockResponse,
      provider_message_id: mockResponse.messages[0].id,
    }
  );

  console.log(`[waba-test] ✓ Mock message saved: id=${messageId}`);
  console.log(`[waba-test] ✓ Mock Meta response:`, mockResponse);

  // 6. Return success
  return jsonResponse({
    success: true,
    mode: "test",
    message_id: messageId,
    status: "test_sent",
    recipient: `+${order.customer_phone}`,
    template: message.template_name,
    template_params: message.template_params,
    message_body: message.body,
    mocked_response: mockResponse,
    note: "Test mode — no real WhatsApp message sent. Switch to /functions/v1/send-waba-live untuk kirim real.",
  });
});
