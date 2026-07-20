// src/lib/env.js
// ============================================================================
// Centralized environment config + validation
// ============================================================================
//
// KENAPA FILE INI ADA?
//   Sebelumnya, env vars di-access langsung via `import.meta.env.VITE_XXX`
//   di banyak file (OrdersList, CheckoutModalMidtrans, ChangeCourierModal,
//   useMidtransSnap, dst.). Akibatnya:
//     - Gak ada satu tempat untuk lihat semua env vars yang dipakai
//     - Gak ada validasi startup — user baru tau env var missing saat
//       fitur tertentu gagal (mis. klik "Lanjutkan Pembayaran" → error
//       "Midtrans client key not configured" yang mysterious)
//     - Error message gak konsisten
//
//   Sekarang: satu file ini jadi single source of truth. Saat app start,
//   validateEnv() dipanggil. Kalau ada var missing, EnvErrorPage render
//   dengan instruksi yang jelas (var mana yang missing + cara setting).
//
// Cara pakai:
//   import { env, validateEnv, getMissingEnvVars } from '../lib/env';
//
//   // Akses env var (semua sudah validated):
//   env.SUPABASE_URL
//   env.SUPABASE_ANON_KEY
//   env.MIDTRANS_CLIENT_KEY
//   env.MIDTRANS_IS_PRODUCTION
//
//   // Startup validation:
//   const missing = getMissingEnvVars();
//   if (missing.length > 0) {
//     // render EnvErrorPage dengan `missing` list
//   }
// ============================================================================

// ── Env var definitions ────────────────────────────────────────────────────
// Setiap var punya: key (VITE_XXX), label (untuk display), required (bool),
// description (untuk EnvErrorPage), dan group (untuk grouping di UI).
const ENV_DEFINITIONS = [
  {
    key: 'VITE_SUPABASE_URL',
    label: 'Supabase URL',
    required: true,
    group: 'Supabase',
    description: 'URL project Supabase. Format: https://<project-ref>.supabase.co',
    hint: 'Dashboard → Project Settings → API → Project URL',
  },
  {
    key: 'VITE_SUPABASE_ANON_KEY',
    label: 'Supabase Anon Key',
    required: true,
    group: 'Supabase',
    description: 'Anon public key (publishable, safe untuk frontend).',
    hint: 'Dashboard → Project Settings → API → Project API Keys → anon public',
  },
  {
    key: 'VITE_MIDTRANS_CLIENT_KEY',
    label: 'Midtrans Client Key',
    required: true,
    group: 'Midtrans (Payment)',
    description: 'Client Key dari Midtrans (public, safe untuk frontend). Sandbox format: SB-Mid-client-XXX. Production: Mid-client-XXX.',
    hint: 'Midtrans Dashboard → Settings → Access Keys → Client Key',
  },
  {
    key: 'VITE_MIDTRANS_IS_PRODUCTION',
    label: 'Midtrans Production Mode',
    required: false,
    group: 'Midtrans (Payment)',
    description: 'Set "true" kalau production (pakai app.midtrans.com). Kosong/false = sandbox (app.sandbox.midtrans.com).',
    hint: 'Default: false (sandbox)',
  },
];

// ── Parsed env (read once, cached) ─────────────────────────────────────────
const rawEnv = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  MIDTRANS_CLIENT_KEY: import.meta.env.VITE_MIDTRANS_CLIENT_KEY,
  MIDTRANS_IS_PRODUCTION: import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true',
};

// ── Public env object (frozen, type-safe) ──────────────────────────────────
export const env = Object.freeze({
  ...rawEnv,

  // Derived helpers
  SUPABASE_URL_VALID: typeof rawEnv.SUPABASE_URL === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(rawEnv.SUPABASE_URL),

  MIDTRANS_SNAP_JS_URL: rawEnv.MIDTRANS_IS_PRODUCTION
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js',

  MIDTRANS_MODE_LABEL: rawEnv.MIDTRANS_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX',
});

// ── Validation ─────────────────────────────────────────────────────────────

/**
 * Return list of missing REQUIRED env vars.
 * Setiap item: { key, label, description, hint, group }
 */
export function getMissingEnvVars() {
  return ENV_DEFINITIONS
    .filter(def => def.required)
    .filter(def => {
      const val = import.meta.env[def.key];
      return val === undefined || val === null || val === '' ||
             (typeof val === 'string' && val.trim() === '');
    })
    .map(def => ({
      key: def.key,
      label: def.label,
      description: def.description,
      hint: def.hint,
      group: def.group,
    }));
}

/**
 * Validate env vars. Return { valid: boolean, missing: [] }.
 * Dipanggil saat app start (main.jsx). Kalau valid=false, render EnvErrorPage.
 */
export function validateEnv() {
  const missing = getMissingEnvVars();
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get all env definitions (untuk display di EnvErrorPage atau debug panel).
 */
export function getEnvDefinitions() {
  return ENV_DEFINITIONS;
}

// ── Dev mode: log warning kalau ada missing ───────────────────────────────
if (import.meta.env.DEV) {
  const { valid, missing } = validateEnv();
  if (!valid) {
    console.group('⚠️  EGLUX — Missing Environment Variables');
    console.warn('Beberapa fitur gak akan jalan sampai env vars di-set:');
    missing.forEach(m => {
      console.warn(`  • ${m.key} (${m.label}) — ${m.description}`);
    });
    console.warn('');
    console.warn('Cara fix:');
    console.warn('  1. Copy .env.example ke .env:  cp .env.example .env');
    console.warn('  2. Isi nilai untuk setiap var yang missing');
    console.warn('  3. Restart Vite dev server:  npm run dev');
    console.groupEnd();
  } else {
    console.log('✓ EGLUX — All required env vars configured');
  }
}
