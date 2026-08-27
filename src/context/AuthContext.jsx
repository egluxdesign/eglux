// src/context/AuthContext.jsx
// ============================================================================
// AuthContext — session management, role check, login/register/logout
// ============================================================================
// Provides:
//   - user: Supabase auth user object (null kalau belum login)
//   - role: 'team_dev' | 'master' | 'admin' | 'pro' | 'verified' | null
//   - profile: profiles row (full_name, phone, referral_code, dll)
//   - loading: true saat check session
//   - isAdmin: role IN ('team_dev', 'master', 'admin')
//   - isPro: role === 'pro'
//   - isGodMode: role === 'team_dev'
//   - login(email, password)
//   - register(email, password, fullName, phone, referralCode)
//   - logout()
//   - refreshProfile()
// ============================================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Derive role from user.raw_app_meta_data atau profile.role
  const role = user?.raw_app_meta_data?.role || profile?.role || null;

  const isAdmin = role ? ['team_dev', 'master', 'admin'].includes(role) : false;
  const isPro = role === 'pro';
  const isGodMode = role === 'team_dev';

  // ============================================================================
  // FETCH PROFILE
  // ============================================================================
  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[AuthContext] fetchProfile error:', error.message);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (e) {
      console.error('[AuthContext] fetchProfile exception:', e);
      setProfile(null);
    }
  }, []);

  // ============================================================================
  // INIT: check session on mount
  // ============================================================================
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted && session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        }
      } catch (e) {
        console.error('[AuthContext] init error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (mounted) {
          if (session?.user) {
            setUser(session.user);
            await fetchProfile(session.user.id);
          } else {
            setUser(null);
            setProfile(null);
          }
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // ============================================================================
  // LOGIN
  // ============================================================================
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      setUser(data.user);
      await fetchProfile(data.user.id);
    }

    return data;
  };

  // ============================================================================
  // REGISTER
  // ============================================================================
  const register = async (email, password, fullName, phone, referralCode, newsletterOptIn = { email: false, wa: false }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: phone,
          referral_code: referralCode || null,
        },
      },
    });

    if (error) throw error;

    // Kalau email confirmation OFF (sandbox), user langsung login
    if (data.user) {
      setUser(data.user);

      // ⭐ Retry loop: fetch profile sampai tersedia (max 5 attempts, 300ms interval)
      const maxAttempts = 5;
      const intervalMs = 300;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((r) => setTimeout(r, intervalMs));
        try {
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

          if (profileData) {
            setProfile(profileData);
            console.log(`[AuthContext] Profile fetched on attempt ${attempt}`);
            break;
          }
          if (attempt === maxAttempts) {
            console.warn(`[AuthContext] Profile not found after ${maxAttempts} attempts. Trigger may have failed.`);
          }
        } catch (e) {
          console.warn(`[AuthContext] Profile fetch attempt ${attempt} error:`, e.message);
        }
      }

      // ⭐ NEW: Subscribe newsletter kalau user opt-in
      // ⭐ CRITICAL: Fire-and-forget (NON-BLOCKING) — gak pakai await!
      // Kalau pakai await, fetch() yang hang/error akan block setSuccess(true) di RegisterPage
      if (newsletterOptIn.email || newsletterOptIn.wa) {
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

        // ⭐ Fire and forget — jangan await! Biar setSuccess(true) langsung jalan
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscribe-newsletter`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anonKey}`,
            'apikey': anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            phone,
            name: fullName,
            source: 'register',
            marketing_email_opt_in: newsletterOptIn.email,
            marketing_wa_opt_in: newsletterOptIn.wa,
            user_id: data.user?.id || null,
          }),
        }).then(resp => resp.json()).then(result => {
          if (!result.success) {
            console.warn('[AuthContext] Newsletter subscription failed:', result.error || result.message);
          }
        }).catch(err => {
          console.warn('[AuthContext] Newsletter opt-in error (non-blocking):', err?.message);
        });
        // ⭐ Gak ada await di sini — fetch jalan di background, register langsung return
      }

      // ⭐ NEW: Auto-add +20 register bonus points (fire-and-forget, non-blocking)
      // Pakai anon key + apikey header (sama seperti newsletter subscribe)
      const anonKey2 = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-register-bonus`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey2}`,
          'apikey': anonKey2,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: data.user.id }),
      }).then(resp => resp.json()).then(result => {
        if (!result.success) {
          console.warn('[AuthContext] Register bonus failed:', result.error);
        }
      }).catch(err => {
        console.warn('[AuthContext] Register bonus error (non-blocking):', err?.message);
      });
    }

    return data;
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================
  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  // ============================================================================
  // REFRESH PROFILE
  // ============================================================================
  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        isAdmin,
        isPro,
        isGodMode,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return ctx;
};

export default AuthContext;
