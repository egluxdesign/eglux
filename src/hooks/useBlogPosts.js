// src/hooks/useBlogPosts.js
import { useState, useEffect, useRef } from 'react';

const VITE_GAS_URL_BLOG =
  'https://script.google.com/macros/s/AKfycbwBlQNMHmZRoiDaLA1cznf9CClcDeHg5gzfQLWV13qP7JYrIi428nT_PDgjzSzs8SebdQ/exec';

const CACHE_KEY = 'eglux_blog_posts';
const CACHE_TTL = 30 * 60 * 1000; // 30 menit

// ── Cache helpers (localStorage) ─────────────────────────────────────────────
function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getStaleCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
  } catch { /* storage penuh */ }
}

// ── Fetch dengan retry exponential backoff ───────────────────────────────────
async function fetchWithRetry(url, { maxRetries = 3, baseDelay = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        const delay = baseDelay * Math.pow(2, attempt);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error('429');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.message === '429' && attempt < maxRetries) continue;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useBlogPosts() {
  const [posts, setPosts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const didRunRef             = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    async function load() {
      const cached = getCache();
      if (cached) {
        setPosts(cached.data);
        setLoading(false);
        return;
      }

      try {
        const json = await fetchWithRetry(VITE_GAS_URL_BLOG);
        if (json.status === 'success' && json.data?.length > 0) {
          setCache(json.data);
          setPosts(json.data);
        } else {
          setPosts([]);
        }
      } catch (err) {
        const stale = getStaleCache();
        if (stale?.data?.length > 0) {
          setPosts(stale.data);
        } else {
          setError(
            err.message === '429'
              ? 'Server sedang sibuk. Coba refresh halaman dalam beberapa menit.'
              : `Gagal memuat artikel: ${err.message}`
          );
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { posts, loading, error };
}