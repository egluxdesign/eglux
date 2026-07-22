// supabase/functions/send-newsletter-welcome/index.ts
// ============================================================================
// send-newsletter-welcome — Kirim email welcome ke subscriber baru
// ============================================================================
//
// Provider: Resend API (https://resend.com)
//   - Free tier: 3,000 emails/bulan, 100 emails/hari
//   - Setup: daftar di resend.com → dapat API key → set RESEND_API_KEY di Supabase env vars
//   - Domain: set custom domain di Resend (mis. noreply@eglux.co.id) ATAU pakai
//     default Resend domain (onboarding@resend.dev) untuk testing
//
// Cara panggil:
//   POST /functions/v1/send-newsletter-welcome
//   Body: { "email": "user@example.com", "subscriber_id": "uuid" }
//
// Email berisi:
//   - Welcome message
//   - Apa yang akan user terima (produk update, promo, tips)
//   - Unsubscribe link (dengan token = subscriber_id)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("NEWSLETTER_FROM_EMAIL") || "onboarding@resend.dev";
const APP_URL = Deno.env.get("APP_URL") || "https://eglux.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// HTML email template — EGLUX branded
// ============================================================================
function buildWelcomeEmail(email: string, subscriberId: string): string {
  const unsubscribeUrl = `${APP_URL}/unsubscribe?token=${subscriberId}&email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selamat Datang di Newsletter EGLUX</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f0e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f0e8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a1a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#c9a96e;font-size:28px;font-weight:700;letter-spacing:2px;">EGLUX</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Produk Rumah Tangga & Dapur Berkualitas</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a1a1a;font-size:22px;font-weight:700;">Selamat Datang! 🎉</h2>
              <p style="margin:0 0 16px;color:#666;font-size:15px;line-height:1.7;">
                Terima kasih sudah berlangganan newsletter EGLUX. Kami senang Anda bergabung!
              </p>
              <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.7;">
                Mulai sekarang, Anda akan menjadi yang pertama menerima:
              </p>

              <!-- Benefits list -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td style="padding:8px 0;color:#666;font-size:14px;line-height:1.6;">
                    <span style="color:#c9a96e;font-weight:bold;">✦</span>&nbsp;&nbsp;Update produk terbaru dan koleksi eksklusif
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#666;font-size:14px;line-height:1.6;">
                    <span style="color:#c9a96e;font-weight:bold;">✦</span>&nbsp;&nbsp;Penawaran spesial dan promo hanya untuk subscriber
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#666;font-size:14px;line-height:1.6;">
                    <span style="color:#c9a96e;font-weight:bold;">✦</span>&nbsp;&nbsp;Tips & inspirasi untuk rumah modern
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#666;font-size:14px;line-height:1.6;">
                    <span style="color:#c9a96e;font-weight:bold;">✦</span>&nbsp;&nbsp;Diskon early access sebelum publik
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${APP_URL}/products" style="display:inline-block;background-color:#c9a96e;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.5px;">
                      Mulai Belanja
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#999;font-size:13px;line-height:1.6;">
                Jangan lupa cek email kamu secara berkala ya. Email newsletter mungkin masuk ke folder Promotions atau Spam — tandai sebagai "Not Spam" supaya selalu masuk inbox.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f6f0;padding:24px 40px;border-top:1px solid #eee;">
              <p style="margin:0 0 8px;color:#999;font-size:12px;line-height:1.5;">
                Email ini dikirim ke <strong style="color:#666;">${email}</strong> karena Anda berlangganan newsletter EGLUX.
              </p>
              <p style="margin:0;color:#999;font-size:12px;line-height:1.5;">
                Mau berhenti berlangganan? <a href="${unsubscribeUrl}" style="color:#c9a96e;text-decoration:underline;">Unsubscribe di sini</a>.
              </p>
              <p style="margin:12px 0 0;color:#ccc;font-size:11px;">
                © 2026 EGLUX — All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email, subscriber_id } = await req.json();

    if (!email) return json({ error: "email is required" }, 400);
    if (!subscriber_id) return json({ error: "subscriber_id is required" }, 400);

    // Cek apakah RESEND_API_KEY di-set
    if (!RESEND_API_KEY) {
      console.warn("[send-newsletter-welcome] RESEND_API_KEY not set — skipping email send");
      return json({
        success: false,
        skipped: true,
        reason: "RESEND_API_KEY not configured",
      });
    }

    // Build email HTML
    const htmlContent = buildWelcomeEmail(email, subscriber_id);

    // Kirim via Resend API
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: "Selamat Datang di Newsletter EGLUX! 🎉",
        html: htmlContent,
      }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      console.error("[send-newsletter-welcome] Resend API error:", resp.status, result);
      return json({
        success: false,
        error: "Failed to send email",
        details: result,
      }, 502);
    }

    console.log("[send-newsletter-welcome] ✓ Welcome email sent to:", email, "ID:", result.id);

    return json({
      success: true,
      message: "Welcome email sent",
      email_id: result.id,
    });
  } catch (e) {
    console.error("[send-newsletter-welcome]", e);
    return json({ error: e.message }, 500);
  }
});
