// supabase/functions/cron-retry-failed-waba/index.ts
// ============================================================================
// Cron Job: Auto-retry failed WABA messages (with exponential backoff)
// ============================================================================
//
// Triggered by Supabase Scheduled Function (cron) setiap 5 menit.
// Fetch all waba_messages yang eligible untuk retry (failed + retryable
// error code + retry_count < MAX + next_retry_at due), lalu hit Meta API
// untuk masing-masing.
//
// Exponential backoff schedule (defined di _shared/waba-shared.ts):
//   Attempt 1 failed → wait 5 min  → retry (attempt 2)
//   Attempt 2 failed → wait 30 min → retry (attempt 3)
//   Attempt 3 failed → give up (max attempts reached)
//
// SETUP cron di Supabase Dashboard:
//   1. Database → Cron → Create new schedule
//   2. Schedule: "*/5 * * * *"  (every 5 min)
//   3. HTTP method: POST
//   4. URL: https://<project-ref>.supabase.co/functions/v1/cron-retry-failed-waba
//   5. Headers:
//        Authorization: Bearer <anon-key>
//        Content-Type: application/json
//   6. Body: { } (empty)
//
// Atau via SQL (Supabase pg_cron extension):
//   SELECT cron.schedule(
//     'waba-retry-failed',
//     '*/5 * * * *',
//     $$SELECT net.http_post(
//       url := 'https://<project-ref>.supabase.co/functions/v1/cron-retry-failed-waba',
//       headers := jsonb_build_object(
//         'Authorization', 'Bearer ' || current_setting('app.anon_key'),
//         'Content-Type', 'application/json'
//       ),
//       body := '{}'::jsonb
//     )$$
//   );
//
// SECURITY:
//   Cron job dipanggil oleh Supabase scheduled function (internal).
//   Untuk restrict akses: pakai CRON_SECRET env var. Set di Supabase Dashboard
//   → Edge Function settings, lalu add header `x-cron-secret: <secret>` di
//   cron schedule. Kalau secret gak di-set (dev mode), endpoint bisa di-invoke
//   siapapun dengan anon key — tapi dampak terbatas (auto-retry WABA messages
//   yang eligible, tidak bisa trigger custom message).
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  MAX_RETRY_ATTEMPTS,
  fetchMessagesForRetry,
  isRetryable,
  jsonResponse,
  sendToMeta,
  updateRetryTracking,
  updateWabaMessageStatus,
} from "../_shared/waba-shared.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const WABA_ACCESS_TOKEN = Deno.env.get("WABA_ACCESS_TOKEN");
const WABA_PHONE_NUMBER_ID = Deno.env.get("WABA_PHONE_NUMBER_ID");
const WABA_API_VERSION = Deno.env.get("WABA_API_VERSION") || "v21.0";

const META_GRAPH_URL = `https://graph.facebook.com/${WABA_API_VERSION}/${WABA_PHONE_NUMBER_ID}/messages`;

// Max messages to process per cron run (avoid overload kalau banyak failed)
const BATCH_LIMIT = 20;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── AUTH: Cron secret check (kalau CRON_SECRET di-set) ──
  // Cron tidak punya JWT user, jadi pakai shared secret. Kalau secret tidak
  // di-set (dev mode), skip check (dampak terbatas: auto-retry eligible messages).
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== cronSecret) {
      return jsonResponse({ error: "Unauthorized: invalid cron secret" }, 401);
    }
  }

  console.log(`[cron-retry] Started at ${new Date().toISOString()}`);

  // 1. Check apakah live mode configured
  if (!WABA_ACCESS_TOKEN || !WABA_PHONE_NUMBER_ID) {
    console.log(`[cron-retry] WABA live not configured — skipping (test mode only, no auto-retry needed)`);
    return jsonResponse({
      success: true,
      skipped: true,
      reason: "WABA_ACCESS_TOKEN or WABA_PHONE_NUMBER_ID not set — test mode, no retry needed",
      processed: 0,
    });
  }

  // 2. Fetch messages yang eligible untuk retry
  const messages = await fetchMessagesForRetry(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    BATCH_LIMIT
  );

  console.log(`[cron-retry] Found ${messages.length} messages eligible for retry (limit: ${BATCH_LIMIT})`);

  if (messages.length === 0) {
    return jsonResponse({
      success: true,
      processed: 0,
      message: "No messages eligible for retry",
    });
  }

  // 3. Process each message sequentially (jangan parallel — bisa trigger Meta rate limit)
  const results = [];

  for (const message of messages) {
    console.log(
      `[cron-retry] Processing: id=${message.id}, phone=${message.phone}, retry_count=${message.retry_count}, error=${message.error_code}`
    );

    // Double-check eligibility (defensive)
    if (message.retry_count >= MAX_RETRY_ATTEMPTS) {
      console.log(`[cron-retry] Skip — max attempts reached: ${message.id}`);
      continue;
    }

    if (!isRetryable(message.error_code)) {
      console.log(`[cron-retry] Skip — non-retryable error: ${message.id} (${message.error_code})`);
      continue;
    }

    // Hit Meta API
    const result = await sendToMeta(
      META_GRAPH_URL,
      WABA_ACCESS_TOKEN,
      message.phone,
      message.template_name,
      message.template_params
    );

    if (result.success) {
      await updateRetryTracking(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
        success: true,
        providerResponse: result.metaResponse,
        providerMessageId: result.metaMessageId,
      });
      await updateWabaMessageStatus(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, message.id, {
        status: "sent",
        provider_response: result.metaResponse,
        provider_message_id: result.metaMessageId,
      });

      console.log(`[cron-retry] ✓ Success: ${message.id}, meta_id=${result.metaMessageId}`);
      results.push({
        message_id: message.id,
        status: "sent",
        retry_count: message.retry_count + 1,
        meta_message_id: result.metaMessageId,
      });
    } else {
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

      console.log(
        `[cron-retry] ✗ Failed again: ${message.id}, error=${result.errorCode}, attempt=${message.retry_count + 1}/${MAX_RETRY_ATTEMPTS}`
      );
      results.push({
        message_id: message.id,
        status: "failed",
        retry_count: message.retry_count + 1,
        error_code: result.errorCode,
        error_message: result.errorMessage,
        will_retry: message.retry_count + 1 < MAX_RETRY_ATTEMPTS,
      });
    }

    // Sleep 500ms antara request (avoid Meta rate limit)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // 4. Summary
  const successCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  console.log(
    `[cron-retry] Completed: ${successCount} success, ${failedCount} failed (out of ${results.length} processed)`
  );

  return jsonResponse({
    success: true,
    processed: results.length,
    success_count: successCount,
    failed_count: failedCount,
    results,
  });
});
