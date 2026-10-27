// src/pages/AdminPage.jsx
// ============================================================================
// AdminPage — halaman login EGLUX (full-page version, route /admin)
// ============================================================================
// Perilaku:
//   - User belum login → render LoginForm (Email atau WhatsApp OTP).
//   - User sudah login → redirect ke page asal (atau / untuk customer,
//     /dashboard-admin untuk admin).
//
// LoginForm punya 2 metode login (tab toggle di atas form):
//   - Via Email   → email + password (existing flow, supabase.auth.signInWithPassword)
//   - Via WhatsApp → 6-digit OTP via WABA Qiscus
//                   → invoke send-waba-otp edge function (kirim kode)
//                   → invoke verify-waba-otp edge function (verifikasi + magic link)
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { invokeEdgeFunction } from '../lib/wabaOtpClient';

// ============================================================================
// OTPInput — 6 separate input boxes untuk kode OTP
// Features:
//   - Auto-focus ke box berikutnya saat 1 digit diisi
//   - Backspace di empty box → focus ke box sebelumnya + hapus isinya
//   - Arrow Left/Right navigation antar box
//   - Paste 6-digit code → auto-fill semua box + focus ke box kosong berikutnya
//   - Numeric only (filter non-digit saat paste/type)
// ============================================================================
const OTPInput = ({ value, onChange, disabled }) => {
  const refs = useRef([]);

  const handleChange = (idx, val) => {
    // Ambil hanya 1 digit terakhir (kalau user ketik "12" di 1 box, ambil "2")
    const digit = val.replace(/\D/g, '').slice(-1);
    if (digit === '' && val !== '') return; // ada char non-digit, tolak

    const next = [...value];
    next[idx] = digit;
    onChange(next);

    // Auto-focus ke box berikutnya kalau baru diisi
    if (digit && idx < 5) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      // Backspace di box kosong → focus ke box sebelumnya + hapus isinya
      e.preventDefault();
      const next = [...value];
      next[idx - 1] = '';
      onChange(next);
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;

    const next = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    onChange(next);

    // Focus ke box kosong berikutnya atau box terakhir
    const focusIdx = Math.min(pasted.length, 5);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex gap-2 justify-between" onPaste={handlePaste}>
      {value.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => (refs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          disabled={disabled}
          autoComplete="one-time-code"
          aria-label={`Digit OTP ${idx + 1}`}
          className="w-[44px] h-[52px] text-center text-[1.25rem] font-bold text-eglux-primary
                     border-[1.5px] border-[#ddd] rounded-[10px] bg-white outline-none
                     focus:border-eglux-secondary focus:ring-2 focus:ring-eglux-secondary/20
                     transition-all disabled:bg-gray-50 disabled:cursor-not-allowed"
        />
      ))}
    </div>
  );
};

