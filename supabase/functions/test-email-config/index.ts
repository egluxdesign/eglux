// supabase/functions/test-email-config/index.ts
// ============================================================================
// test-email-config — Diagnostic endpoint untuk debug email notification
// ============================================================================
//
// Pakai:
//   POST /functions/v1/test-email-config
//   Headers: Authorization: Bearer <service_role_key>
//   Body (optional): { "to": "test@example.com" }
//
// Returns:
//   - Status config (env vars, FROM_EMAIL)
//   - Resend API reachable?
//   - Test email send result
//
// Admin only — pakai service_role key atau user JWT dengan role admin
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "EGLUX <noreply@eglux.co.id>";
const APP_URL = Deno.env.get("APP_URL") || "https://eglux.vercel.app";
const RESEND_API_URL = "https://api.resend.com/emails";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ⭐ Admin only
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json().catch(() => ({}));
    const testTo = body.to || "test@resend.dev";

    console.log("[test-email-config] Running diagnostic...");
    console.log("[test-email-config] Env vars:", {
      RESEND_API_KEY: RESEND_API_KEY ? `✓ set (${RESEND_API_KEY.substring(0, 8)}...)` : "✗ NOT SET",
      FROM_EMAIL,
      APP_URL,
    });

    // ── Step 1: Check env vars ──
    const configCheck = {
      resend_api_key_set: !!RESEND_API_KEY,
      resend_api_key_prefix: RESEND_API_KEY ? RESEND_API_KEY.substring(0, 8) + "..." : null,
      from_email: FROM_EMAIL,
      from_email_valid: FROM_EMAIL.includes("@"),
      storefront_url: APP_URL,
    };

    if (!RESEND_API_KEY) {
      return json({
        success: false,
        step: "config_check",
        error: "RESEND_API_KEY env var not set",
        config: configCheck,
        fix: "Set RESEND_API_KEY di Supabase Dashboard → Project Settings → Edge Functions → Environment Variables. Dapatkan API key dari https://resend.com/api-keys",
      }, 500);
    }

    if (!FROM_EMAIL.includes("@")) {
      return json({
        success: false,
        step: "config_check",
        error: `Invalid FROM_EMAIL: ${FROM_EMAIL}`,
        config: configCheck,
        fix: "Set FROM_EMAIL dengan format 'EGLUX <noreply@eglux.id>' — domain harus sudah di-verify di Resend dashboard",
      }, 500);
    }

    // ── Step 2: Test send email via Resend API ──
    const testSubject = "[EGLUX Test] Email config diagnostic";
    const testHtml = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:20px;">
  <h1 style="color:#9a7d4a;">✓ Email Config Test Berhasil</h1>
  <p>Email dari EGLUX sudah berhasil terkirim. Konfigurasi Resend API OK.</p>
  <p>Timestamp: ${new Date().toISOString()}</p>
  <hr>
  <p style="font-size:12px;color:#888;">Email ini dikirim dari edge function test-email-config</p>
</body></html>`;

    console.log(`[test-email-config] Sending test email to: ${testTo}, from: ${FROM_EMAIL}`);

    const resp = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [testTo],
        subject: testSubject,
        html: testHtml,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      let fix = "";
      if (resp.status === 401) {
        fix = "API key invalid atau expired. Generate ulang di https://resend.com/api-keys";
      } else if (resp.status === 403) {
        const domain = FROM_EMAIL.split("@")[1]?.replace(">", "") || "unknown";
        fix = `Domain "${domain}" belum ter-verify di Resend. Verify di https://resend.com/domains`;
      } else if (resp.status === 422) {
        fix = "Email format invalid. Cek FROM_EMAIL dan TO email format.";
      } else if (resp.status === 429) {
        fix = "Rate limit exceeded (free plan: 100 emails/day, 2/sec). Tunggu sebentar.";
      }

      return json({
        success: false,
        step: "resend_api",
        error: `Resend API returned HTTP ${resp.status}`,
        resend_response: data,
        config: configCheck,
        fix,
      }, 500);
    }

    // ── Step 3: Success ──
    return json({
      success: true,
      message: "✓ Email config OK — test email sent",
      resend_id: data.id,
      sent_to: testTo,
      sent_from: FROM_EMAIL,
      config: configCheck,
      next_steps: [
        "Cek inbox email testTo (kalau test@resend.dev, cek di Resend Dashboard → Logs)",
        "Kalau email masuk spam folder, setup DMARC + warm up domain",
        "Kalau sukses, deploy midtrans-webhook & send-email-notification untuk production use",
      ],
    }, 200);

  } catch (e) {
    console.error("[test-email-config] Error:", e);
    return json({ error: e.message, stack: e.stack }, 500);
  }
});
