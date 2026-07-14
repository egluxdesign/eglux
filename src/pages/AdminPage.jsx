// src/pages/AdminPage.jsx
// ============================================================================
// AdminPage — halaman login EGLUX.
// ============================================================================
// Perilaku:
//   - User belum login → render LoginForm.
//   - User sudah login → redirect ke `location.state.from` (page asal) atau `/`
//     TIDAK render AdminLayout (dashboard admin disembunyikan dulu karena
//     pagenya belum fix — lihat task 2 di worklog).
//   - Saat redirect, tampilkan spinner (bukan AdminLayout) supaya user tidak
//     lihat "flash" dashboard admin sebelum pindah page.
//
// Catatan: kalau dashboard admin sudah fix nanti, balikin render AdminLayout
// di bagian `if (session) { ... }` di bawah. Untuk sekarang cukup redirect.
// ============================================================================

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// ── Login Form (Matched Style dengan RegisterPage) ───────────
const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // ⭐ Tampilkan error asli dari Supabase, bukan generic "email/password salah".
      // Supabase error messages (English) yang umum:
      //   - "Invalid login credentials"
      //   - "Email not confirmed"
      //   - "User not found"
      //   - "Too many requests"
      // Mapping ke bahasa Indonesia supaya user-friendly:
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
        // Default: tampilkan error asli biar gampang debug
        friendlyError = error.message;
      }
      setError(friendlyError);
      console.error('[Login] Supabase auth error:', error);
      setLoading(false);
      return;
    }
    // Setelah login: tetap di page asal (jika ada state.from),
    // atau balik ke homepage. TIDAK auto-redirect ke /products-admin.
    // Admin bisa akses panel produk lewat menu dropdown di header (role-based).
    const from = location.state?.from || '/';
    navigate(from, { replace: true });
    setLoading(false);
  };

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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
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

            {/* Password dengan eye toggle */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

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
            EGLUX Admin Panel · Akses terbatas untuk admin & staff
          </p>
        </div>
      </div>
    </div>
  );
};

// ── Settings Page ──────────────────────────────────────────────
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

// ── Page Router ──────────────────────────────────────────────
// DISABLED: dashboard admin belum fix. Kalau sudah fix, balikin import
// AdminLayout + komponen admin (DashboardOverview, OrdersPage, dll) di atas,
// lalu uncomment PageRouter + render AdminLayout di AdminPage root.
//
// const PageRouter = ({ page, onNavigate }) => {
//   switch (page) {
//     case 'dashboard': return <DashboardOverview onNavigate={onNavigate} />;
//     case 'orders': return <OrdersPage />;
//     case 'products': return <ProductsPage />;
//     case 'customers': return <CustomersPage />;
//     case 'payments': return <PaymentsPage />;
//     case 'analytics': return <AnalyticsPage />;
//     case 'settings': return <SettingsPage />;
//     case 'profile': return <ProfilePage />;
//     default: return <DashboardOverview />;
//   }
// };

// ── AdminPage (root) ───────────────────────────────────────
// Pure login page. Kalau user sudah login → langsung redirect ke page asal.
// AdminLayout (dashboard) tidak dirender karena pagenya belum fix.
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

  // ── Redirect kalau user sudah login ──
  // Pakai useEffect (bukan langsung navigate di body) supaya tidak trigger
  // warning "Cannot update during render". Spinner ditampilkan sebagai
  // placeholder saat redirect berlangsung — BUKAN AdminLayout.
  useEffect(() => {
    if (session) {
      const from = location.state?.from || '/';
      navigate(from, { replace: true });
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

  // Sudah login: redirect sedang berlangsung, tampilkan spinner (BUKAN AdminLayout).
  // Ini fix issue "flash admin page" sebelum pindah ke page asal.
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
