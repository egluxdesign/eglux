// src/pages/ResetPasswordPage.jsx
// ============================================================================
// ResetPasswordPage v2 — Landing dari email reset link, input password baru
// ============================================================================
//
// Flow:
//   1. User klik link di email → redirect ke /reset-password#access_token=xxx
//   2. Supabase auto-handle token di URL hash → fire PASSWORD_RECOVERY event
//   3. Tampilkan form: new password + confirm
//   4. Call supabase.auth.updateUser({ password: newPassword })
//   5. Sign out (clear session) → redirect ke /login
//
// v2 CHANGES (fix "link tidak valid"):
//   - Pakai onAuthStateChange listener (lebih reliable dari getSession)
//   - Listen event PASSWORD_RECOVERY (fired saat Supabase parse URL hash)
//   - Timeout 10 detik (sebelumnya langsung error kalau session belum ready)
//   - Better error messages dengan saran solusi
//   - Handle edge case: user buka link di domain yang beda
//   - Auto-detect email dari session → tampilkan "untuk email: xxx"
//
// Routing: /reset-password (public, handle session from URL)
// ============================================================================

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  // ── Cek apakah session dari URL sudah ter-set ──
  // v2: Pakai onAuthStateChange + getSession (dual approach) untuk reliability
  useEffect(() => {
    let timeout;
    let resolved = false;

    const handleSession = (session, event = null) => {
      if (resolved) return;
      resolved = true;
      setCheckingSession(false);

      if (session) {
        setSessionReady(true);
        setUserEmail(session.user?.email || '');
        console.log('[ResetPassword] ✓ Session ready for:', session.user?.email);
      } else {
        // Session tidak ada → link tidak valid
        const url = window.location.href;
        const hasHash = url.includes('#access_token=');

        if (hasHash) {
          // URL punya access_token tapi session gak ke-set → mungkin expired atau invalid
          setError('Link reset sudah expired atau tidak valid. Token mungkin sudah dipakai sebelumnya. Silakan request link baru.');
        } else {
          // URL gak punya access_token → user buka halaman ini tanpa dari email link
          setError('Halaman ini hanya bisa diakses melalui link reset yang dikirim ke email Anda. Silakan request link reset terlebih dahulu.');
        }
        console.warn('[ResetPassword] No session. Event:', event, 'URL hash:', hasHash);
      }
    };

    // ⭐ Approach 1: Coba getSession langsung (kadang sudah ready)
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[ResetPassword] Session error:', error);
        }
        if (data?.session) {
          handleSession(data.session, 'getSession');
        }
        // Kalau belum ada session, jangan error dulu — tunggu onAuthStateChange
      } catch (e) {
        console.error('[ResetPassword] getSession exception:', e);
      }
    };

    // ⭐ Approach 2: Listen PASSWORD_RECOVERY event (fired saat Supabase parse URL hash)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[ResetPassword] Auth event:', event);
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        handleSession(session, event);
      }
    });

    checkSession();

    // ⭐ Timeout: kalau 10 detik gak ada session → show error (bukan 0 detik)
    timeout = setTimeout(() => {
      if (!resolved) {
        handleSession(null, 'timeout');
      }
    }, 10000);

    return () => {
      if (timeout) clearTimeout(timeout);
      if (sub?.subscription) sub.subscription.unsubscribe();
    };
  }, []);

  // ── Submit new password ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message || 'Gagal reset password');
        return;
      }

      // Success — sign out + redirect to login
      await supabase.auth.signOut();
      alert('✅ Password berhasil direset. Silakan login dengan password baru.');
      navigate('/login', { replace: true });
    } catch (e) {
      setError('Terjadi kesalahan: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Request link baru ──
  const handleRequestNewLink = () => {
    navigate('/forgot-password', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/">
            <h1 className="text-2xl font-bold text-eglux-primary tracking-wider">EGLUX</h1>
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 md:p-8">
          {checkingSession ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-500">Memverifikasi link reset...</p>
              <p className="text-[0.65rem] text-gray-400 mt-2">Mohon tunggu sebentar</p>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Link Tidak Valid</h2>
              <p className="text-sm text-gray-500 mb-4">{error}</p>

              {/* Tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">💡 Tips:</p>
                <ul className="text-[0.7rem] text-amber-600 space-y-1 list-disc list-inside">
                  <li>Pastikan Anda klik link dari email terbaru</li>
                  <li>Link hanya berlaku 1 jam sejak dikirim</li>
                  <li>Link hanya bisa dipakai 1 kali</li>
                  <li>Pastikan domain di browser sesuai (eglux.co.id)</li>
                </ul>
              </div>

              <button
                onClick={handleRequestNewLink}
                className="inline-block px-5 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-bold hover:opacity-90 cursor-pointer border-none"
              >
                📨 Request Link Baru
              </button>
            </div>
          ) : sessionReady ? (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Reset Password</h2>
              <p className="text-sm text-gray-500 mb-2">
                Masukkan password baru untuk akun Anda.
              </p>
              {userEmail && (
                <p className="text-xs text-gray-400 mb-6">
                  Untuk email: <strong>{userEmail}</strong>
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Password Baru</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                    placeholder="Minimal 8 karakter"
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Konfirmasi Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Ulangi password baru"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                  />
                </div>

                {error && <p className="text-xs text-red-500">⚠️ {error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-5 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
                >
                  {loading ? '⏳ Mereset...' : '🔑 Reset Password'}
                </button>
              </form>
            </>
          ) : null}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100 text-center">
          <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
            ← Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
