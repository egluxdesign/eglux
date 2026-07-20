// src/hooks/useMidtransSnap.js
// ============================================================================
// useMidtransSnap — Dynamic load Midtrans Snap.js dengan client key yang benar
// ============================================================================
//
// Kenapa dynamic load (bukan <script> di index.html)?
//   1. CSP issue: Static <script> tag dengan external src + data-client-key
//      bikin Safari CSP engine behave inconsistent. Dynamic createElement
//      lebih reliable.
//   2. Client key: %VITE_*% di index.html kadang gak ke-replace Vite.
//      Dynamic load pakai import.meta.env langsung — pasti benar.
//   3. Race condition: Snap.js load di <head> sebelum React mount →
//      window.snap bisa undefined saat checkout. Dynamic load pada saat
//      dibutuhkan saja.
//   4. Production switch: Sandbox vs production URL bisa switch otomatis
//      berdasarkan env var.
//
// ⭐ v2: Pakai centralized env dari src/lib/env.js (single source of truth).
//       Error message lebih actionable — kasih instruksi cara fix, bukan
//       "Midtrans client key not configured" yang mysterious.
//
// Pemakaian:
//   const { snapReady, loadError, reload } = useMidtransSnap();
//   if (snapReady) { window.snap.pay(token, callbacks); }
//   else { // fallback ke redirect mode }
//
//   // Atau Promise-based (di event handler, tanpa hook):
//   import { ensureSnapLoaded } from '../hooks/useMidtransSnap';
//   await ensureSnapLoaded();
//   window.snap.pay(token, callbacks);
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { env } from '../lib/env';

// Snap.js URL + client key dari centralized env (sudah validated di startup)
const SNAP_JS_URL = env.MIDTRANS_SNAP_JS_URL;
const CLIENT_KEY = env.MIDTRANS_CLIENT_KEY;
const IS_PRODUCTION = env.MIDTRANS_IS_PRODUCTION;

// Singleton: track apakah snap.js sudah di-load (global, bukan per-component)
let snapLoadPromise = null;
let snapLoaded = false;
let snapLoadFailed = false;
let snapLoadError = null;

/**
 * Load Snap.js dynamically dengan client key yang benar.
 * Return Promise yang resolve saat snap.js siap.
 */
function loadSnapScript() {
  // Kalau sudah loaded, return immediately
  if (snapLoaded && window.snap && typeof window.snap.pay === 'function') {
    return Promise.resolve();
  }

  // Kalau lagi loading, return promise yang sama (dedup)
  if (snapLoadPromise) {
    return snapLoadPromise;
  }

  // Kalau sudah gagal sebelumnya, return rejected dengan error yang sama
  if (snapLoadFailed && snapLoadError) {
    return Promise.reject(snapLoadError);
  }

  snapLoadPromise = new Promise((resolve, reject) => {
    // ── Pre-flight check: client key ──
    if (!CLIENT_KEY) {
      const err = new Error(
        'VITE_MIDTRANS_CLIENT_KEY belum di-set di file .env. ' +
        'Copy .env.example ke .env lalu isi Client Key dari Midtrans Dashboard → Settings → Access Keys.'
      );
      snapLoadFailed = true;
      snapLoadError = err;
      console.error('[useMidtransSnap] Missing VITE_MIDTRANS_CLIENT_KEY');
      reject(err);
      return;
    }

    // Cek apakah snap.js sudah ada (mungkin di-load dari tempat lain)
    if (window.snap && typeof window.snap.pay === 'function') {
      snapLoaded = true;
      resolve();
      return;
    }

    // Cek apakah ada script tag snap.js yang sudah ada
    const existingScript = document.querySelector(
      `script[src*="midtrans.com/snap/snap.js"]`
    );

    if (existingScript) {
      // Script sudah ada tapi snap belum ready — mungkin masih loading
      existingScript.addEventListener('load', () => {
        if (window.snap && typeof window.snap.pay === 'function') {
          snapLoaded = true;
          resolve();
        } else {
          const err = new Error('Snap.js loaded but window.snap.pay is not a function');
          snapLoadFailed = true;
          snapLoadError = err;
          reject(err);
        }
      });
      existingScript.addEventListener('error', () => {
        const err = new Error('Snap.js script failed to load (network error)');
        snapLoadFailed = true;
        snapLoadError = err;
        reject(err);
      });
      return;
    }

    // Dynamic create script tag dengan client key yang benar
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = SNAP_JS_URL;
    script.setAttribute('data-client-key', CLIENT_KEY);
    script.async = true;

    script.onload = () => {
      // Verify snap object tersedia
      if (window.snap && typeof window.snap.pay === 'function') {
        snapLoaded = true;
        console.log(
          `[useMidtransSnap] ✓ Snap.js loaded (${env.MIDTRANS_MODE_LABEL} mode)`
        );
        resolve();
      } else {
        const err = new Error(
          'Snap.js script loaded but window.snap API not available. ' +
          'Kemungkinan client key salah atau akun Midtrans bermasalah.'
        );
        snapLoadFailed = true;
        snapLoadError = err;
        console.error('[useMidtransSnap] Snap.js loaded but API missing');
        reject(err);
      }
    };

    script.onerror = () => {
      const err = new Error(
        `Gagal load Snap.js dari ${SNAP_JS_URL}. ` +
        'Cek koneksi internet atau firewall yang mungkin block domain midtrans.com.'
      );
      snapLoadFailed = true;
      snapLoadError = err;
      console.error('[useMidtransSnap] Script load failed:', SNAP_JS_URL);
      reject(err);
    };

    document.head.appendChild(script);
  });

  return snapLoadPromise;
}

/**
 * Helper: ensureSnapLoaded() — Promise-based, bisa dipanggil di luar hook
 * (mis. di event handler click tanpa useEffect)
 *
 * Returns: Promise<void> yang resolve saat window.snap.pay siap
 */
export function ensureSnapLoaded() {
  return loadSnapScript();
}

/**
 * Hook: useMidtransSnap
 *
 * Returns:
 *   - snapReady: boolean — true kalau window.snap.pay tersedia
 *   - loadError: string | null — error message kalau load gagal
 *   - reload: function — retry load (reset failed state)
 */
export function useMidtransSnap() {
  const [snapReady, setSnapReady] = useState(
    snapLoaded && window.snap && typeof window.snap.pay === 'function'
  );
  const [loadError, setLoadError] = useState(
    snapLoadFailed ? snapLoadError?.message : null
  );

  useEffect(() => {
    let mounted = true;

    // Kalau sudah ready, skip
    if (snapReady) return;

    loadSnapScript()
      .then(() => {
        if (mounted) {
          setSnapReady(true);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setSnapReady(false);
          setLoadError(err.message);
          console.warn('[useMidtransSnap] Load failed:', err.message);
        }
      });

    return () => {
      mounted = false;
    };
  }, [snapReady]);

  const reload = useCallback(() => {
    snapLoadFailed = false;
    snapLoadPromise = null;
    snapLoadError = null;
    setSnapReady(false);
    setLoadError(null);
  }, []);

  return { snapReady, loadError, reload };
}

export default useMidtransSnap;
