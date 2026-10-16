// supabase/functions/admin-resend-waba/index.ts
// ============================================================================
// Admin: Manual retry single WABA message — v2.0 (Skenario B / Qiscus API)
// ============================================================================
//
// Triggered by admin (via dashboard atau curl) untuk retry message tertentu
// yang failed. Resets retry_count ke 0 (manual retry = fresh start, ignores
// max attempts limit).
//
// Behavior:
//   1. Fetch message by id dari waba_messages
//   2. Cek mode (test/live) — kalau live, hit Qiscus API; kalau test, mock
//   3. Update status ke sent (sukses) atau failed (gagal lagi)
//   4. Reset retry_count = 0 untuk fresh start
//
// ⚠️ CHANGES v2.0 (Skenario B + bug fix):
//   - Endpoint: graph.facebook.com → omnichannel.qiscus.com
//   - Auth: Bearer token → Qiscus-App-Id + Qiscus-Secret-Key headers
//   - Secrets: WABA_ACCESS_TOKEN + WABA_PHONE_NUMBER_ID →
//              QISCUS_APP_ID + QISCUS_SECRET_KEY + QISCUS_CHANNEL_ID
//              + QISCUS_TEMPLATE_NAMESPACE
//   - Bug fix: field names di call updateRetryTracking sebelumnya salah
//     (pakai `success`, `providerResponse`, `providerMessageId`)
//     Padahal function expect: `status`, `provider_response`, `provider_message_id`
//     v2.0 pakai field names yang benar.
//   - Bug fix: baca response pakai field names yang benar dari sendToQiscus
//     (response + message_id, bukan metaResponse + metaMessageId)
//
// AUTH:
//   requireAdmin(req) — team_dev / master / admin only.
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
  sendToQiscus,
  updateWabaMessageStatus,
  updateRetryTracking,
} from "../_shared/waba-shared.ts";
import { requireAdmin } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Qiscus credentials (Skenario B) ──
const QISCUS_APP_ID = Deno.env.get("QISCUS_APP_ID");
const QISCUS_SECRET_KEY = Deno.env.get("QISCUS_SECRET_KEY");
const QISCUS_CHANNEL_ID = Deno.env.get("QISCUS_CHANNEL_ID");
const QISCUS_TEMPLATE_NAMESPACE = Deno.env.get("QISCUS_TEMPLATE_NAMESPACE");
const QISCUS_REGION = Deno.env.get("QISCUS_REGION") || "id"; // "id" | "my"

function getQiscusBaseUrl(): string {
  if (QISCUS_REGION.toLowerCase() === "my") {
    return "https://omnichannel-my.qiscus.com";
  }
  return "https://omnichannel.qiscus.com";
}

serve(async (req: Request) => {
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
      to: message.phone,
      type: "template",
      _mock: true,
      _note: "Manual retry in test mode. No real WhatsApp message sent.",
      _retry_attempt: message.retry_count + 1,
      data: {
        message_id: `qiscus.test_retry_${Date.now()}_${message.id.slice(0, 8)}`,
      },
    };

    // ⭐ v2.0 FIX: pakai field names yang benar (status, provider_response, provider_message_id)
    // Sebelumnya pakai: success, providerResponse, providerMessageId (SALAH)
    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "sent",
      provider_response: mockResponse,
      provider_message_id: mockResponse.data.message_id,
    });

    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "test_sent",
      provider_response: mockResponse,
      provider_message_id: mockResponse.data.message_id,
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

  // LIVE mode — hit Qiscus API
  const missingVars: string[] = [];
  if (!QISCUS_APP_ID) missingVars.push("QISCUS_APP_ID");
  if (!QISCUS_SECRET_KEY) missingVars.push("QISCUS_SECRET_KEY");
  if (!QISCUS_CHANNEL_ID) missingVars.push("QISCUS_CHANNEL_ID");
  if (!QISCUS_TEMPLATE_NAMESPACE) missingVars.push("QISCUS_TEMPLATE_NAMESPACE");

  if (missingVars.length > 0) {
    return jsonResponse({
      error: `Qiscus env vars not configured: ${missingVars.join(", ")}`,
    }, 500);
  }

  const qiscusApiUrl = `${getQiscusBaseUrl()}/whatsapp/v1/${QISCUS_APP_ID}/${QISCUS_CHANNEL_ID}/messages`;

  console.log(`[admin-resend] LIVE mode — hitting Qiscus API: ${qiscusApiUrl}`);

  const result = await sendToQiscus(
    qiscusApiUrl,
    QISCUS_APP_ID!,
    QISCUS_SECRET_KEY!,
    message.phone,
    message.template_name,
    QISCUS_TEMPLATE_NAMESPACE!,
    message.template_params
  );

  if (result.success) {
    // Success — reset retry tracking
    // ⭐ v2.0 FIX: field names yang benar
    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "sent",
      provider_response: result.response,
      provider_message_id: result.message_id,
    });

    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "sent",
      provider_response: result.response,
      provider_message_id: result.message_id,
    });

    console.log(`[admin-resend] ✓ Retry success: ${message.id}, qiscus_id=${result.message_id}`);

    return jsonResponse({
      success: true,
      mode: "live",
      message_id: message.id,
      attempt: message.retry_count + 1,
      qiscus_message_id: result.message_id,
      qiscus_response: result.response,
    });
  } else {
    // Failed again — increment retry tracking
    // ⭐ v2.0 FIX: field names yang benar
    await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "failed",
      error_code: result.error_code,
      error_message: result.error_message,
      provider_response: result.response,
    });

    await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
      status: "failed",
      provider_response: result.response,
      error_message: result.error_message,
      error_code: result.error_code,
    });

    console.error(`[admin-resend] ✗ Retry failed: ${message.id}, error=${result.error_code}`);

    return jsonResponse({
      success: false,
      mode: "live",
      message_id: message.id,
      attempt: message.retry_count + 1,
      error: result.error_message,
      error_code: result.error_code,
      qiscus_response: result.response,
    }, 502);
  }
});