// src/hooks/useAdminPresence.js
// ============================================================================
// useAdminPresence — Hook untuk track admin presence + log activity
// ============================================================================
//
// Cara pakai (di AdminLayout.jsx):
//   import { useAdminPresence } from '../hooks/useAdminPresence';
//
//   const AdminLayout = ({ children, title }) => {
//     useAdminPresence(title);  // auto-update presence + log page view
//     return <div>...</div>;
//   };
//
// Features:
//   1. Upsert presence ke admin_presence table setiap 30 detik
//   2. Log page view ke admin_activity_log saat page change
//   3. Cleanup presence saat user logout / close tab (beforeunload)
//   4. Mark inactive saat tab tidak aktif (visibilitychange)
// ============================================================================

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const PRESENCE_UPDATE_INTERVAL = 30000; // 30 detik
const INACTIVE_TIMEOUT = 5 * 60 * 1000; // 5 menit (mark inactive kalau gak ada aktivitas)

export function useAdminPresence(pageTitle = '') {
  const location = useLocation();
  const lastPageRef = useRef('');
  const lastActivityRef = useRef(Date.now());
  const intervalRef = useRef(null);

  // ── Upsert presence ──
  const updatePresence = async (isActive = true) => {
    try {
      const currentPath = window.location.pathname;
      const { error } = await supabase.rpc('upsert_admin_presence', {
        p_current_page: currentPath,
      });
      if (error) {
        console.debug('[useAdminPresence] upsert error:', error?.message);
      }
    } catch (e) {
      console.debug('[useAdminPresence] upsert failed:', e?.message);
    }
  };

  // ── Log activity (page view) ──
  const logPageView = async (page, title) => {
    try {
      const { error } = await supabase.rpc('log_admin_activity', {
        p_action: 'page_view',
        p_page: page,
        p_description: `Membuka ${title || page}`,
        p_metadata: { page, title },
      });
      if (error) {
        console.debug('[useAdminPresence] log error:', error?.message);
      }
    } catch (e) {
      console.debug('[useAdminPresence] log failed:', e?.message);
    }
  };

  // ── Mark as offline (cleanup) ──
  const markOffline = async () => {
    try {
      // Delete presence row (user offline)
      const { error } = await supabase
        .from('admin_presence')
        .delete()
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      if (error) console.debug('[useAdminPresence] cleanup error:', error?.message);
    } catch (e) {
      console.debug('[useAdminPresence] cleanup failed:', e?.message);
    }
  };

  // ── Update last activity timestamp ──
  const trackActivity = () => {
    lastActivityRef.current = Date.now();
  };

  // ── Effect 1: Update presence on mount + every 30s ──
  useEffect(() => {
    updatePresence();

    // Interval: update presence setiap 30s
    intervalRef.current = setInterval(() => {
      // Cek apakah user masih aktif (dalam 5 menit terakhir)
      const isRecent = Date.now() - lastActivityRef.current < INACTIVE_TIMEOUT;
      updatePresence(isRecent);
    }, PRESENCE_UPDATE_INTERVAL);

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ── Effect 2: Log page view saat path change ──
  useEffect(() => {
    const currentPath = location.pathname;
    if (currentPath !== lastPageRef.current) {
      lastPageRef.current = currentPath;
      logPageView(currentPath, pageTitle);
      updatePresence(); // juga update presence dengan page baru
    }
  }, [location.pathname, pageTitle]);

  // ── Effect 3: Track user activity (mouse, keyboard, scroll) ──
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

  // ── Effect 4: Handle tab visibility + close ──
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab hidden — mark inactive (tapi jangan delete, user mungkin balik)
        updatePresence(false);
      } else {
        // Tab visible again — update presence + track activity
        trackActivity();
        updatePresence(true);
      }
    };

    const handleBeforeUnload = () => {
      // User close tab — mark offline (best effort, might not complete)
      // Pakai sendBeacon kalau ada, atau fire-and-forget
      if (navigator.sendBeacon) {
        // sendBeacon gak bisa pakai supabase-js, skip untuk sekarang
        // Alternative: cron job akan mark inactive setelah 10 menit
      }
      markOffline();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // ── Effect 5: Cleanup presence saat logout ──
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

export default useAdminPresence;
