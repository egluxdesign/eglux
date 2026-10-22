// supabase/functions/verify-waba-otp/index.ts
// ============================================================================
// Verify WABA OTP — Verify OTP Code + Generate Supabase Magic Link
// ============================================================================
// Flow:
//   1. Receive { phone, code } from frontend
//   2. Find OTP code in `otp_codes`: phone + code + used=false + expires_at > NOW
//   3. If not found → increment attempts on latest OTP, return error
//   4. If found → mark as used
//   5. Get user email from `customers` table (by phone)
//   6. Generate Supabase magic link (admin API) for auto-login
//   7. Return { success: true, redirect_url: <magic_link> }
//
// Auth: NO auth required (public endpoint)
// Deploy: supabase functions deploy verify-waba-otp --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// CONFIG
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const STOREFRONT_URL = Deno.env.get("STOREFRONT_URL") || "https://eglux.co.id";
const MAX_VERIFY_ATTEMPTS = 5;

// ============================================================================
// CORS + JSON helpers
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function errorResponse(message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, status);
}

// ============================================================================
// HELPERS
// ============================================================================
function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
}

/**
 * Find customer by phone — pakai RPC `get_customer_for_otp` (PILIHAN B).
 *
 * RPC function JOIN customers + auth.users, sort by last_sign_in_at DESC.
 * Hasil: OTP login masuk ke account yang PALING RECENT LOGIN — paling intuitif.
 *
 * Strategy:
 *  1. Try RPC dengan 3 format phone (+62xxx, 62xxx, 08xxx)
 *  2. Kalau RPC function gak ada / error fatal, fallback ke direct query:
 *     - .or() dengan 2 format tanpa `+` (62xxx, 08xxx)
 *     - .eq() satu per satu dengan 3 format
 *     - .order("created_at", DESC).limit(1).not("user_id", "is", null)
 *
 * Throws on real DB error. Returns null if no customer found.
 */
async function findCustomerByPhone(
  supabase: ReturnType<typeof createClient>,
  phone: string
) {
  const select = "id, name, email, user_id, phone";
  const phoneLocal = phone.startsWith("62") ? "0" + phone.slice(2) : phone;
  const phonePlus = `+${phone}`;

  // ========================================================================
  // ATTEMPT 1: Try RPC function get_customer_for_otp (PILIHAN B)
  // ========================================================================
  const rpcFormats = [phonePlus, phone, phoneLocal];
  for (const fmt of rpcFormats) {
    const { data: rpcData, error: rpcErr } = await supabase
      .rpc("get_customer_for_otp", { p_phone: fmt })
      .maybeSingle();

    if (rpcErr) {
      if (rpcErr.code === "42883" || rpcErr.code === "PGRST202") {
        console.warn("[verify-waba-otp] RPC get_customer_for_otp not found, falling back to direct query. Code:", rpcErr.code);
        break;
      }
      console.warn(`[verify-waba-otp] RPC error for format ${fmt}:`, rpcErr.message);
      continue;
    }

    if (rpcData) {
      console.log(`[verify-waba-otp] ✓ Customer found via RPC (format: ${fmt}):`, rpcData.email);
      return rpcData;
    }
  }

  // ========================================================================
  // ATTEMPT 2 (FALLBACK): Direct query if RPC unavailable
  // ========================================================================
  console.log("[verify-waba-otp] Using fallback direct query (no RPC available)");

  const buildQuery = (filterFn: (q: any) => any) =>
    filterFn(
      supabase
        .from("customers")
        .select(select)
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
    );

  const orResult = await buildQuery((q: any) =>
    q.or(`phone.eq.${phone},phone.eq.${phoneLocal}`).maybeSingle()
  );

  if (orResult.error && orResult.error.code !== "PGRST116") {
    console.warn("[verify-waba-otp] .or() query returned error, trying .eq() fallback:", orResult.error.message);

    const formats = [phonePlus, phone, phoneLocal];
    for (const fmt of formats) {
      const eqResult = await buildQuery((q: any) => q.eq("phone", fmt).maybeSingle());

      if (eqResult.error && eqResult.error.code !== "PGRST116") throw eqResult.error;
      if (eqResult.data) return eqResult.data;
    }

    return null;
  }

  if (orResult.data) return orResult.data;

  // Coba 1 format lagi dengan `+` prefix
  const plusResult = await buildQuery((q: any) => q.eq("phone", phonePlus).maybeSingle());

  if (plusResult.error && plusResult.error.code !== "PGRST116") throw plusResult.error;
  return plusResult.data;
}

