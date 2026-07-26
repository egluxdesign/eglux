// src/lib/logger.js
// ============================================================================
// logger — Dev-only console logging utility (PII-safe)
// ============================================================================
//
// Tujuan:
//   - Di production: semua log di-skip (kecuali error untuk debugging kritikal)
//   - Di development: full logging untuk debugging
//   - Konsisten kan pattern di seluruh app
//   - Cegah PII leak via console.log di production
//
// Usage:
//   import { log, warn, error } from '../lib/logger';
//
//   log('user logged in:', user.id);        // dev-only, ID only
//   warn('cart updated:', cart.length);      // dev-only, count only
//   error('fetch failed:', e?.message);      // always (string only)
//
// ⚠️ PENTING: JANGANG log object PII langsung (mis. user, order, customer).
//   Log hanya identifier (id, count, status) — bukan full object.
// ============================================================================

const isDev = import.meta.env?.DEV === true;

/**
 * Dev-only log. Skip di production.
 * Hanya log string/number/boolean — JANGAN log object yang mungkin contain PII.
 */
export function log(...args) {
  if (isDev) {
    console.log(...args);
  }
}

/**
 * Dev-only warn. Skip di production.
 */
export function warn(...args) {
  if (isDev) {
    console.warn(...args);
  }
}

/**
 * Error — selalu log (untuk debugging kritikal), tapi log hanya `.message`
 * supaya gak bocor stack trace / schema / internal paths ke production console.
 *
 * Untuk full error object di dev, pakai: errorDev('ctx:', err)
 */
export function error(...args) {
  // Sanitize: kalau arg adalah Error object, ambil .message saja
  const sanitized = args.map((arg) => {
    if (arg instanceof Error) return arg.message;
    if (arg && typeof arg === 'object' && arg.message) return arg.message;
    return arg;
  });
  console.error(...sanitized);
}

/**
 * Dev-only error — log full object untuk debugging di dev.
 * Skip di production supaya gak bocor internal details.
 */
export function errorDev(...args) {
  if (isDev) {
    console.error(...args);
  }
}

export default { log, warn, error, errorDev };
