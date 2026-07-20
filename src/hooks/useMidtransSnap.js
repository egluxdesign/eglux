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
// Pemakaian:
//   const { snapReady, loadError, reload } = useMidtransSnap();
//   if (snapReady) { window.snap.pay(token, callbacks); }
//   else { // fallback ke redirect mode }
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

// Snap.js URL — sandbox atau production
const SNAP_JS_URL = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true'
  ? 'https://app.midtrans.com/snap/snap.js'
  : 'https://app.sandbox.midtrans.com/snap/snap.js';

// Client key dari env var
const CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;

// Singleton: track apakah snap.js sudah di-load (global, bukan per-component)
let snapLoadPromise = null;
let snapLoaded = false;
let snapLoadFailed = false;

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

  // Kalau sudah gagal sebelumnya, return rejected
  if (snapLoadFailed) {
    return Promise.reject(new Error('Snap.js previously failed to load'));
  }

  snapLoadPromise = new Promise((resolve, reject) => {
    // Cek apakah snap.js sudah ada (mungkin di-load dari index.html)
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
      // Tunggu sampai load
      existingScript.addEventListener('load', () => {
        if (window.snap && typeof window.snap.pay === 'function') {
          snapLoaded = true;
          resolve();
        } else {
          snapLoadFailed = true;
          reject(new Error('Snap.js loaded but window.snap.pay is not a function'));
        }
      });
      existingScript.addEventListener('error', () => {
        snapLoadFailed = true;
        reject(new Error('Snap.js script failed to load'));
      });
      return;
    }

    // Dynamic create script tag dengan client key yang benar
    if (!CLIENT_KEY) {
      console.error('[useMidtransSnap] VITE_MIDTRANS_CLIENT_KEY not set in .env');
      snapLoadFailed = true;
      reject(new Error('Midtrans client key not configured'));
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = SNAP_JS_URL;
    script.setAttribute('data-client-key', CLIENT_KEY);
    script.async = true;

    script.onload = () => {
      // Verify snap object tersedia
      if (window.snap && typeof window.snap.pay === 'function') {
        snapLoaded = true;
        console.log('[useMidtransSnap] ✓ Snap.js loaded successfully');
        resolve();
      } else {
        snapLoadFailed = true;
        console.error('[useMidtransSnap] Snap.js loaded but window.snap.pay missing');
        reject(new Error('Snap.js loaded but API not available'));
      }
    };

    script.onerror = () => {
      snapLoadFailed = true;
      console.error('[useMidtransSnap] Failed to load Snap.js script');
      reject(new Error('Failed to load Snap.js from Midtrans CDN'));
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
  const [loadError, setLoadError] = useState(null);

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
    setSnapReady(false);
    setLoadError(null);
  }, []);

  return { snapReady, loadError, reload };
}

export default useMidtransSnap;
