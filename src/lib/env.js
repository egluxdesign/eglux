// src/lib/env.js
// ============================================================================
// Centralized environment config + validation
// ============================================================================
// v3 CHANGES:
//   - Midtrans env vars → optional (legacy, gak dipakai lagi setelah switch ke DOKU)
//   - Add VITE_DOKU_MODE (sandbox | production)
//   - Backward-compat: env.MIDTRANS_* tetap ada (gak break legacy files yang
//     masih import env object, walaupun nilainya undefined sekarang)
// ============================================================================

// ── Env var definitions ────────────────────────────────────────────────────
const ENV_DEFINITIONS = [
  // ── Required: Supabase ──
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

  // ── Optional: DOKU Checkout (active payment gateway) ──
  // Default: 'production' kalau gak di-set. Set 'sandbox' untuk testing.
  {
    key: 'VITE_DOKU_MODE',
    label: 'DOKU Mode',
    required: false,  // ⭐ v3.1: optional — ada default value 'production'
    group: 'DOKU (Payment)',
    description: 'Mode DOKU Checkout: "sandbox" untuk testing, "production" untuk live. Default: production.',
    hint: 'Boleh kosong. Set "sandbox" kalau mau testing di DOKU sandbox.',
  },

  // ── Optional: Midtrans (LEGACY — gak dipakai setelah switch ke DOKU) ──
  {
    key: 'VITE_MIDTRANS_CLIENT_KEY',
    label: 'Midtrans Client Key (Legacy)',
    required: false,  // ⭐ v3: optional sekarang — DOKU yang aktif
    group: 'Midtrans (Legacy — unused)',
    description: 'Client Key Midtrans lama. Tidak dipakai lagi setelah migrasi ke DOKU Checkout.',
    hint: 'Boleh kosong. Aman untuk dihapus dari .env kalau sudah yakin DOKU berjalan.',
  },
  {
    key: 'VITE_MIDTRANS_IS_PRODUCTION',
    label: 'Midtrans Production Mode (Legacy)',
    required: false,
    group: 'Midtrans (Legacy — unused)',
    description: 'Mode Midtrans lama. Tidak dipakai lagi.',
    hint: 'Boleh kosong.',
  },
];

// ── Parsed env ─────────────────────────────────────────────────────────────
const rawEnv = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,

  // DOKU (active)
  DOKU_MODE: (import.meta.env.VITE_DOKU_MODE || 'production').toLowerCase(),  // default production
  DOKU_IS_PRODUCTION: (import.meta.env.VITE_DOKU_MODE || 'production').toLowerCase() === 'production',

  // Midtrans (legacy — tetap dibaca untuk backward compat, tapi gak required)
  MIDTRANS_CLIENT_KEY: import.meta.env.VITE_MIDTRANS_CLIENT_KEY,
  MIDTRANS_IS_PRODUCTION: import.meta.env.VITE_MIDTRANS_FORCE_SANDBOX === 'true' ? false : true,
};

// ── Public env object (frozen, type-safe) ──────────────────────────────────
export const env = Object.freeze({
  ...rawEnv,

  // Derived helpers — Supabase
  SUPABASE_URL_VALID: typeof rawEnv.SUPABASE_URL === 'string' &&
    /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(rawEnv.SUPABASE_URL),

  // Derived helpers — DOKU
  DOKU_JS_URL: rawEnv.DOKU_IS_PRODUCTION
    ? 'https://jokul.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js'
    : 'https://sandbox.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js',
  DOKU_MODE_LABEL: rawEnv.DOKU_IS_PRODUCTION ? 'PRODUCTION' : 'SANDBOX',

  // Derived helpers — Midtrans (legacy, tetap disediakan supaya file lama gak crash)
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

// ── Dev mode: log status ──────────────────────────────────────────────────
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

  // Log payment gateway status
  console.log(`[DOKU] Mode: ${env.DOKU_MODE_LABEL} | JS URL: ${env.DOKU_JS_URL}`);
  if (env.MIDTRANS_CLIENT_KEY) {
    console.log(`[Midtrans Legacy] Mode: ${env.MIDTRANS_MODE_LABEL} (tidak dipakai lagi)`);
  }
}
