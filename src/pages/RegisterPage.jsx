// src/pages/RegisterPage.jsx
// ============================================================================
// Halaman registrasi terpisah di /register
// ============================================================================
// Usage: <Route path="/register" element={<RegisterPage />} />
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { COUNTRIES, DEFAULT_COUNTRY } from '../data/countries';
import { ChevronDown } from 'lucide-react';

const RegisterPage = () => {
  const { register, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Phone country selector state (sama seperti checkout)
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState(''); // display value (tanpa +62)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Baca referral code dari URL (?ref=EGL-XXXX)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref);
  }, [location]);

  // Kalau sudah login, redirect ke beranda
  useEffect(() => {
    if (user) {
      const from = location.state?.from || '/';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location]);

  // Click-outside handler untuk country dropdown
  useEffect(() => {
    if (!countryDropdownOpen) return;
    const handler = (e) => {
      if (!e.target.closest('.country-dropdown-register')) {
        setCountryDropdownOpen(false);
        setCountrySearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [countryDropdownOpen]);

  // Compose E.164 phone number
  const phoneE164 = useMemo(() => {
    if (!phoneDisplay) return '';
    const digits = phoneDisplay.replace(/\D/g, '');
    return `+${selectedCountry.dial}${digits}`;
  }, [phoneDisplay, selectedCountry]);

  // Filtered country list
  const filteredCountries = COUNTRIES.filter((c) => {
    if (!countrySearch.trim()) return true;
    const q = countrySearch.toLowerCase().trim();
    return c.name.toLowerCase().includes(q) || c.dial.includes(q.replace(/^\+/, ''));
  });

  // Email validation
  const isEmailValid = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (!fullName.trim()) {
      setError('Nama lengkap wajib diisi');
      setLoading(false);
      return;
    }
    if (!phoneDisplay.trim()) {
      setError('Nomor WhatsApp wajib diisi');
      setLoading(false);
      return;
    }
    if (!isEmailValid(email)) {
      setError('Format email tidak valid');
      setLoading(false);
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok');
      setLoading(false);
      return;
    }

    try {
      await register(email, password, fullName, phoneE164, referralCode);
      setSuccess(true);
      setTimeout(() => {
        const from = location.state?.from || '/';
        navigate(from, { replace: true });
      }, 2000);
    } catch (err) {
      setError(err.message || 'Registrasi gagal. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%)' }}
    >
      <div className="bg-white rounded-[20px] max-w-[440px] w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 md:px-8 pt-6 md:pt-8 pb-5 md:pb-6 border-b border-gray-100">
          <h1 className="text-[1.4rem] md:text-[1.5rem] font-bold text-eglux-primary">Daftar Akun EGLUX</h1>
          <p className="text-[0.82rem] text-gray-500 mt-1">
            Buat akun untuk belanja, lacak pesanan, dan dapatkan promo eksklusif.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 md:px-8 py-5 md:py-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Registrasi Berhasil!</h2>
              <p className="text-gray-500 text-sm">Akun Anda telah dibuat. Mengalihkan...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-[0.82rem] text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                {/* Nama Lengkap */}
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

                {/* WhatsApp — dengan country selector seperti checkout */}
                <div>
                  <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                    WhatsApp *
                  </label>
                  <div className="relative country-dropdown-register">
                    <button
                      type="button"
                      onClick={() => setCountryDropdownOpen((o) => !o)}
                      className="absolute left-0 top-0 bottom-0 flex items-center gap-1.5 px-3 bg-[#faf6ef] border-r-[1.5px] rounded-l-[10px] border-[#ddd] cursor-pointer hover:bg-[#f0e8d6] transition-colors"
                    >
                      <span className="text-base leading-none">{selectedCountry.flag}</span>
                      <span className="text-[0.88rem] font-semibold text-eglux-primary whitespace-nowrap">
                        +{selectedCountry.dial}
                      </span>
                      <ChevronDown className="w-3 h-3 text-gray-500" />
                    </button>
                    <input
                      type="tel"
                      value={phoneDisplay}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 14);
                        setPhoneDisplay(val);
                      }}
                      placeholder="812 3456 7890"
                      inputMode="numeric"
                      required
                      className="w-full py-3 pl-[90px] md:pl-[100px] pr-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                    />
                    {countryDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 max-w-[300px] bg-white rounded-[10px] shadow-2xl border border-[#eee] z-[100] max-h-[280px] flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-[#eee]">
                          <input
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Cari negara atau kode..."
                            autoFocus
                            className="w-full px-3 py-2 text-[0.85rem] border border-[#ddd] rounded-md outline-none focus:border-eglux-secondary"
                          />
                        </div>
                        <div className="overflow-y-auto flex-1">
                          {filteredCountries.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => {
                                setSelectedCountry(c);
                                setCountryDropdownOpen(false);
                                setCountrySearch('');
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[#faf6ef] ${selectedCountry.code === c.code ? 'bg-[#faf6ef]' : ''}`}
                            >
                              <span className="text-base">{c.flag}</span>
                              <span className="text-[0.85rem] text-eglux-primary flex-1 truncate">{c.name}</span>
                              <span className="text-[0.78rem] text-gray-500">+{c.dial}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Email */}
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
                    className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors ${email && !isEmailValid(email) ? 'border-red-500' : 'border-[#ddd]'}`}
                  />
                  {email && !isEmailValid(email) && (
                    <p className="text-[0.72rem] text-red-500 mt-1">Format email tidak valid</p>
                  )}
                </div>

                {/* Password + Confirm (grid 2 col) dengan toggle eye */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                      Password *
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 6 karakter"
                        required
                        minLength="6"
                        autoComplete="new-password"
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
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                      Konfirmasi *
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password"
                        required
                        minLength="6"
                        autoComplete="new-password"
                        className={`w-full py-3 px-4 pr-10 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors ${confirmPassword && password !== confirmPassword ? 'border-red-500' : 'border-[#ddd]'}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent"
                        tabIndex="-1"
                        aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      >
                        {showConfirmPassword ? (
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
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-[0.72rem] text-red-500 mt-1">Password tidak cocok</p>
                    )}
                  </div>
                </div>

                {/* Referral Code */}
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

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? 'Memproses...' : 'Daftar Sekarang'}
                </button>
              </form>

              {/* Switch to login */}
              <div className="mt-5 text-center">
                <p className="text-[0.82rem] text-gray-500">
                  Sudah punya akun?{' '}
                  <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">
                    Masuk di sini
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 md:px-8 py-3 md:py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-[0.7rem] text-gray-400 text-center">
            Dengan mendaftar, Anda menyetujui syarat & ketentuan EGLUX.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