function getHintForErrorCode(code: string | undefined): string {
  if (!code) return "Cek Supabase Dashboard > Edge Functions > verify-waba-otp > Logs.";
  if (code === "42P01") return "Table 'customers' belum dibuat. Run SQL 011_phaseA_auth_setup.sql.";
  if (code === "42703") return "Kolom 'phone' belum ada di table customers. Run SQL 011_phaseA_auth_setup.sql.";
  if (code === "PGRST106") return "Schema 'customers' belum ter-cache di PostgREST.";
  return "Cek Supabase Dashboard > Edge Functions > verify-waba-otp > Logs.";
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const phone = normalizePhone(body?.phone);
  if (!phone) {
    return errorResponse("Nomor WhatsApp tidak valid", 400);
  }

  const code = body?.code;
  if (!code || typeof code !== "string" || code.length !== 6) {
    return errorResponse("Kode OTP harus 6 digit", 400);
  }

  console.log(`[verify-waba-otp] Verify request: phone=${phone}, code=${code}`);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[verify-waba-otp] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return errorResponse("Server config incomplete", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // === STEP 1: Find valid OTP code (not used, not expired) ===
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
    console.error("[verify-waba-otp] OTP lookup DB error:", otpErr);
    return errorResponse("Gagal verifikasi kode", 500, {
      debug: {
        code: otpErr.code || "UNKNOWN",
        message: otpErr.message,
      },
      hint: otpErr.code === "42P01"
        ? "Table 'otp_codes' belum dibuat. Run SQL otp_codes_setup.sql."
        : "Cek schema otp_codes table.",
    });
  }

  // === STEP 2: OTP not found → increment attempts on latest unused OTP ===
  if (!otp) {
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

        return errorResponse("Terlalu banyak percobaan. Silakan minta kode OTP baru.", 429);
      }

      await supabase
        .from("otp_codes")
        .update({ attempts: newAttempts })
        .eq("id", latestOtp.id);

      const remaining = MAX_VERIFY_ATTEMPTS - newAttempts;
      return errorResponse(`Kode OTP salah. Sisa percobaan: ${remaining}`, 400);
    }

    return errorResponse(
      "Kode OTP tidak ditemukan atau sudah kadaluarsa. Silakan minta kode baru.",
      404
    );
  }

  // === STEP 3: Mark OTP as used ===
  const { error: updateErr } = await supabase
    .from("otp_codes")
    .update({ used: true, attempts: (otp.attempts || 0) + 1 })
    .eq("id", otp.id);

  if (updateErr) {
    console.error("[verify-waba-otp] Failed to mark OTP as used:", updateErr.message);
    // Continue — don't fail the verify just because we couldn't mark used
  }

  console.log(`[verify-waba-otp] ✓ OTP verified for phone: ${phone}`);

  // === STEP 4: Find customer by phone ===
  let customer;
  try {
    customer = await findCustomerByPhone(supabase, phone);
  } catch (dbErr: any) {
    console.error("[verify-waba-otp] Customer lookup DB error:", dbErr);
    return errorResponse("Gagal mengambil data customer", 500, {
      debug: {
        code: dbErr.code || "UNKNOWN",
        message: dbErr.message,
      },
      hint: getHintForErrorCode(dbErr.code),
    });
  }

  if (!customer) {
    console.error("[verify-waba-otp] Customer not found for phone:", phone);
    return errorResponse("Akun tidak ditemukan", 404);
  }

  if (!customer.email) {
    console.error("[verify-waba-otp] Customer has no email:", customer.id);
    return errorResponse("Email tidak ditemukan untuk akun ini", 404);
  }

  console.log(`[verify-waba-otp] Customer: ${customer.name} (${customer.email})`);

  // === STEP 5: Generate Supabase magic link for auto-login ===
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: customer.email,
    options: { redirectTo: `${STOREFRONT_URL}/orders` },
  });

  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[verify-waba-otp] Magic link generation failed:", linkErr?.message);
    // Return success-with-caveat — frontend akan fallback ke email login
    return json({
      success: true,
      verified: true,
      email: customer.email,
      error: "OTP verified but auto-login gagal. Silakan login manual dengan email.",
    });
  }

  const magicLink = linkData.properties.action_link;
  console.log(`[verify-waba-otp] ✓ Magic link generated for ${customer.email}`);

  // === STEP 6: Return magic link URL — frontend will redirect ===
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
