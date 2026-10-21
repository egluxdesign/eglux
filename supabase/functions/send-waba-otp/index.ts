// supabase/functions/send-waba-otp/index.ts
// ============================================================================
// Send WABA OTP — Generate + Send OTP via Qiscus WhatsApp
// ============================================================================
// Flow:
//   1. Receive { phone: "628xxx" } from frontend
//   2. Normalize phone to E.164 (628xxx, no +)
//   3. Check phone exists in customers table (must be registered)
//   4. Rate limit: max 3 OTP requests per phone per 15 minutes
//   5. Generate 6-digit random OTP
//   6. Save to otp_codes table (expires 5 minutes)
//   7. Send WA via Qiscus API (template: eglux_otp_login)
//   8. Return { success: true }
//
// Auth: NO auth required (public endpoint — user isn't logged in yet)
// Deploy: supabase functions deploy send-waba-otp --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const QISCUS_APP_ID = Deno.env.get("QISCUS_APP_ID");
const QISCUS_SECRET_KEY = Deno.env.get("QISCUS_SECRET_KEY");
const QISCUS_CHANNEL_ID = Deno.env.get("QISCUS_CHANNEL_ID");
const QISCUS_REGION = Deno.env.get("QISCUS_REGION") || "id";
const QISCUS_OTP_TEMPLATE_NAMESPACE = "4ba2e5a5_1f46_4283_8b29_b0d29113e5f3";
const QISCUS_OTP_TEMPLATE_NAME = "eglux_otp_login";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getQiscusBaseUrl(): string {
  if (QISCUS_REGION.toLowerCase() === "my") return "https://omnichannel-my.qiscus.com";
  return "https://omnichannel.qiscus.com";
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { phone: rawPhone } = body;
  const phone = normalizePhone(rawPhone);

  if (!phone) {
    return json({ error: "Nomor WhatsApp tidak valid. Format: 628xxx atau 08xxx" }, 400);
  }

  console.log(`[send-waba-otp] Request for phone: ${phone}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Check phone exists in customers table (must be registered to login)
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name, email, phone, user_id")
    .or(`phone.eq.+${phone},phone.eq.${phone}`)
    .maybeSingle();

  if (custErr) {
    console.error("[send-waba-otp] DB error:", custErr.message);
    return json({ error: "Gagal verifikasi nomor" }, 500);
  }

  if (!customer) {
    return json({ error: "Nomor WhatsApp belum terdaftar. Silakan registrasi terlebih dahulu." }, 404);
  }

  console.log(`[send-waba-otp] ✓ Customer found: ${customer.name} (${customer.email})`);

  // 2. Rate limit: max 3 OTP requests per phone per 15 minutes
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: recentCount, error: countErr } = await supabase
    .from("otp_codes")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", fifteenMinAgo);

  if (countErr) {
    console.warn("[send-waba-otp] Rate limit check failed:", countErr.message);
  } else if (recentCount && recentCount >= 3) {
    return json({ error: "Terlalu banyak permintaan OTP. Coba lagi dalam 15 menit." }, 429);
  }

  // 3. Generate 6-digit OTP
  const otpCode = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  console.log(`[send-waba-otp] Generated OTP: ${otpCode} (expires: ${expiresAt})`);

  // 4. Save to otp_codes table
  const { error: insertErr } = await supabase
    .from("otp_codes")
    .insert({
      phone,
      code: otpCode,
      purpose: "login",
      used: false,
      attempts: 0,
      expires_at: expiresAt,
    });

  if (insertErr) {
    console.error("[send-waba-otp] Failed to save OTP:", insertErr.message);
    return json({ error: "Gagal menyimpan kode OTP" }, 500);
  }

  // 5. Check Qiscus credentials
  const missingVars: string[] = [];
  if (!QISCUS_APP_ID) missingVars.push("QISCUS_APP_ID");
  if (!QISCUS_SECRET_KEY) missingVars.push("QISCUS_SECRET_KEY");
  if (!QISCUS_CHANNEL_ID) missingVars.push("QISCUS_CHANNEL_ID");

  if (missingVars.length > 0) {
    console.error("[send-waba-otp] Missing Qiscus env vars:", missingVars);
    return json({ error: "Konfigurasi WhatsApp belum lengkap" }, 500);
  }

  // 6. Send WA via Qiscus API
  const qiscusApiUrl = `${getQiscusBaseUrl()}/whatsapp/v1/${QISCUS_APP_ID}/${QISCUS_CHANNEL_ID}/messages`;

  const payload = {
    to: phone,
    type: "template",
    template: {
      namespace: QISCUS_OTP_TEMPLATE_NAMESPACE,
      name: QISCUS_OTP_TEMPLATE_NAME,
      language: {
        policy: "deterministic",
        code: "id",
      },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: otpCode },
          ],
        },
      ],
    },
  };

  console.log(`[send-waba-otp] Sending to Qiscus API:`, {
    url: qiscusApiUrl,
    to: phone,
    template: QISCUS_OTP_TEMPLATE_NAME,
  });

  try {
    const response = await fetch(qiscusApiUrl, {
      method: "POST",
      headers: {
        "Qiscus-App-Id": QISCUS_APP_ID!,
        "Qiscus-Secret-Key": QISCUS_SECRET_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data: any;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try { data = JSON.parse(text); } catch { data = { raw_text: text }; }
    }

    if (!response.ok) {
      console.error("[send-waba-otp] Qiscus API error:", response.status, data);
      return json({
        error: "Gagal mengirim kode OTP via WhatsApp",
        debug: data?.error?.message || data?.error || data,
      }, 502);
    }

    const messageId = data?.data?.message_id || data?.data?.id || data?.message_id || data?.id || "sent";

    console.log(`[send-waba-otp] ✓ OTP sent: ${messageId}`);

    return json({
      success: true,
      message: "Kode OTP telah dikirim ke WhatsApp Anda",
      phone: phone,
      expires_in: "5 menit",
    });
  } catch (err) {
    console.error("[send-waba-otp] Network error:", err?.message);
    return json({ error: "Gagal terhubung ke server WhatsApp" }, 502);
  }
});