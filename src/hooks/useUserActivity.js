// src/hooks/useUserActivity.js
// ============================================================================
// useUserActivity v1.2 — Hook untuk track aktivitas customer di storefront
// ============================================================================
// v1.2: Added page_views tracking (for Visitor Analytics + Traffic Sources)
//       - Track ALL visitors (anonymous + logged in) to page_views table
//       - Track logged in users to user_activity_log + user_presence
//
// Cara pakai (di App.jsx, dalam BrowserRouter):
//   import { useUserActivity } from './hooks/useUserActivity';
//   const StorefrontActivityTracker = () => { useUserActivity(); return null; };
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const PRESENCE_UPDATE_INTERVAL = 30000; // 30 detik
const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 menit
const HOOK_VERSION = '1.2';

// ── Session ID helper (untuk anonymous visitors) ──
let sessionIdCache = null;
function getSessionId() {
  if (sessionIdCache) return sessionIdCache;
  try {
    sessionIdCache = sessionStorage.getItem('eglux_session_id');
    if (!sessionIdCache) {
      sessionIdCache = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('eglux_session_id', sessionIdCache);
    }
  } catch {
    sessionIdCache = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return sessionIdCache;
}

// ── Helper: Insert ke page_views table (untuk ALL visitors) ──
async function trackPageViewInsert(pagePath, pageType) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('page_views').insert({
      user_id: user?.id || null,
      session_id: getSessionId(),
      page_path: pagePath,
      page_type: pageType,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    });
    console.log('[useUserActivity] -> page_views:', pagePath, '(' + pageType + ')');
  } catch (e) {
    console.debug('[useUserActivity] page_views insert failed:', e?.message);
  }
}

// ── Helper: log event ke user_activity_log (untuk logged in users) ──
export async function logUserEvent(action, page = null, description = null, metadata = null) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc('log_user_activity', {
      p_action: action,
      p_page: page,
      p_description: description,
      p_metadata: metadata,
    });
    if (error) {
      console.log('[useUserActivity] log error:', error?.message);
    } else {
      console.log('[useUserActivity] -> user_activity_log:', action, page);
    }
  } catch (e) {
    console.debug('[useUserActivity] log failed:', e?.message);
  }
}

// ── Helper: upsert presence (logged in users only) ──
async function updatePresence(isActive = true) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc('upsert_user_presence', {
      p_current_page: window.location.pathname,
    });
    if (error) {
      console.debug('[useUserActivity] presence error:', error?.message);
    }
  } catch (e) {
    console.debug('[useUserActivity] presence failed:', e?.message);
  }
}

// ── Helper: mark offline ──
async function markOffline() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('user_presence').delete().eq('user_id', user.id);
    console.log('[useUserActivity] marked offline:', user.email);
  } catch (e) {
    console.debug('[useUserActivity] cleanup failed:', e?.message);
  }
}

// ── Determine page type from path ──
function getPageType(path) {
  if (path === '/' || path === '/home') return 'home';
  if (path.startsWith('/product')) return 'product';
  if (path.startsWith('/category')) return 'category';
  if (path === '/cart') return 'cart';
  if (path === '/checkout') return 'checkout';
  if (path === '/orders') return 'orders';
  if (path === '/track') return 'track';
  if (path === '/profile') return 'profile';
  if (path === '/rewards') return 'rewards';
  if (path === '/membership') return 'membership';
  if (path === '/blog') return 'blog';
  return 'other';
}

// ── Check if path is admin page (skip tracking) ──
function isAdminPage(path) {
  return path.startsWith('/dashboard-admin') ||
    path.startsWith('/products-admin') ||
    path.startsWith('/orders-admin') ||
    path.startsWith('/discount-admin') ||
    path.startsWith('/points-admin') ||
    path.startsWith('/users-admin') ||
    path.startsWith('/homepage-admin') ||
    path.startsWith('/blog-admin') ||
    path.startsWith('/about-admin') ||
    path.startsWith('/contact-admin') ||
    path.startsWith('/reviews-admin') ||
    path.startsWith('/admin');
}

// ── Main hook ──
export function useUserActivity() {
  const location = useLocation();
  const lastPageRef = useRef('');
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef(null);
  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);

  const trackActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // ── Effect 0: Wait for auth ready ──
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!mounted) return;
        if (user) {
          setUserId(user.id);
          setAuthReady(true);
          // console.log(`[useUserActivity] v${HOOK_VERSION} Auth ready: ${user.email}`);
        } else {
          // console.log(`[useUserActivity] v${HOOK_VERSION} Anonymous visitor (no login)`);
          const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (!mounted) return;
            if (event === 'SIGNED_IN' && session?.user) {
              setUserId(session.user.id);
              setAuthReady(true);
              // console.log(`[useUserActivity] User signed in: ${session.user.email}`);
            } else if (event === 'SIGNED_OUT') {
              setUserId(null);
              setAuthReady(false);
            }
          });
          return () => { authListener.subscription.unsubscribe(); };
        }
      } catch (e) {
        console.debug(`[useUserActivity] Auth check failed:`, e?.message);
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, []);

  // ── Effect 1: Track page_views untuk SEMUA visitors (anon + login) ──
  // Ini dipakai untuk Visitor Analytics + Traffic Sources dashboard
  useEffect(() => {
    const currentPath = location.pathname;

    // Skip admin pages
    if (isAdminPage(currentPath)) return;

    if (currentPath !== lastPageRef.current) {
      lastPageRef.current = currentPath;
      const pageType = getPageType(currentPath);

      // Insert ke page_views table (untuk ALL visitors)
      trackPageViewInsert(currentPath, pageType);

      // Kalau user login, juga log ke user_activity_log + update presence
      if (authReady && userId) {
        const description = `Mengunjungi ${currentPath}`;
        logUserEvent(pageType, currentPath, description, { path: currentPath });
        updatePresence();
      }
    }
  }, [location.pathname, authReady, userId]);

  // ── Effect 2: Update presence every 30s (logged in only) ──
  useEffect(() => {
    if (!authReady || !userId) return;

    updatePresence();
    intervalRef.current = setInterval(() => {
      const isRecent = Date.now() - lastActivityRef.current < INACTIVE_TIMEOUT;
      updatePresence(isRecent);
    }, PRESENCE_UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [authReady, userId]);

  // ── Effect 3: Track user activity (mouse, keyboard, scroll) ──
  useEffect(() => {
    if (!authReady) return;
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => {
      document.addEventListener(event, trackActivity, { passive: true });
    });
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, trackActivity);
      });
    };
  }, [authReady]);

  // ── Effect 4: Handle tab visibility + close ──
  useEffect(() => {
    if (!authReady) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence(false);
      } else {
        trackActivity();
        updatePresence(true);
      }
    };
    const handleBeforeUnload = () => { markOffline(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [authReady]);

  // ── Effect 5: Cleanup presence saat logout ──
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        markOffline();
        setUserId(null);
        setAuthReady(false);
      }
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, []);
}

export default useUserActivity;