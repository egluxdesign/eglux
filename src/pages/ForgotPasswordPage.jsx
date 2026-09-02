// src/pages/ForgotPasswordPage.jsx
// ============================================================================
// ForgotPasswordPage — User lupa password, minta reset link via email
// ============================================================================
//
// Flow:
//   1. User input email
//   2. Call supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })
//   3. Supabase kirim email (via Resend SMTP) berisi link ke /reset-password?token=xxx
//   4. Tampilkan success message (regardless of whether email exists — security best practice)
//
// Routing: /forgot-password (public)
//
// ⭐ FIX: Pakai VITE_APP_URL (bukan window.location.origin) supaya email link
//    mengarah ke production domain, bukan localhost
// ⭐ FIX: Tampilkan error sebenarnya (bukan generic "terjadi kesalahan")
//    supaya bisa debug
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [debugError, setDebugError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setDebugError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Email tidak valid');
      return;
    }

    setLoading(true);
    try {
      // ⭐ Pakai production URL supaya email link mengarah ke eglux.co.id
      // Bukan window.location.origin (yang return localhost saat develop)
      const appUrl = import.meta.env.VITE_APP_URL || 'https://eglux.co.id';
      const redirectUrl = `${appUrl}/reset-password`;
      console.log('[ForgotPassword] Redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: redirectUrl }
      );

      if (error) {
        // ⭐ Tampilkan error sebenarnya untuk debugging
        console.error('[ForgotPassword] Supabase error:', error);
        setDebugError(error.message || 'Unknown Supabase error');

        // Kalau error karena redirect URL belum di-whitelist
        if (error.message?.includes('redirect') || error.message?.includes('URL')) {
          setError('URL redirect belum dikonfigurasi. Hubungi admin untuk whitelist URL di Supabase Dashboard.');
        }
        // Kalau rate limited
        else if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
          setError('Terlalu banyak request. Tunggu 1 jam lalu coba lagi.');
        }
        // Kalau SMTP belum setup
        else if (error.message?.includes('smtp') || error.message?.includes('email')) {
          setError('Server email belum dikonfigurasi. Hubungi admin.');
        }
        // Default: tetap tampilkan success message (anti email enumeration)
        // TAPI simpan error untuk debug
        else {
          // Tetap tampilkan success message (anti email enumeration)
          setSent(true);
        }
      } else {
        // Success — tampilkan success message
        console.log('[ForgotPassword] Reset email sent successfully');
        setSent(true);
      }
    } catch (e) {
      // ⭐ Catch uncaught exceptions (network error, dll)
      console.error('[ForgotPassword] Uncaught error:', e);
      setError('Terjadi kesalahan. Coba lagi.');
      setDebugError(e?.message || 'Unknown error');
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
          {!sent ? (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Lupa Password?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Masukkan email akun Anda. Kami akan mengirim link untuk reset password ke email tersebut.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); setDebugError(''); }}
                    placeholder="email@eglux.co.id"
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
                    ⚠️ {error}
                    {debugError && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[0.65rem] text-red-400">Detail error (debug)</summary>
                        <p className="mt-1 text-[0.65rem] text-red-400 font-mono break-all">{debugError}</p>
                      </details>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-5 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
                >
                  {loading ? '⏳ Mengirim...' : '📨 Kirim Link Reset'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Cek Email Anda</h2>
              <p className="text-sm text-gray-500 mb-6">
                Kalau email <strong>{email}</strong> terdaftar di akun EGLUX, link reset password sudah kami kirim.
                Cek folder inbox (atau spam) untuk email dari <strong>noreply@eglux.co.id</strong>.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
                <p className="text-xs text-amber-700">
                  ⏱️ Link berlaku 1 jam. Kalau tidak kunjung menerima email dalam 5 menit, coba cek folder spam atau request ulang.
                </p>
              </div>
              <button
                onClick={() => { setSent(false); setEmail(''); setDebugError(''); }}
                className="text-sm text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
              >
                ← Coba email lain
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <Link to="/admin" className="text-sm text-gray-500 hover:text-gray-700">
              ← Kembali ke Login
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Belum punya akun? <Link to="/register" className="text-eglux-secondary font-semibold hover:underline">Daftar di sini</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;