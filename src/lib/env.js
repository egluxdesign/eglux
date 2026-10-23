// src/lib/env.js
// ============================================================================
// Centralized environment config + validation
// ============================================================================
// ⭐ v2 FIX: Hardcode MIDTRANS_IS_PRODUCTION = true buat production.
//   Masalah sebelumnya: VITE_MIDTRANS_IS_PRODUCTION gak kebaca dari .env.local
//   → Snap.js load dari sandbox → 404 saat checkout.
//   Fix: hardcode production URL, bypass env var check.
//   Kalau mau balik ke sandbox untuk testing, set MIDTRANS_FORCE_SANDBOX=true di .env.local
// ============================================================================

// ── Env var definitions ────────────────────────────────────────────────────
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
    description: 'Client Key dari Midtrans (public, safe untuk frontend). Production: Mid-client-XXX.',
    hint: 'Midtrans Dashboard → Settings → Access Keys → Client Key',
  },
  {
    key: 'VITE_MIDTRANS_IS_PRODUCTION',
    label: 'Midtrans Production Mode',
    required: false,
    group: 'Midtrans (Payment)',
    description: 'Set "true" kalau production. Kosong/false = sandbox.',
    hint: 'Default: true (hardcoded production buat LIVE)',
  },
];

// ── Parsed env ─────────────────────────────────────────────────────────────
const rawEnv = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  MIDTRANS_CLIENT_KEY: import.meta.env.VITE_MIDTRANS_CLIENT_KEY,
  // ⭐ FIX: Hardcode production = true. Bypass env var yang gak kebaca.
  // Kalau mau sandbox testing, set VITE_MIDTRANS_FORCE_SANDBOX=true di .env.local
  MIDTRANS_IS_PRODUCTION: import.meta.env.VITE_MIDTRANS_FORCE_SANDBOX === 'true' ? false : true,
};

// ── Public env object (frozen, type-safe) ──────────────────────────────────
export const env = Object.freeze({
  ...rawEnv,

  // Derived helpers
  SUPABASE_URL_VALID: typeof rawEnv.SUPABASE_URL === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(rawEnv.SUPABASE_URL),

  // ⭐ FIX: Hardcode production Snap.js URL
  MIDTRANS_SNAP_JS_URL: rawEnv.MIDTRANS_IS_PRODUCTION
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js',

  MIDTRANS_MODE_LABEL: rawEnv.MIDTRANS_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX',
});

// ── Validation ─────────────────────────────────────────────────────────────

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

export function validateEnv() {
  const missing = getMissingEnvVars();
  return {
    valid: missing.length === 0,
    missing,
  };
}

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

  // ⭐ Log Midtrans mode
  console.log(`[Midtrans] Mode: ${env.MIDTRANS_MODE_LABEL} | Snap.js URL: ${env.MIDTRANS_SNAP_JS_URL}`);
}