// ============================================================================
// LoginForm — main component (Email or WhatsApp OTP)
// ============================================================================
const LoginForm = () => {
  // Top-level: pilih metode login
  const [loginMethod, setLoginMethod] = useState('email'); // 'email' | 'whatsapp'

  // Email login form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(''); // success/info message (green box)
  const [showPassword, setShowPassword] = useState(false);

  // WhatsApp OTP fields
  const [waPhone, setWaPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const countdownRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  // === Cleanup countdown on unmount ===
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // === Reset WhatsApp state when switching to email method ===
  const resetWhatsAppState = () => {
    setWaPhone('');
    setOtp(['', '', '', '', '', '']);
    setOtpSent(false);
    setSendingOtp(false);
    setVerifyingOtp(false);
    setCountdown(0);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  useEffect(() => {
    if (loginMethod !== 'whatsapp') {
      resetWhatsAppState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginMethod]);

  // === Countdown timer management ===
  const startCountdown = (seconds) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(seconds);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  // ============================================================================
  // WHATSAPP OTP HANDLERS
  // ============================================================================
  const handleSendOTP = async () => {
    setError('');
    setInfo('');

    // Basic validation — accept 08xxx, +62xxx, 628xxx, atau format spasi/dash
    const digits = waPhone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) {
      setError('Masukkan nomor WhatsApp yang valid (contoh: 0812 3456 7890 atau +62 812 3456 7890).');
      return;
    }

    setSendingOtp(true);
    try {
      const data = await invokeEdgeFunction('send-waba-otp', { phone: waPhone });
      // Kalau sampai sini, data.success === true (kalo gagal udah throw di helper)
      setOtpSent(true);
      setInfo(data.message || 'Kode OTP telah dikirim ke WhatsApp Anda.');
      setOtp(['', '', '', '', '', '']);
      startCountdown(60);
      // Auto-focus ke box OTP pertama (sedikit delay biar render dulu)
      setTimeout(() => {
        const firstBox = document.querySelector('input[aria-label="Digit OTP 1"]');
        if (firstBox) firstBox.focus();
      }, 100);
    } catch (err) {
      console.error('[Login] send-waba-otp error:', err);
      // err.message sekarang berisi error asli dari edge function + hint suffix
      setError(err.message || 'Gagal mengirim kode OTP. Coba lagi.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError('');
    setInfo('');

    const code = otp.join('');
    if (code.length !== 6) {
      setError('Masukkan 6 digit kode OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const data = await invokeEdgeFunction('verify-waba-otp', {
        phone: waPhone,
        code,
      });

      // Kalau sampai sini, data.success === true (kalo gagal udah throw di helper)
      if (data.redirect_url) {
        // Magic link — redirect untuk auto-login (Supabase akan set session lalu
        // redirect balik ke redirectTo, default /orders)
        setInfo('Verifikasi berhasil! Mengalihkan ke akun Anda...');
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 500);
        return;
      }

      if (data.verified && !data.redirect_url) {
        // OTP verified tapi magic link gagal — fallback ke email login
        setLoginMethod('email');
        setError(
          data.error ||
            'OTP terverifikasi tapi auto-login gagal. Silakan login manual dengan email & password.'
        );
        return;
      }

      // Fallback — seharusnya gak nyampe sini
      setError(data.error || 'Verifikasi OTP gagal. Coba lagi.');
    } catch (err) {
      console.error('[Login] verify-waba-otp error:', err);
      setError(err.message || 'Gagal terhubung ke server. Coba lagi.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResendOTP = () => {
    if (countdown > 0 || sendingOtp) return;
    setOtp(['', '', '', '', '', '']);
    handleSendOTP();
  };

  const handlePhoneChange = (e) => {
    setWaPhone(e.target.value);
    // Kalau nomor berubah setelah OTP dikirim, reset state OTP biar user harus kirim ulang
    if (otpSent) {
      setOtpSent(false);
      setOtp(['', '', '', '', '', '']);
      setInfo('');
      setError('');
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setCountdown(0);
    }
  };

  const handleChangeNumber = () => {
    setOtpSent(false);
    setOtp(['', '', '', '', '', '']);
    setInfo('');
    setError('');
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  };

  // ============================================================================
  // EMAIL LOGIN HANDLER
  // ============================================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Mapping Supabase error messages (English) → Indonesia
      let friendlyError;
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('user not found')) {
        friendlyError = 'Email atau password salah.';
      } else if (msg.includes('email not confirmed')) {
        friendlyError = 'Email belum dikonfirmasi. Cek inbox email kamu (termasuk folder spam) untuk link konfirmasi.';
      } else if (msg.includes('too many requests')) {
        friendlyError = 'Terlalu banyak percobaan login. Tunggu beberapa menit lalu coba lagi.';
      } else if (msg.includes('email rate limit exceeded')) {
        friendlyError = 'Batas email tercapai. Tunggu sebentar lalu coba lagi.';
      } else {
        friendlyError = error.message;
      }
      setError(friendlyError);
      console.error('[Login] Supabase auth error:', error);
      setLoading(false);
      return;
    }
    // Setelah login sukses, redirect logic:
    // Kalau dari checkout intent (location.state.from) → balik ke page asal
    // Kalau gak ada from → biar AdminPage useEffect handle (cek role → dashboard/homepage)
    const from = location.state?.from;
    if (from && !from.startsWith('/admin') && !from.startsWith('/dashboard')) {
      navigate(from, { replace: true });
    }
    setLoading(false);
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%)' }}
    >
      <div className="bg-white rounded-[20px] max-w-[440px] w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 md:px-8 pt-6 md:pt-8 pb-5 md:pb-6 border-b border-gray-100">
          <div className="text-center">
            <div className="w-14 h-14 bg-[#c9a96e]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#c9a96e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h1 className="text-[1.4rem] md:text-[1.5rem] font-bold text-eglux-primary">Masuk Akun EGLUX</h1>
            <p className="text-[0.82rem] text-gray-500 mt-1">
              Masuk untuk mengelola toko dan belanja
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 md:px-8 py-5 md:py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-[0.82rem] text-red-600">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-[0.82rem] text-green-700">
              {info}
            </div>
          )}

          {/* Toggle: Via Email / Via WhatsApp */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-2.5 rounded-lg text-[0.85rem] font-semibold transition-all cursor-pointer border-none ${
                loginMethod === 'email'
                  ? 'bg-white text-eglux-primary shadow-sm'
                  : 'text-gray-500 bg-transparent hover:text-eglux-primary'
              }`}
            >
              Via Email
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod('whatsapp')}
              className={`flex-1 py-2.5 rounded-lg text-[0.85rem] font-semibold transition-all cursor-pointer border-none ${
                loginMethod === 'whatsapp'
                  ? 'bg-white text-eglux-primary shadow-sm'
                  : 'text-gray-500 bg-transparent hover:text-eglux-primary'
              }`}
            >
              Via WhatsApp
            </button>
          </div>

          {loginMethod === 'email' ? (
            // === EMAIL LOGIN FORM ===
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@contoh.com"
                  required
                  autoComplete="email"
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full py-3 px-4 pr-10 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent"
                    tabIndex="-1"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Lupa Password link */}
              <div className="flex justify-end -mt-2 mb-1">
                <Link
                  to="/forgot-password"
                  className="text-[0.75rem] text-eglux-secondary font-semibold hover:underline"
                >
                  Lupa Password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
          ) : (

            // === WHATSAPP OTP LOGIN FORM ===
            <div className="space-y-4">
              {/* Step 1: Phone input + Kirim Kode (wrapped in form buat Enter key support) */}
              <form onSubmit={(e) => { e.preventDefault(); if (!otpSent) handleSendOTP(); }}>
                <div>
                  <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                    Nomor WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={waPhone}
                    onChange={handlePhoneChange}
                    placeholder="Masukkan No. WhatsApp"
                    required
                    disabled={otpSent}
                    autoComplete="tel"
                    className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-[0.72rem] text-gray-500 mt-1.5">
                    Nomor harus sudah terdaftar di akun EGLUX Anda.
                  </p>
                </div>

                {!otpSent && (
                  <button
                    type="submit"
                    disabled={sendingOtp}
                    className="w-full mt-8 py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sendingOtp ? 'Mengirim Kode...' : 'Kirim Kode OTP'}
                  </button>
                )}
              </form>

              {/* Step 2: OTP input + Verify (wrapped in form buat Enter key support) */}
              {otpSent && (
                <form onSubmit={(e) => { e.preventDefault(); handleVerifyOTP(); }}>
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                      Kode OTP
                    </label>
                    <OTPInput value={otp} onChange={setOtp} disabled={verifyingOtp} />
                    <p className="text-[0.72rem] text-gray-500 mt-1.5">
                      Kode 6 digit telah dikirim ke WhatsApp {waPhone}. Cek pesan masuk Anda.
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[0.78rem]">
                    <button
                      type="button"
                      onClick={handleChangeNumber}
                      disabled={verifyingOtp}
                      className="text-eglux-secondary font-semibold hover:underline cursor-pointer border-none bg-transparent disabled:opacity-50"
                    >
                      ← Ganti Nomor
                    </button>
                    {countdown > 0 ? (
                      <span className="text-gray-500">
                        Kirim ulang dalam <span className="font-semibold">{countdown}s</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        disabled={sendingOtp}
                        className="text-eglux-secondary font-semibold hover:underline cursor-pointer border-none bg-transparent disabled:opacity-50"
                      >
                        {sendingOtp ? 'Mengirim...' : 'Kirim Ulang Kode'}
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={verifyingOtp || otp.join('').length !== 6}
                    className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {verifyingOtp ? 'Memverifikasi...' : 'Verifikasi & Masuk'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Switch to register */}
          <div className="mt-5 text-center">
            <p className="text-[0.82rem] text-gray-500">
              Belum punya akun?{' '}
              <Link to="/register" className="text-eglux-secondary font-semibold hover:underline">
                Daftar di sini
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 md:px-8 py-3 md:py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-[0.7rem] text-gray-400 text-center">
            PT. Rayee Investment Indonesia &copy; {new Date().getFullYear()}. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SettingsPage — unchanged (store settings admin form, currently unused)
// ============================================================================
const SettingsPage = () => {
  const [form, setForm] = useState({
    storeName: 'EGLUX',
    email: 'hello@eglux.id',
    phone: '+62 812-3456-7890',
    midtransClientKey: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('store_settings')
        .select('*')
        .single();
      if (!error && data) {
        setForm((prev) => ({
          ...prev,
          storeName: data.store_name ?? prev.storeName,
          email: data.email ?? prev.email,
          phone: data.phone ?? prev.phone,
          midtransClientKey: data.midtrans_client_key ?? '',
        }));
      }
    };
    loadSettings();
  }, []);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    const { error } = await supabase
      .from('store_settings')
      .upsert({
        id: 1,
        store_name: form.storeName,
        email: form.email,
        phone: form.phone,
        midtrans_client_key: form.midtransClientKey,
        updated_at: new Date().toISOString(),
      });
    setSaving(false);
    if (error) {
      setStatus({ type: 'error', message: 'Gagal menyimpan pengaturan. Coba lagi.' });
      return;
    }
    setStatus({ type: 'success', message: 'Pengaturan berhasil disimpan.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Settings</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">Manage your store settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="py-2.5 px-6 bg-[#1a1d2b] text-white rounded-xl text-[0.9rem]
                     font-bold cursor-pointer transition-all hover:bg-[#2d3142]
                     disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#1a1d2b]/20"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {status && (
        <div
          className={`text-[0.85rem] px-4 py-3 rounded-xl ${
            status.type === 'success'
              ? 'bg-green-50 text-green-600'
              : 'bg-red-50 text-red-500'
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
          <h3 className="text-[1rem] font-bold text-[#1a1d2b] mb-4">Store Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Store Name</label>
              <input
                type="text"
                value={form.storeName}
                onChange={handleChange('storeName')}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none focus:border-[#c9a96e]"
              />
            </div>
            <div>
              <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={handleChange('email')}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none focus:border-[#c9a96e]"
              />
            </div>
            <div>
              <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={handleChange('phone')}
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none focus:border-[#c9a96e]"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
          <h3 className="text-[1rem] font-bold text-[#1a1d2b] mb-4">Payment Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Midtrans Client Key</label>
              <input
                type="text"
                value={form.midtransClientKey}
                onChange={handleChange('midtransClientKey')}
                placeholder="SB-Mid-client-xxxxxxxxxxxx"
                className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none focus:border-[#c9a96e]"
              />
              <p className="text-[0.75rem] text-[#9ca3af] mt-1.5">
                Client Key aman ditaruh di sini — dipakai buat load Snap.js di sisi browser.
              </p>
            </div>
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
              <span className="text-[0.8rem] text-amber-700">
                Server Key <strong>sengaja gak ada</strong> di sini. Itu kredensial rahasia buat
                verifikasi webhook — disimpan sebagai secret di Edge Function
                (<code className="text-[0.75rem]">supabase secrets set MIDTRANS_SERVER_KEY=...</code>),
                bukan di database yang bisa diakses lewat client.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// AdminPage (root) — pure login page; if logged in → redirect by role
// ============================================================================
const AdminPage = () => {
  const [session, setSession] = useState(undefined);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Redirect kalau user sudah login
  useEffect(() => {
    if (session) {
      const checkAndRedirect = async () => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle();

        const isAdmin = profile?.role === 'team_dev' || profile?.role === 'master' || profile?.role === 'admin';
        const from = location.state?.from;

        if (from && !from.startsWith('/admin') && !from.startsWith('/dashboard')) {
          navigate(from, { replace: true });
          return;
        }

        if (isAdmin) {
          navigate('/dashboard-admin', { replace: true });
        } else {
          navigate(from || '/', { replace: true });
        }
      };
      checkAndRedirect();
    }
  }, [session, navigate, location]);

  // Loading state: ambil session awal
  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="w-8 h-8 border-3 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sudah login: redirect sedang berlangsung, tampilkan spinner (BUKAN AdminLayout)
  if (session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
          <p className="text-[0.8rem] text-gray-500">Mengarahkan...</p>
        </div>
      </div>
    );
  }

  // Belum login → render LoginForm
  return <LoginForm />;
};

export default AdminPage;
