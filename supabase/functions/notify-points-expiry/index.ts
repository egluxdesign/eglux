// supabase/functions/notify-points-expiry/index.ts
// ============================================================================
// notify-points-expiry — Kirim email ke user yang poinnya akan expire 30 hari
// ============================================================================
//
// Schedule: EVERY DAY at 08:00 WIB (01:00 UTC)
//   Cron: 0 1 * * *
//
// Logic:
//   1. Call RPC get_expiring_points(30) — dapat list user yang poinnya expire dalam 30 hari
//   2. Untuk setiap user: kirim email via Resend
//   3. Log summary
//
// Email template: inline HTML (simple, gak pakai _shared/email-templates.ts)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "EGLUX <noreply@eglux.co.id>";
const APP_URL = Deno.env.get("APP_URL") || Deno.env.get("STOREFRONT_URL") || "https://eglux.co.id";
const RESEND_API_URL = "https://api.resend.com/emails";
const CRON_SECRET = Deno.env.get("CRON_SECRET");

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function buildExpiryEmail(name: string, points: number, expiryDate: string): { subject: string; html: string } {
  const dateStr = new Date(expiryDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  return {
    subject: `⏰ Poin Anda (${points}) akan expire dalam 30 hari!`,
    html: `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f3ed;font-family:'Inter',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ed;padding:24px 12px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1a1a1a;padding:24px 32px;text-align:center;">
          <p style="margin:0;color:#9a7d4a;font-size:18px;font-weight:bold;">EGLUX</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="text-align:center;margin-bottom:24px;">
            <div style="width:56px;height:56px;background:#fef3c7;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:28px;">⏰</div>
            <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;">Poin Anda Akan Expire!</h1>
            <p style="margin:0;color:#8a8a8a;font-size:14px;">Hi ${name}, poin Anda akan expire segera.</p>
          </div>
          <div style="background:#f7f3ed;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#8a8a8a;">Poin yang akan expire:</p>
            <p style="margin:0;font-size:32px;font-weight:bold;color:#9a7d4a;">${points} poin</p>
            <p style="margin:8px 0 0;font-size:13px;color:#8a8a8a;">Tanggal expire: ${dateStr}</p>
          </div>
          <p style="font-size:14px;color:#3a3944;line-height:1.6;margin-bottom:24px;">
            Jangan sampai poin Anda terbuang! Tukarkan sekarang dengan voucher belanja yang tersedia.
          </p>
          <div style="text-align:center;">
            <a href="${APP_URL}/rewards" style="display:inline-block;padding:14px 32px;background:#9a7d4a;color:#fff;text-decoration:none;font-weight:600;border-radius:8px;font-size:14px;">
              Tukar Poin Sekarang
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#8a8a8a;text-align:center;">
            Email ini dikirim otomatis. Mohon jangan balas email ini.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (CRON_SECRET) {
    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== CRON_SECRET) {
      return json({ error: "Unauthorized: invalid cron secret" }, 401);
    }
  }

  try {
    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not set" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[notify-expiry] Started at", new Date().toISOString());

    // 1. Get users with expiring points (30 days)
    const { data: expiringUsers, error } = await supabase.rpc("get_expiring_points", { p_days: 30 });

    if (error) {
      console.error("[notify-expiry] RPC error:", error.message);
      return json({ error: "Failed to get expiring points", details: error.message }, 500);
    }

    if (!expiringUsers || expiringUsers.length === 0) {
      console.log("[notify-expiry] No users with expiring points — done");
      return json({ success: true, notifications_sent: 0, message: "No users with expiring points" });
    }

    console.log(`[notify-expiry] Found ${expiringUsers.length} users with expiring points`);

    // 2. Send email to each user
    let sentCount = 0;
    let failCount = 0;

    for (const user of expiringUsers) {
      try {
        if (!user.email) {
          console.warn(`[notify-expiry] User ${user.user_id?.slice(0, 8)} has no email — skip`);
          continue;
        }

        const { subject, html } = buildExpiryEmail(
          user.name || "Pelanggan",
          user.total_expiring,
          user.earliest_expiry
        );

        const resp = await fetch(RESEND_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [user.email],
            subject,
            html,
          }),
        });

        if (resp.ok) {
          sentCount++;
          console.log(`[notify-expiry] ✓ Email sent to ${user.email} (${user.total_expiring} poin, expire ${user.earliest_expiry})`);
        } else {
          failCount++;
          const errData = await resp.json().catch(() => ({}));
          console.warn(`[notify-expiry] ✗ Failed to send to ${user.email}: HTTP ${resp.status}`, errData);
        }

        // Small delay (avoid rate limit)
        await new Promise((r) => setTimeout(r, 300));
      } catch (e) {
        failCount++;
        console.warn(`[notify-expiry] Error sending to user ${user.user_id?.slice(0, 8)}:`, e?.message);
      }
    }

    console.log(`[notify-expiry] ✅ Done: ${sentCount} sent, ${failCount} failed`);

    return json({
      success: true,
      users_found: expiringUsers.length,
      notifications_sent: sentCount,
      notifications_failed: failCount,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[notify-expiry] Error:", e);
    return json({ error: e.message }, 500);
  }
});
