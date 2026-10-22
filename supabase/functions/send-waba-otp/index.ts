// supabase/functions/send-waba-otp/index.ts
// ============================================================================
// Send WABA OTP — Generate + Send OTP via Qiscus WhatsApp
// ============================================================================
// Flow:
//   1. Receive { phone } from frontend (raw input, format bebas)
//   2. Normalize phone to E.164 (628xxx, no +)
//   3. Find customer in `customers` table by phone (try 3 formats)
//   4. Rate limit: max 3 OTP per phone per 15 minutes
//   5. Generate 6-digit random OTP
//   6. Save to `otp_codes` table (expires 5 minutes)
//   7. Send WA via Qiscus API (template: eglux_otp_login)
//   8. Return { success: true }
//
// Auth: NO auth required (public — user isn't logged in yet)
// Deploy: supabase functions deploy send-waba-otp --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// CONFIG
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const QISCUS_APP_ID = Deno.env.get("QISCUS_APP_ID");
const QISCUS_SECRET_KEY = Deno.env.get("QISCUS_SECRET_KEY");
const QISCUS_CHANNEL_ID = Deno.env.get("QISCUS_CHANNEL_ID");
const QISCUS_REGION = Deno.env.get("QISCUS_REGION") || "id";
const QISCUS_OTP_TEMPLATE_NAMESPACE = "4ba2e5a5_1f46_4283_8b29_b0d29113e5f3";
const QISCUS_OTP_TEMPLATE_NAME = "eglux_otp_login";

