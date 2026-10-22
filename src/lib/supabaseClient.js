// src/lib/supabaseClient.js
// ============================================================================
// Supabase client singleton — shared instance untuk seluruh app.
// Dipakai oleh: AuthContext, AdminPage, AuthModal, wabaOtpClient, dll.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

// ⭐ Debug: pastikan env vars ada (kalau gak, auth + DB gak bakal jalan)
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[supabaseClient] Missing env vars!', {
    VITE_SUPABASE_URL: !!supabaseUrl,
    VITE_SUPABASE_ANON_KEY: !!supabaseAnonKey,
    VITE_SUPABASE_KEY: !!import.meta.env.VITE_SUPABASE_KEY,
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ⭐ detectSessionInUrl: TRUE (default, tapi explicit buat safety)
    //   Kalau TRUE, supabase-js auto-detect URL hash fragment dari magic link
    //   redirect (e.g., localhost:3000/#access_token=eyJ...&type=magiclink)
    //   + auto-exchange jadi session + trigger SIGNED_IN event.
    //   PENTING buat OTP login magic link redirect jalan.
    detectSessionInUrl: true,

    // ⭐ persistSession: TRUE (default)
    //   Save session ke localStorage biar user tetap logged in setelah refresh.
    persistSession: true,

    // ⭐ autoRefreshToken: TRUE (default)
    //   Auto refresh JWT token sebelum expire (background, no user action).
    autoRefreshToken: true,

    // ⭐ flowType: 'implicit' (default)
    //   Pakai implicit flow (hash fragment) untuk magic link + OAuth.
    //   Alternative: 'pkce' (lebih secure, tapi butuh /auth/callback route).
    flowType: 'implicit',

    // ⭐ storageKey: 'sb-auth-token' (default)
    //   Key di localStorage buat simpen session. Ubah kalau mau custom.
    // storageKey: 'sb-auth-token',

    // ⭐ storage: window.localStorage (default)
    //   Kalau SSR (Next.js/Remix), pakai:
    //   storage: createJSONStorage(() => cookieStorage)
    // storage: undefined,
  },

  // ⭐ global headers (optional — buat debug/identify request source)
  global: {
    headers: { 'X-Client-Info': 'eglux-storefront-v1' },
  },
});

export default supabase;
