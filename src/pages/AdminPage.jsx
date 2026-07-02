// src/pages/AdminPage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import AdminLayout from '../components/admin/layout/AdminLayout';
import DashboardOverview from '../components/admin/dashboard/DashboardOverview';
import OrdersPage from '../components/admin/orders/OrdersPage';
import ProductsPage from '../components/admin/products/ProductsPage';
import CustomersPage from '../components/admin/customers/CustomersPage';
import PaymentsPage from '../components/admin/payments/PaymentsPage';
import AnalyticsPage from '../components/admin/analytics/AnalyticsPage';
import ProfilePage from '../components/admin/profile/ProfilePage';

// ── Login Form ────────────────────────────────────────────────
const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Email atau password salah.');
      setLoading(false);
      return;
    }
    // Tidak perlu set session manual di sini.
    // onAuthStateChange di AdminPage akan otomatis menangkap sesi baru.
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
      <div className="bg-white rounded-[24px] shadow-xl p-10 w-full max-w-[400px] border border-[#e8ecf4]">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[#c9a96e]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#c9a96e]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">EGLUX Admin</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">Login untuk kelola toko</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@eglux.id"
              required
              autoComplete="username"
              className="w-full py-3 px-4 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem]
                         text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                         transition-all placeholder-[#9ca3af]"
            />
          </div>
          <div className="mb-6">
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full py-3 px-4 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem]
                         text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                         transition-all placeholder-[#9ca3af]"
            />
          </div>
          {error && (
            <p className="text-red-500 text-[0.85rem] text-center mb-4 bg-red-50 py-2 rounded-lg">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-[#1a1d2b] text-white rounded-xl text-[0.95rem]
                       font-bold cursor-pointer transition-all hover:bg-[#2d3142]
                       disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#1a1d2b]/20"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
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
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }

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
        id: 1, // single-row settings table
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
const PageRouter = ({ page, onNavigate }) => {
  switch (page) {
    case 'dashboard': return <DashboardOverview onNavigate={onNavigate} />;
    case 'orders': return <OrdersPage />;
    case 'products': return <ProductsPage />;
    case 'customers': return <CustomersPage />;
    case 'payments': return <PaymentsPage />;
    case 'analytics': return <AnalyticsPage />;
    case 'settings': return <SettingsPage />;
    case 'profile': return <ProfilePage />;
    default: return <DashboardOverview />;
  }
};

// ── AdminPage (root) ───────────────────────────────────────
const AdminPage = () => {
  const [session, setSession] = useState(undefined);
  const [activePage, setActivePage] = useState('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setActivePage('dashboard');
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="w-8 h-8 border-3 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginForm />;
  }

  return (
    <AdminLayout activePage={activePage} onNavigate={setActivePage} onLogout={handleLogout}>
      <PageRouter page={activePage} onNavigate={setActivePage} />
    </AdminLayout>
  );
};

export default AdminPage;