const MAX_OTP_PER_15MIN = 3;
const OTP_TTL_MINUTES = 5;

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
function getQiscusBaseUrl(): string {
  return QISCUS_REGION.toLowerCase() === "my"
    ? "https://omnichannel-my.qiscus.com"
    : "https://omnichannel.qiscus.com";
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
 *     - .eq() satu per satu dengan 3 format (+62xxx, 62xxx, 08xxx)
 *     - .order("created_at", DESC).limit(1).not("user_id", "is", null)
 *     - Pick customer paling baru di-INSERT (gak se-akurat RPC)
 *
 * Throws on real DB error. Returns null if no customer found.
 */
async function findCustomerByPhone(
  supabase: ReturnType<typeof createClient>,
  phone: string
) {
  const select = "id, name, email, phone, user_id";
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
      // 42883 = function does not exist (Postgres)
      // PGRST202 = schema/function not found (PostgREST)
      // Kalau fatal error, break dan fallback ke direct query
      if (rpcErr.code === "42883" || rpcErr.code === "PGRST202") {
        console.warn("[send-waba-otp] RPC get_customer_for_otp not found, falling back to direct query. Code:", rpcErr.code);
        break;
      }
      // Other errors: skip this format, try next
      console.warn(`[send-waba-otp] RPC error for format ${fmt}:`, rpcErr.message);
      continue;
    }

    if (rpcData) {
      console.log(`[send-waba-otp] ✓ Customer found via RPC (format: ${fmt}):`, rpcData.email);
      return rpcData;
    }
  }

  // ========================================================================
  // ATTEMPT 2 (FALLBACK): Direct query if RPC unavailable
  // Picks customer paling baru di-INSERT (created_at DESC), skip guest checkouts
  // ========================================================================
  console.log("[send-waba-otp] Using fallback direct query (no RPC available)");

  const buildQuery = (filterFn: (q: any) => any) =>
    filterFn(
      supabase
        .from("customers")
        .select(select)
        .not("user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
    );

  // Try .or() dengan 2 format tanpa `+` (62xxx dan 08xxx)
  const orResult = await buildQuery((q: any) =>
    q.or(`phone.eq.${phone},phone.eq.${phoneLocal}`).maybeSingle()
  );

  if (orResult.error && orResult.error.code !== "PGRST116") {
    console.warn("[send-waba-otp] .or() query returned error, trying .eq() fallback:", orResult.error.message);

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

/**
 * Build a troubleshooting hint based on Postgres error code.
 */
function getHintForErrorCode(code: string | undefined): string {
  if (!code) return "Cek Supabase Dashboard > Edge Functions > send-waba-otp > Logs.";
  if (code === "42P01") return "Table 'customers' belum dibuat. Run SQL 011_phaseA_auth_setup.sql.";
  if (code === "42703") return "Kolom 'phone' belum ada di table customers. Run SQL 011_phaseA_auth_setup.sql.";
  if (code === "PGRST106") return "Schema 'customers' belum ter-cache di PostgREST. Reload atau restart PostgREST.";
  return "Cek Supabase Dashboard > Edge Functions > send-waba-otp > Logs.";
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  // Normalize + validate phone
  const phone = normalizePhone(body?.phone);
  if (!phone) {
    return errorResponse("Nomor WhatsApp tidak valid. Format: 628xxx atau 08xxx", 400);
  }

  console.log(`[send-waba-otp] Request for phone: ${phone}`);

  // Validate config
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[send-waba-otp] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    return errorResponse("Server config incomplete (Supabase vars missing)", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // === STEP 1: Find customer by phone ===
  let customer;
  try {
    customer = await findCustomerByPhone(supabase, phone);
  } catch (dbErr: any) {
    console.error("[send-waba-otp] Customer lookup DB error:", dbErr);
    return errorResponse("Gagal verifikasi nomor", 500, {
      debug: {
        code: dbErr.code || "UNKNOWN",
        message: dbErr.message,
        details: dbErr.details || null,
        hint: dbErr.hint || null,
      },
      hint: getHintForErrorCode(dbErr.code),
    });
  }

  if (!customer) {
    return errorResponse("Nomor WhatsApp belum terdaftar. Silakan registrasi terlebih dahulu.", 404);
  }

  console.log(`[send-waba-otp] ✓ Customer: ${customer.name} (${customer.email})`);

  // === STEP 2: Rate limit — max 3 OTP per phone per 15 minutes ===
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countErr } = await supabase
    .from("otp_codes")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", fifteenMinAgo);

  if (countErr) {
    console.warn("[send-waba-otp] Rate limit check failed (continuing anyway):", countErr.message);
  } else if (count && count >= MAX_OTP_PER_15MIN) {
    return errorResponse("Terlalu banyak permintaan OTP. Coba lagi dalam 15 menit.", 429);
  }

  // === STEP 3: Generate + save OTP code ===
  const otpCode = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from("otp_codes").insert({
    phone,
    code: otpCode,
    purpose: "login",
    used: false,
    attempts: 0,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[send-waba-otp] OTP insert error:", insertErr);
    return errorResponse("Gagal menyimpan kode OTP", 500, {
      debug: {
        code: insertErr.code || "UNKNOWN",
        message: insertErr.message,
        details: insertErr.details || null,
        hint: insertErr.hint || null,
      },
      hint: insertErr.code === "42P01"
        ? "Table 'otp_codes' belum dibuat. Run SQL otp_codes_setup.sql."
        : "Cek schema otp_codes table.",
    });
  }

  console.log(`[send-waba-otp] ✓ OTP saved (expires: ${expiresAt})`);

  // === STEP 4: Validate Qiscus config ===
  const missing: string[] = [];
  if (!QISCUS_APP_ID) missing.push("QISCUS_APP_ID");
  if (!QISCUS_SECRET_KEY) missing.push("QISCUS_SECRET_KEY");
  if (!QISCUS_CHANNEL_ID) missing.push("QISCUS_CHANNEL_ID");

  if (missing.length > 0) {
    console.error("[send-waba-otp] Missing Qiscus env vars:", missing);
    return errorResponse("Konfigurasi WhatsApp belum lengkap", 500, {
      debug: { missing_vars: missing },
      hint: `Set secrets: ${missing.map((m) => `supabase secrets set ${m}=xxx`).join("; ")}`,
    });
  }

  // === STEP 5: Send WA via Qiscus API ===
  // Template 'eglux_otp_login' punya URL button (index 0) yang butuh parameter
  // (terpisah dari body parameter). Asumsi: URL button butuh OTP code sebagai
  // parameter (e.g., https://eglux.co.id/verify?code={{1}}).
  // Kalau template-nya beda (URL button butuh value lain), sesuaikan di sini.
  const qiscusUrl = `${getQiscusBaseUrl()}/whatsapp/v1/${QISCUS_APP_ID}/${QISCUS_CHANNEL_ID}/messages`;
  const payload = {
    to: phone,
    type: "template",
    template: {
      namespace: QISCUS_OTP_TEMPLATE_NAMESPACE,
      name: QISCUS_OTP_TEMPLATE_NAME,
      language: { policy: "deterministic", code: "id" },
      components: [
        // Body parameter — OTP code di body message
        {
          type: "body",
          parameters: [{ type: "text", text: otpCode }],
        },
        // URL button parameter — OTP code sebagai URL param (untuk button index 0)
        // Fix error WhatsApp Cloud API 131008: "Button at index 0 of type Url requires a parameter"
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: otpCode }],
        },
      ],
    },
  };

  console.log(`[send-waba-otp] Sending to Qiscus:`, {
    url: qiscusUrl,
    to: phone,
    template: QISCUS_OTP_TEMPLATE_NAME,
  });

  try {
    const resp = await fetch(qiscusUrl, {
      method: "POST",
      headers: {
        "Qiscus-App-Id": QISCUS_APP_ID!,
        "Qiscus-Secret-Key": QISCUS_SECRET_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Parse Qiscus response
    let qiscusData: any;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      qiscusData = await resp.json();
    } else {
      const t = await resp.text();
      try { qiscusData = JSON.parse(t); } catch { qiscusData = { raw_text: t }; }
    }

    if (!resp.ok) {
      console.error("[send-waba-otp] Qiscus API error:", resp.status, qiscusData);
      return errorResponse("Gagal mengirim kode OTP via WhatsApp", 502, {
        debug: {
          status: resp.status,
          qiscus_response: qiscusData?.error || qiscusData,
        },
        hint: "Cek Qiscus credentials + template 'eglux_otp_login' approval status.",
      });
    }

    const msgId = qiscusData?.data?.message_id || qiscusData?.data?.id || qiscusData?.message_id || "sent";
    console.log(`[send-waba-otp] ✓ OTP sent: ${msgId}`);

    return json({
      success: true,
      message: "Kode OTP telah dikirim ke WhatsApp Anda",
      phone,
      expires_in: `${OTP_TTL_MINUTES} menit`,
    });
  } catch (netErr: any) {
    console.error("[send-waba-otp] Network error to Qiscus:", netErr?.message);
    return errorResponse("Gagal terhubung ke server WhatsApp", 502, {
      debug: { message: netErr?.message },
      hint: "Cek koneksi Supabase Edge Functions ke Qiscus API.",
    });
  }
});
