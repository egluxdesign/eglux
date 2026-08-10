// supabase/functions/cron-retry-failed-emails/index.ts
// ============================================================================
// cron-retry-failed-emails — Retry email yang failed dengan exponential backoff
// ============================================================================
//
// Trigger: Supabase Cron (every 5 minutes)
//   Schedule: */5 * * * *
//
// Logic:
//   1. Query email_messages WHERE status='failed' AND next_retry_at <= NOW()
//      AND retry_count < 5
//   2. Untuk setiap row:
//      a. Increment retry_count
//      b. Call Resend API dengan html_body yang sudah ada
//      c. Kalau success: status='sent' + sent_at + resend_id
//      d. Kalau fail: update next_retry_at (exponential backoff)
//   3. Kalau retry_count >= 5 → mark as permanently failed (gak di-retry lagi)
//
// Max retries: 5 (backoff: 1m, 5m, 15m, 60m, 240m)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "EGLUX <noreply@eglux.id>";
const RESEND_API_URL = "https://api.resend.com/emails";
const MAX_RETRIES = 5;

function getNextRetryAt(retryCount: number): string {
  // Backoff: 1m, 5m, 15m, 60m, 240m
  const backoffs = [1, 5, 15, 60, 240];
  const minutes = backoffs[Math.min(retryCount, backoffs.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<{ success: boolean; resendId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: "RESEND_API_KEY env var not set" };
  }
  try {
    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { success: false, error: JSON.stringify(data) };
    }
    return { success: true, resendId: data.id };
  } catch (e) {
    return { success: false, error: e?.message || "Network error" };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Step 1: Fetch failed emails yang siap di-retry ──
    const { data: failedEmails, error: fetchErr } = await supabase
      .from("email_messages")
      .select("id, order_id, event, to_email, subject, html_body, retry_count")
      .eq("status", "failed")
      .lt("retry_count", MAX_RETRIES)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
      .order("created_at", { ascending: true })
      .limit(50);  // Max 50 per run

    if (fetchErr) {
      console.error("[cron-retry-emails] Fetch failed:", fetchErr.message);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!failedEmails || failedEmails.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        retried: 0,
        message: "No failed emails to retry",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[cron-retry-emails] Retrying ${failedEmails.length} failed emails`);

    // ── Step 2: Retry each email ──
    let successCount = 0;
    let failCount = 0;

    for (const email of failedEmails) {
      const newRetryCount = (email.retry_count || 0) + 1;

      const result = await sendViaResend(email.to_email, email.subject, email.html_body);

      if (result.success) {
        // Success — update status
        await supabase
          .from("email_messages")
          .update({
            status: "sent",
            resend_id: result.resendId,
            sent_at: new Date().toISOString(),
            retry_count: newRetryCount,
            error_message: null,
            next_retry_at: null,
          })
          .eq("id", email.id);
        successCount++;
        console.log(`[cron-retry-emails] ✓ Retry success: ${email.id} (attempt ${newRetryCount})`);
      } else {
        // Still failed — increment retry count + set next retry (or mark permanently failed)
        const isLastRetry = newRetryCount >= MAX_RETRIES;
        await supabase
          .from("email_messages")
          .update({
            retry_count: newRetryCount,
            error_message: result.error,
            next_retry_at: isLastRetry ? null : getNextRetryAt(newRetryCount),
          })
          .eq("id", email.id);
        failCount++;
        console.warn(`[cron-retry-emails] ✗ Retry failed: ${email.id} (attempt ${newRetryCount}/${MAX_RETRIES})${isLastRetry ? ' — PERMANENTLY FAILED' : ''}`);
      }

      // Small delay antar request supaya gak rate-limit Resend
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(`[cron-retry-emails] Done: ${successCount} success, ${failCount} still failed`);

    return new Response(JSON.stringify({
      success: true,
      retried: failedEmails.length,
      success_count: successCount,
      fail_count: failCount,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cron-retry-emails] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
