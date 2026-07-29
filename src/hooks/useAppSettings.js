// src/hooks/useAppSettings.js
// ============================================================================
// useAppSettings — fetch & cache app-wide settings dari DB
// ============================================================================
//
// Settings yang di-fetch:
//   - tax_enabled (boolean) — aktif/nonaktifkan tax di checkout
//   - tax_percent (number)  — persentase tax (default 3)
//
// Caching strategy:
//   - In-memory cache (module-level) supaya semua instance hook share data
//   - TTL 60 detik — setelah itu, refetch saat hook dipakai lagi
//   - Fallback ke default { tax_enabled: true, tax_percent: 3 } kalau fetch gagal
//
// Usage:
//   const { settings, loading, refresh } = useAppSettings();
//   if (settings.tax_enabled) { ... hitung tax ... }
//
// Direct query ke Supabase (RLS allow anon SELECT di app_settings).
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_SETTINGS = {
  tax_enabled: true,
  tax_percent: 3,
};

// Module-level cache (shared across all hook instances)
let cachedSettings = null;
let cacheTimestamp = 0;
let inflightPromise = null;

const CACHE_TTL_MS = 60 * 1000; // 60 detik

const fetchSettings = async (force = false) => {
  const now = Date.now();
  const cacheFresh = cachedSettings && (now - cacheTimestamp < CACHE_TTL_MS);

  if (cacheFresh && !force) {
    return cachedSettings;
  }

  // Dedupe concurrent fetches
  if (inflightPromise && !force) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('tax_enabled, tax_percent, updated_at')
        .eq('id', 1)
        .maybeSingle();

      if (error || !data) {
        console.warn('[useAppSettings] fetch failed, using defaults:', error?.message);
        return DEFAULT_SETTINGS;
      }

      const settings = {
        tax_enabled: data.tax_enabled !== false, // defensive: undefined → true
        tax_percent: Number(data.tax_percent) || 0,
      };

      cachedSettings = settings;
      cacheTimestamp = Date.now();
      return settings;
    } catch (e) {
      console.error('[useAppSettings] error:', e);
      return DEFAULT_SETTINGS;
    } finally {
      inflightPromise = null;
    }
  })();

  return inflightPromise;
};

// ⭐ Public helper untuk invalidate cache (call after admin update settings)
export const invalidateAppSettingsCache = () => {
  cachedSettings = null;
  cacheTimestamp = 0;
};

export const useAppSettings = () => {
  const [settings, setSettings] = useState(cachedSettings || DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(!cachedSettings);

  const refresh = useCallback(async () => {
    setLoading(true);
    const fresh = await fetchSettings(true);
    setSettings(fresh);
    setLoading(false);
    return fresh;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await fetchSettings();
      if (mounted) {
        setSettings(s);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return { settings, loading, refresh };
};

export default useAppSettings;
