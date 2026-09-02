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
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !email.includes('@')) {
      setError('Email tidak valid');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        const appUrl = import.meta.env.VITE_APP_URL || 'https://eglux.co.id';
        redirectTo: `${appUrl}/reset-password`,
      });

      if (error) {
        // Jangan expose apakah email ada atau tidak (security)
        // Tetap tampilkan success message
        console.warn('[ForgotPassword] Error (masked):', error.message);
      }

      // Selalu tampilkan success message (anti email enumeration)
      setSent(true);
    } catch (e) {
      setError('Terjadi kesalahan. Coba lagi.');
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
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="email@eglux.co.id"
                    autoFocus
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                  />
                </div>

                {error && <p className="text-xs text-red-500">⚠️ {error}</p>}

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
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-sm text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
              >
                ← Coba email lain
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
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
