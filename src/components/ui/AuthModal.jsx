// src/components/ui/AuthModal.jsx
// ============================================================================
// AuthModal — Login (Email / WhatsApp OTP) + Register modal
// ============================================================================
// Usage: <AuthModal isOpen={isOpen} onClose={onClose} initialMode="login" />
//   initialMode: "login" | "register"
//
// Modes:
//   - "login"    → tab toggle antara "Via Email" (email+password) dan
//                  "Via WhatsApp" (OTP 6 digit via WABA Qiscus)
//   - "register" → form daftar akun baru (nama, phone, email, password, referral)
//
// WhatsApp OTP Flow:
//   1. User input nomor WA → click "Kirim Kode OTP"
//      → supabase.functions.invoke('send-waba-otp', { body: { phone } })
//      → server normalize phone, cek customers table, generate 6-digit OTP,
//        save ke otp_codes, kirim via Qiscus WABA template
//   2. User input 6-digit OTP di 6 box terpisah (auto-focus + paste support)
//   3. User click "Verifikasi & Masuk"
//      → supabase.functions.invoke('verify-waba-otp', { body: { phone, code } })
//      → server verify OTP, generate Supabase magic link
//      → frontend redirect ke magic link → auto-login + redirect ke /orders
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

// ============================================================================
// OTPInput — 6 separate input boxes untuk kode OTP
// ============================================================================
// Features:
//   - Auto-focus ke box berikutnya saat 1 digit diisi
//   - Backspace di empty box → focus ke box sebelumnya
//   - Paste 6-digit code → auto-fill semua box
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
// AuthModal — Main component
// ============================================================================
const AuthModal = ({ isOpen, onClose, initialMode = 'login' }) => {
  const { login, register } = useAuth();

  // Top-level mode: 'login' | 'register'
  const [mode, setMode] = useState(initialMode);
  // Sub-mode untuk login: 'email' | 'whatsapp'
  const [loginMethod, setLoginMethod] = useState('email');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null); // success/info message (green)

  // === Email login / register form fields ===
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // === WhatsApp OTP form fields ===
  const [waPhone, setWaPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const countdownRef = useRef(null);

  // Reset saat modal buka / ganti mode
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
      setInfo(null);
    }
  }, [isOpen, initialMode]);

  // Baca referral code dari URL (?ref=EGL-XXXX) saat register mode
  useEffect(() => {
    if (isOpen && mode === 'register') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) setReferralCode(ref);
    }
  }, [isOpen, mode]);

  // Reset WA OTP state kalau user switch ke email method atau tutup modal
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

  // Cleanup countdown timer saat modal tutup
  useEffect(() => {
    if (!isOpen && countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  if (!isOpen) return null;

  // ============================================================================
  // HANDLERS — Email login + Register
  // ============================================================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await login(email, password);
      onClose();
    } catch (err) {
      setError(err.message || 'Login gagal. Cek email dan password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      setLoading(false);
      return;
    }

    try {
      await register(email, password, fullName, phone, referralCode);
      onClose();
    } catch (err) {
      setError(err.message || 'Registrasi gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setInfo(null);
  };

  // ============================================================================
  // HANDLERS — WhatsApp OTP
  // ============================================================================
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

  const handleSendOTP = async () => {
    setError(null);
    setInfo(null);

    // Basic validation — accept 08xxx, +62xxx, 628xxx, atau format spasi/dash
    const digits = waPhone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) {
      setError('Masukkan nomor WhatsApp yang valid (contoh: 0812 3456 7890 atau +62 812 3456 7890)');
      return;
    }

    setSendingOtp(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('send-waba-otp', {
        body: { phone: waPhone },
      });

      if (fnError) throw fnError;

      if (data?.success) {
        setOtpSent(true);
        setInfo(data.message || 'Kode OTP telah dikirim ke WhatsApp Anda.');
        setOtp(['', '', '', '', '', '']);
        startCountdown(60);
        // Auto-focus ke box OTP pertama (sedikit delay biar render dulu)
        setTimeout(() => {
          const firstBox = document.querySelector('input[aria-label="Digit OTP 1"]');
          if (firstBox) firstBox.focus();
        }, 100);
      } else {
        setError(data?.error || 'Gagal mengirim kode OTP. Coba lagi.');
      }
    } catch (err) {
      console.error('[AuthModal] send-waba-otp error:', err);
      setError(err.message || 'Gagal terhubung ke server. Coba lagi.');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async () => {
    setError(null);
    setInfo(null);

    const code = otp.join('');
    if (code.length !== 6) {
      setError('Masukkan 6 digit kode OTP.');
      return;
    }

    setVerifyingOtp(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-waba-otp', {
        body: { phone: waPhone, code },
      });

      if (fnError) throw fnError;

      if (data?.success && data.redirect_url) {
        // Magic link — redirect untuk auto-login
        setInfo('Verifikasi berhasil! Mengalihkan ke akun Anda...');
        onClose();
        // Beri delay kecil biar modal close animation selesai + UX bersih
        setTimeout(() => {
          window.location.href = data.redirect_url;
        }, 500);
        return;
      }

      if (data?.success && data.verified && !data.redirect_url) {
        // OTP verified tapi magic link gagal — fallback ke email login
        setLoginMethod('email');
        setError(
          data.error ||
            'OTP terverifikasi tapi auto-login gagal. Silakan login manual dengan email & password.'
        );
        return;
      }

      // Error dari server (kode salah, kadaluarsa, attempt habis, dll)
      setError(data?.error || 'Verifikasi OTP gagal. Coba lagi.');
    } catch (err) {
      console.error('[AuthModal] verify-waba-otp error:', err);
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
      setInfo(null);
      setError(null);
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
    setInfo(null);
    setError(null);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(0);
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  const renderLoginMethodTabs = () => (
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
  );

  const renderEmailLoginForm = () => (
    <form onSubmit={handleLogin} className="space-y-4">
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
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
          className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
        />
      </div>

      {/* Lupa Password link */}
      <div className="flex justify-end -mt-2 mb-1">
        <Link
          to="/forgot-password"
          className="text-[0.75rem] text-eglux-secondary font-semibold hover:underline"
          onClick={onClose}
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
  );

  const renderWhatsAppLoginForm = () => (
    <div className="space-y-4">
      {/* Step 1: Phone input + Kirim Kode */}
      <div>
        <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
          Nomor WhatsApp
        </label>
        <input
          type="tel"
          value={waPhone}
          onChange={handlePhoneChange}
          placeholder="0812 3456 7890 atau +62 812 3456 7890"
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
          type="button"
          onClick={handleSendOTP}
          disabled={sendingOtp}
          className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sendingOtp ? 'Mengirim Kode...' : 'Kirim Kode OTP'}
        </button>
      )}

      {/* Step 2: OTP input + Verify */}
      {otpSent && (
        <>
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
            type="button"
            onClick={handleVerifyOTP}
            disabled={verifyingOtp || otp.join('').length !== 6}
            className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifyingOtp ? 'Memverifikasi...' : 'Verifikasi & Masuk'}
          </button>
        </>
      )}
    </div>
  );

  const renderRegisterForm = () => (
    <form onSubmit={handleRegister} className="space-y-4">
      <div>
        <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
          Nama Lengkap *
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Masukkan nama lengkap"
          required
          className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
        />
      </div>

      <div>
        <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
          WhatsApp *
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+62 812 3456 7890"
          required
          className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
        />
      </div>

      <div>
        <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
          Email *
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
          Password *
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 6 karakter"
          required
          minLength="6"
          autoComplete="new-password"
          className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
        />
      </div>

      <div>
        <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
          Kode Referral <span className="text-gray-400 normal-case">(opsional)</span>
        </label>
        <input
          type="text"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          placeholder="EGL-XXXXXXXX"
          className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Memproses...' : 'Daftar Sekarang'}
      </button>
    </form>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[2500] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-[20px] max-w-[420px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[1.2rem] font-bold text-eglux-primary">
                {mode === 'login' ? 'Masuk Akun' : 'Daftar Akun Baru'}
              </h3>
              <p className="text-[0.75rem] text-gray-500 mt-0.5">
                {mode === 'login'
                  ? 'Masuk untuk melanjutkan checkout'
                  : 'Buat akun untuk belanja di EGLUX'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-[34px] h-[34px] rounded-full bg-black/[0.07] flex items-center justify-center
                         text-eglux-primary text-xl border-none cursor-pointer hover:bg-black/[0.13] transition-colors"
              aria-label="Tutup"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
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

          {mode === 'login' ? (
            <>
              {/* Toggle antara Email / WhatsApp — hanya di mode login */}
              {renderLoginMethodTabs()}

              {loginMethod === 'email'
                ? renderEmailLoginForm()
                : renderWhatsAppLoginForm()}
            </>
          ) : (
            renderRegisterForm()
          )}

          {/* Switch mode: Login ↔ Register */}
          <div className="mt-5 text-center">
            <p className="text-[0.82rem] text-gray-500">
              {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
              <button
                onClick={switchMode}
                className="text-eglux-secondary font-semibold hover:underline cursor-pointer border-none bg-transparent"
              >
                {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
