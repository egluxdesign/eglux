// src/lib/wabaOtpClient.js
// ============================================================================
// WABA OTP Client — shared helper untuk panggil send-waba-otp + verify-waba-otp
// ============================================================================
// Kenapa gak pakai supabase.functions.invoke?
//   supabase.functions.invoke throw FunctionsHttpError kalau response non-2xx
//   TAPI gak ngasih akses ke response body — jadi error message asli dari
//   edge function ("Konfigurasi belum lengkap", "Nomor belum terdaftar", dll)
//   gak pernah kelihatan di UI. Raw fetch ngasih kita full control buat parse
//   JSON body baik success maupun error response.
//
// Dipakai oleh:
//   - src/pages/AdminPage.jsx      (full-page login form)
//   - src/components/ui/AuthModal.jsx (modal login form)
// ============================================================================

/**
 * Invoke a Supabase Edge Function via raw fetch.
 *
 * @param {string} name — function name (e.g. 'send-waba-otp')
 * @param {object} body — JSON body to send
 * @returns {Promise<object>} response data (with success: true)
 * @throws {Error} with message from edge function + hint if available.
 *                 err.data, err.status, err.debug attached for debugging.
 */
export async function invokeEdgeFunction(name, body) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      'Konfigurasi Supabase belum lengkap. Cek VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env frontend.'
    );
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(
      `Gagal terhubung ke server (network error). Cek koneksi internet lu. Detail: ${networkErr.message}`
    );
  }

  // Parse response body — handle JSON and non-JSON responses
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || `HTTP ${response.status}` };
    }
  }

  // Success: response.ok && data.success === true
  if (response.ok && data?.success) {
    return data;
  }

  // Error — build a clear message with hint if available
  let errMsg = data?.error || `HTTP ${response.status}`;
  if (data?.hint) {
    errMsg += ` — ${data.hint}`;
  }
  const err = new Error(errMsg);
  err.data = data;
  err.status = response.status;
  err.debug = data?.debug;
  throw err;
}

/**
 * Validate phone number format. Returns normalized phone (digits only, 628xxx)
 * or null if invalid.
 *
 * @param {string} raw — raw phone input from user
 * @returns {string|null} normalized phone (e.g. '6281234567890') or null
 */
export function normalizePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, '');
  if (!p) return null;
  if (p.startsWith('0')) p = '62' + p.slice(1);
  else if (!p.startsWith('62')) p = '62' + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
}
