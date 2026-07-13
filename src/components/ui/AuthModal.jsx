// src/components/ui/AuthModal.jsx
// ============================================================================
// AuthModal — Login + Register modal (toggle between 2 modes)
// ============================================================================
// Usage: <AuthModal isOpen={isOpen} onClose={onClose} mode="login" />
//   mode: "login" | "register"
// ============================================================================

import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';

const AuthModal = ({ isOpen, onClose, initialMode = 'login' }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Reset saat modal buka / ganti mode
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setError(null);
    }
  }, [isOpen, initialMode]);

  // Baca referral code dari URL (?ref=EGL-XXXX)
  useEffect(() => {
    if (isOpen && mode === 'register') {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref) setReferralCode(ref);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
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

    // Basic validation
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
  };

  // ============================================================================
  // RENDER
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

          {mode === 'login' ? (
            // === LOGIN FORM ===
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>
          ) : (
            // === REGISTER FORM ===
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
          )}

          {/* Switch mode */}
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
