// src/hooks/useMidtransSnap.js
// ============================================================================
// useMidtransSnap — Dynamic load Midtrans Snap.js dengan client key yang benar
// ============================================================================
// ⭐ v3 FIX: 
//   1. Hardcode production mode (bypass VITE_MIDTRANS_IS_PRODUCTION env var)
//   2. Cleanup existing sandbox Snap.js script tag sebelum load production
//   3. Force reload Snap.js kalau existing script tag is from wrong domain
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
 * Remove existing Snap.js script tags (cleanup sandbox scripts)
 * Dipanggil sebelum load production Snap.js buat avoid conflict.
 */
function cleanupExistingSnapScripts() {
  const scripts = document.querySelectorAll('script[src*="midtrans.com/snap/snap.js"]');
  scripts.forEach((script) => {
    const src = script.getAttribute('src') || '';
    // Kalau existing script is from WRONG domain (sandbox vs production), remove it
    if (src.includes('sandbox') && !SNAP_JS_URL.includes('sandbox')) {
      console.warn('[useMidtransSnap] ⚠️ Found sandbox Snap.js script — removing it (switching to production)');
      script.remove();
      // Reset window.snap — bakal di-re-init oleh production Snap.js
      if (window.snap) {
        try {
          window.snap.reset && window.snap.reset();
        } catch (e) {
          // Ignore reset errors
        }
        delete window.snap;
      }
    } else if (!src.includes('sandbox') && SNAP_JS_URL.includes('sandbox')) {
      // Production script exists but we want sandbox — remove it
      console.warn('[useMidtransSnap] ⚠️ Found production Snap.js script — removing it (switching to sandbox)');
      script.remove();
      if (window.snap) {
        try {
          window.snap.reset && window.snap.reset();
        } catch (e) {}
        delete window.snap;
      }
    }
  });
}

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

    // ⭐ NEW: Cleanup existing sandbox/production Snap.js scripts kalau ada mismatch
    cleanupExistingSnapScripts();

    // Re-check after cleanup — maybe window.snap was reset
    if (window.snap && typeof window.snap.pay === 'function') {
      snapLoaded = true;
      resolve();
      return;
    }

    // Cek apakah ada script tag snap.js yang sudah ada (after cleanup)
    const existingScript = document.querySelector(
      `script[src*="midtrans.com/snap/snap.js"]`
    );

    if (existingScript) {
      // Verify existing script is from correct domain
      const src = existingScript.getAttribute('src') || '';
      const isCorrectDomain = src === SNAP_JS_URL ||
        (src.includes('app.midtrans.com') && SNAP_JS_URL.includes('app.midtrans.com')) ||
        (src.includes('sandbox') && SNAP_JS_URL.includes('sandbox'));

      if (isCorrectDomain) {
        // Script already exists from correct domain — wait for load
        existingScript.addEventListener('load', () => {
          if (window.snap && typeof window.snap.pay === 'function') {
            snapLoaded = true;
            console.log(
              `[useMidtransSnap] ✓ Snap.js loaded (${env.MIDTRANS_MODE_LABEL} mode)`
            );
            resolve();
          } else {
            const err = new Error('Snap.js loaded but window.snap.pay is not a function');
            snapLoadFailed = true;
            snapLoadError = err;
            console.error('[useMidtransSnap] Snap.js loaded but API missing');
            reject(err);
          }
        });
        existingScript.addEventListener('error', () => {
          const err = new Error('Snap.js script failed to load (network error)');
          snapLoadFailed = true;
          snapLoadError = err;
          console.error('[useMidtransSnap] Script load failed:', SNAP_JS_URL);
          reject(err);
        });
        return;
      } else {
        // Wrong domain — remove and create new
        console.warn('[useMidtransSnap] ⚠️ Existing Snap.js from wrong domain — replacing');
        existingScript.remove();
      }
    }

    // ⭐ Create new script tag with correct URL (production or sandbox)
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
          `[useMidtransSnap] ✓ Snap.js loaded (${env.MIDTRANS_MODE_LABEL} mode) | URL: ${SNAP_JS_URL}`
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
