// supabase/functions/admin-resend-waba/index.ts
// ============================================================================
// Admin: Manual retry single WABA message
// ============================================================================
//
// Triggered by admin (via dashboard atau curl) untuk retry message tertentu
// yang failed. Resets retry_count ke 0 (manual retry = fresh start, ignores
// max attempts limit).
//
// Behavior:
//   1. Fetch message by id dari waba_messages
//   2. Cek mode (test/live) — kalau live, hit Meta API; kalau test, mock
//   3. Update status ke sent (sukses) atau failed (gagal lagi)
//   4. Reset retry_count = 0 untuk fresh start
//
// AUTH:
//   ⚠️ Function ini TIDAK punya auth layer — siapapun dengan anon key bisa invoke.
//   Boss WAJIB tambah auth check (JWT verify + role check) sebelum production.
//   Untuk development, restrict via Supabase Dashboard → Edge Function →
//   set "Verify JWT" = true, dan pastikan hanya admin yang punya JWT valid.
//
// Cara panggil:
//   POST /functions/v1/admin-resend-waba
//   Body: { "message_id": "uuid" }
//   Headers: Authorization: Bearer <admin-jwt-or-anon-key>
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  fetchWabaMessage,
  jsonResponse,
  sendToMeta,
  updateWabaMessageStatus,
  updateRetryTracking,
} from "../_shared/waba-shared.ts";
import { requireAdmin } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WABA_ACCESS_TOKEN = Deno.env.get("WABA_ACCESS_TOKEN");
const WABA_PHONE_NUMBER_ID = Deno.env.get("WABA_PHONE_NUMBER_ID");
const WABA_API_VERSION = Deno.env.get("WABA_API_VERSION") || "v21.0";

const META_GRAPH_URL = `https://graph.facebook.com/${WABA_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── AUTH: Admin-only (team_dev / master / admin) ──
  // Manual retry hit Meta API (kalau mode=live) → biaya. WAJIB admin-only.
  const authResult = await requireAdmin(req);
  if (!authResult.success) {
    return authResult.response!;
  }

  let body: { message_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { message_id } = body;
  if (!message_id) {
    return jsonResponse({ error: "message_id is required (UUID)" }, 400);
  }

  console.log(`[admin-resend] Manual retry for message: ${message_id}`);

  // 1. Fetch message
  const message = await fetchWabaMessage(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message_id);
  if (!message) {
    return jsonResponse({ error: "Message not found" }, 404);
  }

  console.log(`[admin-resend] Message mode: ${message.mode}, current retry_count: ${message.retry_count}`);

  // 2. Handle berdasarkan mode
  if (message.mode === "test") {
    // Test mode — mock response, no real API call
    console.log(`[admin-resend] TEST mode — returning mock response`);

    const mockResponse = {
      messaging_product: "whatsapp",
      contacts: [
        {
          input: message.phone,
          wa_id: message.phone,
        },
      ],
      messages: [
        {
          id: `wamid.test_retry_${Date.now()}_${message.id.slice(0, 8)}`,
          message_status: "test_mocked",
        },
      ],
      _mock: true,
      _note: "Manual retry in test mode. No real WhatsApp message sent.",
      _retry_attempt: message.retry_count + 1,
    };

    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      success: true,
      providerResponse: mockResponse,
      providerMessageId: mockResponse.messages[0].id,
    });

    // Also update orders.waba_last_* fields
    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "test_sent",
      provider_response: mockResponse,
      provider_message_id: mockResponse.messages[0].id,
    });

    console.log(`[admin-resend] ✓ Test retry completed: ${message.id}`);

    return jsonResponse({
      success: true,
      mode: "test",
      message_id: message.id,
      attempt: message.retry_count + 1,
      mocked_response: mockResponse,
      note: "Test mode retry — no real WhatsApp message sent.",
    });
  }

  // LIVE mode — hit Meta API
  if (!WABA_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    return jsonResponse({
      error: "WABA env vars not configured. Set WABA_ACCESS_TOKEN & WABA_PHONE_NUMBER_ID.",
    }, 500);
  }

  console.log(`[admin-resend] LIVE mode — hitting Meta API`);

  const result = await sendToMeta(
    META_GRAPH_URL,
    WABA_ACCESS_TOKEN,
    message.phone,
    message.template_name,
    message.template_params
  );

  if (result.success) {
    // Success — reset retry tracking
    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      success: true,
      providerResponse: result.metaResponse,
      providerMessageId: result.metaMessageId,
    });

    // Also update via original helper (untuk sync sent_at + provider_response)
    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "sent",
      provider_response: result.metaResponse,
      provider_message_id: result.metaMessageId,
    });

    console.log(`[admin-resend] ✓ Retry success: ${message.id}, meta_id=${result.metaMessageId}`);

    return jsonResponse({
      success: true,
      mode: "live",
      message_id: message.id,
      attempt: message.retry_count + 1,
      meta_message_id: result.metaMessageId,
      meta_response: result.metaResponse,
    });
  } else {
    // Failed again — increment retry tracking
    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      success: false,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      providerResponse: result.metaResponse,
    });

    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "failed",
      provider_response: result.metaResponse,
      error_message: result.errorMessage,
      error_code: result.errorCode,
    });

    console.error(`[admin-resend] ✗ Retry failed: ${message.id}, error=${result.errorCode}`);

    return jsonResponse({
      success: false,
      mode: "live",
      message_id: message.id,
      attempt: message.retry_count + 1,
      error: result.errorMessage,
      error_code: result.errorCode,
      meta_response: result.metaResponse,
    }, 502);
  }
});
