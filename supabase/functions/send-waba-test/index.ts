// supabase/functions/send-waba-test/index.ts
// ============================================================================
// WABA Test Mode v2.0 — Mock WhatsApp message (TIDAK hit Qiscus API)
// ============================================================================
//
// ⭐ v2.0 CHANGES (dari v1.x):
//   - Support 3 events (sebelumnya cuma payment_success):
//     • payment_success → call buildPaymentSuccessMessage()
//     • shipping_update → call buildShippingUpdateMessage() + tracking_number
//     • retur_status → call buildReturStatusMessage() + retur_reference + status_text
//   - Mock response format updated ke Qiscus-style (bukan Meta lagi)
//   - Konsisten dengan send-waba-live v4.1 (struktur request body sama)
//
// Behavior:
//   1. Fetch order data dari Supabase (service_role)
//   2. Build message dari template sesuai event
//   3. Save ke waba_messages dengan status='test_sent', mode='test'
//   4. Console.log message body (untuk debugging di Supabase dashboard)
//   5. Return mock response { success, mode, message_id, mocked_response }
//
// TIDAK hit Qiscus API. Aman untuk development & testing.
//
// Cara panggil:
//   POST /functions/v1/send-waba-test
//   Body untuk payment_success:
//     { "order_id": "uuid", "event": "payment_success" }
//   Body untuk shipping_update:
//     { "order_id": "uuid", "event": "shipping_update", "tracking_number": "JTR1234567890" }
//     (tracking_number optional — kalau kosong, ambil dari DB orders.tracking_number)
//   Body untuk retur_status:
//     {
//       "order_id": "uuid",
//       "event": "retur_status",
//       "retur_reference": "RET-0001",
//       "status_text": "Disetujui",
//       "additional_info": "Refund akan diproses 3-5 hari kerja"
//     }
//   Headers: Authorization: Bearer <admin-jwt-or-service-role>
//
// Switch ke live: ganti URL ke /functions/v1/send-waba-live
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
  updateWabaMessageStatus,
  validateRequest,
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

  // Validate — returns event-specific fields (same signature as send-waba-live v4.1)
  const validation = validateRequest(requestBody);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400);
  }

  const {
    order_id,
    event,
    tracking_number,
    retur_reference,
    status_text,
    additional_info,
  } = validation;

  console.log(`[waba-test] Received: order_id=${order_id}, event=${event}`, {
    has_tracking_override: !!tracking_number,
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
      error: "Customer phone is empty or invalid format",
      customer_phone_raw: order.customer_phone,
    }, 400);
  }

  // 3. Build message based on event (mirror send-waba-live v4.1 logic)
  let message: {
    template_name: string;
    template_params: Record<string, string>;
    body: string;
  };

  if (event === "payment_success") {
    message = buildPaymentSuccessMessage(order);
  } else if (event === "shipping_update") {
    if (!tracking_number && !order.tracking_number) {
      return jsonResponse({
        error: "tracking_number is required for shipping_update event. Either pass in body or ensure orders.tracking_number is set in DB.",
      }, 400);
    }
    message = buildShippingUpdateMessage(order, tracking_number);
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
      event: event!,
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

  // 5. Update status dengan mock Qiscus response (v2.0: Qiscus-style format)
  const mockResponse = {
    status: 200,
    data: {
      message_id: `qiscus.test_${Date.now()}_${messageId.slice(0, 8)}`,
      message_status: "test_mocked",
    },
    _mock: true,
    _note: "This is a mocked response. No real WhatsApp message was sent. Switch to /functions/v1/send-waba-live untuk kirim real WA via Qiscus API.",
    _event: event,
    _template_used: message.template_name,
    _template_params: message.template_params,
  };

  await updateWabaMessageStatus(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    messageId,
    {
      status: "test_sent",
      provider_response: mockResponse,
      provider_message_id: mockResponse.data.message_id,
    }
  );

  console.log(`[waba-test] ✓ Mock message saved: id=${messageId}`);
  console.log(`[waba-test] ✓ Mock Qiscus response:`, mockResponse);

  // 6. Return success
  return jsonResponse({
    success: true,
    mode: "test",
    message_id: messageId,
    event: event,
    status: "test_sent",
    recipient: `+${order.customer_phone}`,
    template: message.template_name,
    template_params: message.template_params,
    message_body: message.body,
    mocked_response: mockResponse,
    note: "Test mode — no real WhatsApp message sent. Switch to /functions/v1/send-waba-live untuk kirim real via Qiscus API.",
  });
});
