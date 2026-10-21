// supabase/functions/verify-waba-otp/index.ts
// ============================================================================
// Verify WABA OTP — Verify OTP Code + Generate Supabase Magic Link
// ============================================================================
// Flow:
//   1. Receive { phone: "628xxx", code: "123456" } from frontend
//   2. Query otp_codes: phone + code + used=false + expires_at > NOW
//   3. If not found → increment attempts → return error
//   4. If found → mark as used
//   5. Get user email from customers table (by phone)
//   6. Generate Supabase magic link (admin API) for auto-login
//   7. Return { success: true, redirect_url: <magic_link> }
//
// Auth: NO auth required (public endpoint)
// Deploy: supabase functions deploy verify-waba-otp --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STOREFRONT_URL = Deno.env.get("STOREFRONT_URL") || "https://eglux.co.id";
const MAX_VERIFY_ATTEMPTS = 5;

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

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
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

  const { phone: rawPhone, code } = body;
  const phone = normalizePhone(rawPhone);

  if (!phone) {
    return json({ error: "Nomor WhatsApp tidak valid" }, 400);
  }
  if (!code || typeof code !== "string" || code.length !== 6) {
    return json({ error: "Kode OTP harus 6 digit" }, 400);
  }

  console.log(`[verify-waba-otp] Verify request: phone=${phone}, code=${code}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. Find OTP code in DB (not used, not expired)
  const now = new Date().toISOString();
  const { data: otp, error: otpErr } = await supabase
    .from("otp_codes")
    .select("*")
    .eq("phone", phone)
    .eq("code", code)
    .eq("used", false)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpErr) {
    console.error("[verify-waba-otp] DB error:", otpErr.message);
    return json({ error: "Gagal verifikasi kode" }, 500);
  }

  if (!otp) {
    // OTP not found — check if there's an existing unused OTP for this phone
    // If yes, increment attempts on the latest one
    const { data: latestOtp } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("phone", phone)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOtp) {
      const newAttempts = (latestOtp.attempts || 0) + 1;

      if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
        // Lock this OTP (too many attempts)
        await supabase
          .from("otp_codes")
          .update({ used: true, attempts: newAttempts })
          .eq("id", latestOtp.id);

        return json({ error: "Terlalu banyak percobaan. Silakan minta kode OTP baru." }, 429);
      }

      await supabase
        .from("otp_codes")
        .update({ attempts: newAttempts })
        .eq("id", latestOtp.id);

      const remaining = MAX_VERIFY_ATTEMPTS - newAttempts;
      return json({
        error: `Kode OTP salah. Sisa percobaan: ${remaining}`,
      }, 400);
    }

    return json({ error: "Kode OTP tidak ditemukan atau sudah kadaluarsa. Silakan minta kode baru." }, 404);
  }

  // 2. OTP found and valid — mark as used
  const { error: updateErr } = await supabase
    .from("otp_codes")
    .update({ used: true, attempts: (otp.attempts || 0) + 1 })
    .eq("id", otp.id);

  if (updateErr) {
    console.error("[verify-waba-otp] Failed to mark OTP as used:", updateErr.message);
  }

  console.log(`[verify-waba-otp] ✓ OTP verified for phone: ${phone}`);

  // 3. Get user email from customers table (by phone)
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("id, name, email, user_id, phone")
    .or(`phone.eq.+${phone},phone.eq.${phone}`)
    .maybeSingle();

  if (custErr || !customer) {
    console.error("[verify-waba-otp] Customer not found:", custErr?.message);
    return json({ error: "Akun tidak ditemukan" }, 404);
  }

  if (!customer.email) {
    console.error("[verify-waba-otp] Customer has no email:", customer.id);
    return json({ error: "Email tidak ditemukan untuk akun ini" }, 404);
  }

  console.log(`[verify-waba-otp] Customer: ${customer.name} (${customer.email})`);

  // 4. Generate Supabase magic link for auto-login
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: customer.email,
    options: {
      redirectTo: `${STOREFRONT_URL}/orders`,
    },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[verify-waba-otp] Magic link generation failed:", linkErr?.message);
    return json({
      success: true,
      verified: true,
      email: customer.email,
      error: "OTP verified but auto-login gagal. Silakan login manual dengan email.",
    });
  }

  const magicLink = linkData.properties.action_link;
  console.log(`[verify-waba-otp] ✓ Magic link generated for ${customer.email}`);

  // 5. Return magic link URL — frontend will redirect
  return json({
    success: true,
    verified: true,
    redirect_url: magicLink,
    customer: {
      name: customer.name,
      email: customer.email,
    },
  });
});
