// src/hooks/useUserActivity.js
// ============================================================================
// useUserActivity — Hook untuk track aktivitas customer di storefront
// ============================================================================
//
// Cara pakai (di storefront layout — Header.jsx atau App.jsx):
//   import { useUserActivity } from '../hooks/useUserActivity';
//
//   const Header = () => {
//     useUserActivity();  // auto-track page view + presence
//     return <nav>...</nav>;
//   };
//
// Atau panggil manual untuk track event spesifik:
//   import { logUserEvent } from '../hooks/useUserActivity';
//
//   // Di cart page saat user add to cart
//   logUserEvent('add_to_cart', '/cart', `Add: ${productName}`, { product_id, quantity });
//
//   // Di search
//   logUserEvent('search', '/products', `Search: ${query}`, { query });
//
//   // Di checkout
//   logUserEvent('checkout', '/checkout', `Checkout: ${orderCount} items`, { total_amount });
//
// Features:
//   1. Upsert presence ke user_presence setiap 30 detik
//   2. Log page view ke user_activity_log saat path change
//   3. Cleanup presence saat user logout / close tab
//   4. Mark inactive saat tab tidak aktif
// ============================================================================

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const PRESENCE_UPDATE_INTERVAL = 30000; // 30 detik
const INACTIVE_TIMEOUT = 10 * 60 * 1000; // 10 menit

// ── Helper: log event ke user_activity_log (fire-and-forget) ──
export async function logUserEvent(action, page = null, description = null, metadata = null) {
  try {
    const { error } = await supabase.rpc('log_user_activity', {
      p_action: action,
      p_page: page,
      p_description: description,
      p_metadata: metadata,
    });
    if (error) {
      console.debug('[useUserActivity] log error:', error?.message);
    }
  } catch (e) {
    console.debug('[useUserActivity] log failed:', e?.message);
  }
}

// ── Helper: upsert presence ──
async function updatePresence(isActive = true) {
  try {
    const { error } = await supabase.rpc('upsert_user_presence', {
      p_current_page: window.location.pathname,
    });
    if (error) {
      console.debug('[useUserActivity] upsert error:', error?.message);
    }
  } catch (e) {
    console.debug('[useUserActivity] upsert failed:', e?.message);
  }
}

// ── Helper: mark offline (cleanup) ──
async function markOffline() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('user_presence')
      .delete()
      .eq('user_id', user.id);
    if (error) console.debug('[useUserActivity] cleanup error:', error?.message);
  } catch (e) {
    console.debug('[useUserActivity] cleanup failed:', e?.message);
  }
}

// ── Main hook ──
export function useUserActivity() {
  const location = useLocation();
  const lastPageRef = useRef('');
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef(null);

  // Track user activity (mouse, keyboard, scroll)
  const trackActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // Effect 1: Update presence on mount + every 30s
  useEffect(() => {
    updatePresence();

    intervalRef.current = setInterval(() => {
      const isRecent = Date.now() - lastActivityRef.current < INACTIVE_TIMEOUT;
      updatePresence(isRecent);
    }, PRESENCE_UPDATE_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Effect 2: Log page view saat path change
  useEffect(() => {
    const currentPath = location.pathname;

    // Skip logging untuk admin pages (admin punya own tracking via useAdminPresence)
    if (currentPath.startsWith('/dashboard-admin') ||
        currentPath.startsWith('/products-admin') ||
        currentPath.startsWith('/orders-admin') ||
        currentPath.startsWith('/discount-admin') ||
        currentPath.startsWith('/points-admin') ||
        currentPath.startsWith('/users-admin') ||
        currentPath.startsWith('/homepage-admin') ||
        currentPath.startsWith('/blog-admin') ||
        currentPath.startsWith('/about-admin') ||
        currentPath.startsWith('/contact-admin') ||
        currentPath.startsWith('/reviews-admin')) {
      return;
    }

    if (currentPath !== lastPageRef.current) {
      lastPageRef.current = currentPath;

      // Determine page type for description
      let pageType = 'page_view';
      let description = `Mengunjungi ${currentPath}`;

      if (currentPath === '/' || currentPath === '/home') {
        description = 'Mengunjungi beranda';
      } else if (currentPath.startsWith('/product')) {
        pageType = 'product_view';
        description = `Lihat produk: ${currentPath}`;
      } else if (currentPath === '/cart') {
        pageType = 'cart_view';
        description = 'Membuka keranjang';
      } else if (currentPath === '/checkout') {
        pageType = 'checkout_view';
        description = 'Membuka halaman checkout';
      } else if (currentPath === '/orders') {
        pageType = 'orders_view';
        description = 'Lihat daftar pesanan';
      } else if (currentPath === '/track') {
        pageType = 'track_view';
        description = 'Lacak pesanan';
      } else if (currentPath === '/profile') {
        pageType = 'profile_view';
        description = 'Buka profil';
      } else if (currentPath === '/rewards') {
        pageType = 'rewards_view';
        description = 'Lihat poin & rewards';
      } else if (currentPath === '/membership') {
        pageType = 'membership_view';
        description = 'Lihat membership';
      } else if (currentPath === '/blog') {
        pageType = 'blog_view';
        description = 'Baca blog';
      }

      logUserEvent(pageType, currentPath, description, { path: currentPath });
      updatePresence();
    }
  }, [location.pathname]);

  // Effect 3: Track user activity (mouse, keyboard, scroll)
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];

    events.forEach((event) => {
      document.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, trackActivity);
      });
    };
  }, []);

  // Effect 4: Handle tab visibility + close
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence(false);
      } else {
        trackActivity();
        updatePresence(true);
      }
    };

    const handleBeforeUnload = () => {
      markOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Effect 5: Cleanup presence saat logout
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        markOffline();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);
}

export default useUserActivity;
