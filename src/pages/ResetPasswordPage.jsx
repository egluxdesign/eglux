// src/pages/ResetPasswordPage.jsx
// ============================================================================
// ResetPasswordPage — Landing dari email reset link, input password baru
// ============================================================================
//
// Flow:
//   1. User klik link di email → redirect ke /reset-password#access_token=xxx
//   2. Supabase auto-handle token di URL hash → set session
//   3. Tampilkan form: new password + confirm
//   4. Call supabase.auth.updateUser({ password: newPassword })
//   5. Sign out (clear session) → redirect ke /login
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

  // ── Cek apakah session dari URL sudah ter-set ──
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error('[ResetPassword] Session error:', error);
          setError('Link reset tidak valid atau sudah expired. Silakan request link baru.');
        } else if (data.session) {
          setSessionReady(true);
        } else {
          setError('Link reset tidak valid. Pastikan Anda mengklik link dari email terbaru.');
        }
      } catch (e) {
        setError('Terjadi kesalahan saat verifikasi link.');
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();
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
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Link Tidak Valid</h2>
              <p className="text-sm text-gray-500 mb-6">{error}</p>
              <Link
                to="/forgot-password"
                className="inline-block px-5 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-bold hover:opacity-90"
              >
                Request Link Baru
              </Link>
            </div>
          ) : sessionReady ? (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Reset Password</h2>
              <p className="text-sm text-gray-500 mb-6">
                Masukkan password baru untuk akun Anda.
              </p>

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
      </div>
    </div>
  );
};

export default ResetPasswordPage;
