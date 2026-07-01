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

// ── Login Form ────────────────────────────────────────────────
const LoginForm = ({ onLogin }) => {
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
    onLogin();
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
const SettingsPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Settings</h1>
      <p className="text-[0.85rem] text-[#9ca3af] mt-1">Manage your store settings</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
        <h3 className="text-[1rem] font-bold text-[#1a1d2b] mb-4">Store Information</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Store Name</label>
            <input type="text" defaultValue="EGLUX" className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none" />
          </div>
          <div>
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Email</label>
            <input type="email" defaultValue="hello@eglux.id" className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none" />
          </div>
          <div>
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Phone</label>
            <input type="text" defaultValue="+62 812-3456-7890" className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
        <h3 className="text-[1rem] font-bold text-[#1a1d2b] mb-4">Payment Settings</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Midtrans Server Key</label>
            <input type="password" placeholder="••••••••••••" className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none" />
          </div>
          <div>
            <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Midtrans Client Key</label>
            <input type="password" placeholder="••••••••••••" className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] outline-none" />
          </div>
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[0.8rem] text-blue-600">Midtrans integration ready for sandbox mode</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── Page Router ──────────────────────────────────────────────
const PageRouter = ({ page }) => {
  switch (page) {
    case 'dashboard': return <DashboardOverview />;
    case 'orders': return <OrdersPage />;
    case 'products': return <ProductsPage />;
    case 'customers': return <CustomersPage />;
    case 'payments': return <PaymentsPage />;
    case 'analytics': return <AnalyticsPage />;
    case 'settings': return <SettingsPage />;
    default: return <DashboardOverview />;
  }
};

// ── AdminPage (root) ───────────────────────────────────────
const AdminPage = () => {
  const [session, setSession] = useState(undefined);
  const [activePage, setActivePage] = useState('dashboard');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
        <div className="w-8 h-8 border-3 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <LoginForm onLogin={() => setSession(supabase.auth.getSession().then(({ data }) => data.session))} />;
  }

  return (
    <AdminLayout activePage={activePage} onNavigate={setActivePage}>
      <PageRouter page={activePage} />
    </AdminLayout>
  );
};

export default AdminPage;