// src/components/admin/layout/AdminLayout.jsx
// ============================================================================
// AdminLayout v2 — Shopee-inspired layout
// ============================================================================
// Struktur:
//   Desktop (md+):
//     [Sidebar 240px persistent] [Main: Header + Title Bar + Content]
//   Mobile:
//     [Header with hamburger] [Sidebar slide-in overlay]
//
// Header berisi:
//   - Hamburger (mobile only, buka sidebar)
//   - Global Search input (cari order, produk, user)
//   - Notification Bell (badge + dropdown)
//   - UserMenu (avatar)
//
// Pemakaian:
//   <AdminLayout title="Products Admin" subtitle="..." actions={<>...</>}>
//     {children}
//   </AdminLayout>
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import UserMenu from '../../ui/UserMenu';
import logoImg from '../../../assets/img/Logo1.png';
import { ADMIN_PAGES, canAccess } from '../../../lib/permissions';
import { useAdminPresence } from '../../../hooks/useAdminPresence';

// ============================================================================
// AdminLayout
// ============================================================================
const AdminLayout = ({ children, title = 'Admin', subtitle, actions }) => {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifCount, setNotifCount] = useState(0);

  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const tokenRef = useRef(null);
  const currentPath = window.location.pathname;

  // ⭐ Phase 4: Track admin presence + log activity
  useAdminPresence(title);

  // ⭐ Filter nav items berdasarkan user permissions
  const visibleNavItems = ADMIN_PAGES.filter(page => canAccess(page.key, profile));
  const isAdmin = profile?.role === 'team_dev' || profile?.role === 'master';

  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    window.location.href = '/admin';
  };

  // ── Token cache ──
  const getToken = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    tokenRef.current = token;
    return token;
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => { tokenRef.current = null; });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Click outside handler (close dropdowns) ──
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── Fetch notifications (pending orders, claims, shipping delays) ──
  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_range: '30d' }),
      });
      const result = await resp.json();
      if (result.success && result.alerts) {
        const notifs = [];
        if (result.alerts.pending_orders_count > 0) {
          notifs.push({
            id: 'pending-orders',
            type: 'urgent',
            icon: '🔴',
            title: `${result.alerts.pending_orders_count} order pending >23 jam`,
            description: 'Akan expire segera — butuh follow up',
            href: '/orders-admin',
          });
        }
        if (result.alerts.pending_claims_count > 0) {
          notifs.push({
            id: 'pending-claims',
            type: 'warning',
            icon: '🟡',
            title: `${result.alerts.pending_claims_count} klaim poin menunggu`,
            description: 'Verifikasi klaim poin marketplace',
            href: '/points-admin',
          });
        }
        if (result.alerts.shipping_delays_count > 0) {
          notifs.push({
            id: 'shipping-delays',
            type: 'warning',
            icon: '🟠',
            title: `${result.alerts.shipping_delays_count} paket shipping delay`,
            description: 'Paket >3 hari belum sampai',
            href: '/orders-admin',
          });
        }
        setNotifications(notifs);
        setNotifCount(notifs.length);
      }
    } catch (e) {
      console.warn('[AdminLayout] notif fetch error:', e?.message);
    }
  }, [getToken]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Refresh notif setiap 60s
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // ── Global search (debounced) ──
  const performSearch = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchLoading(true);
    try {
      const q = query.trim().toLowerCase();

      // Parallel search: orders (by customer name or short id), products (by name), profiles (by email/name)
      const [ordersRes, productsRes, usersRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, status, payment_status, total_amount, created_at, customer:customers(name)')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('products')
          .select('id, name, slug, is_active')
          .ilike('name', `%${q}%`)
          .limit(5),
        isAdmin ? supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .or(`email.ilike.%${q}%,full_name.ilike.%${q}%`)
          .limit(5) : Promise.resolve({ data: [], error: null }),
      ]);

      // Filter orders client-side (by customer name or short id)
      const filteredOrders = (ordersRes.data || []).filter(o => {
        const custName = (o.customer?.name || '').toLowerCase();
        const shortId = o.id.replace(/-/g, '').slice(0, 8).toLowerCase();
        return custName.includes(q) || shortId.includes(q);
      }).slice(0, 5);

      setSearchResults({
        orders: filteredOrders,
        products: productsRes.data || [],
        users: usersRes.data || [],
      });
    } catch (e) {
      console.warn('[AdminLayout] search error:', e?.message);
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  }, [isAdmin]);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSearchDropdown(true);

    // Debounce 300ms
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 300);
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setShowSearchDropdown(false);
      // Navigate to orders page with search query (orders page can filter)
      navigate(`/orders-admin?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const shortId = (uuid) => (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* === Sidebar (persistent desktop, slide-in mobile) === */}
      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white border-r border-gray-200 z-[1500] flex flex-col
                    transition-transform duration-300
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0 md:z-auto`}
      >
        {/* Sidebar Header: logo */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between h-[60px] md:h-[72px]">
          <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center">
            <img src={logoImg} alt="Eglux Logo" className="h-7 w-auto" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
          >
            ✕
          </button>
        </div>

        {/* Admin Panel label */}
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-bold text-eglux-primary uppercase tracking-wider">Admin Panel</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.href
                  ? 'bg-eglux-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
          <div className="border-t border-gray-100 my-3" />
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span className="text-base">←</span>
            <span>Kembali ke Storefront</span>
          </Link>
        </nav>

        {/* Footer: role + email + logout */}
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-xs font-bold text-eglux-primary uppercase tracking-wider">{profile?.role || 'user'}</p>
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border-none bg-transparent text-left"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Keluar
          </button>
        </div>
      </aside>

      {/* Overlay (mobile only, saat sidebar open) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[1400] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* === Main Area (offset by sidebar width on desktop) === */}
      <div className="md:ml-60">
        {/* === Header (sticky) === */}
        <header className="sticky top-0 z-[1000] bg-white border-b border-gray-200 h-[60px] md:h-[72px] flex items-center px-4 md:px-6 gap-3">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
            className="md:hidden bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1.5 items-center justify-center"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className="block w-[20px] h-[1.5px] rounded-sm bg-eglux-primary" />
            ))}
          </button>

          {/* Global Search */}
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setShowSearchDropdown(true)}
                onKeyDown={handleSearchSubmit}
                placeholder="Cari order, produk, user..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg outline-none focus:bg-white focus:border-eglux-secondary transition-colors"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Search Dropdown */}
            {showSearchDropdown && searchQuery.trim().length >= 2 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[400px] overflow-y-auto z-[2000]">
                {searchResults && (searchResults.orders.length > 0 || searchResults.products.length > 0 || searchResults.users.length > 0) ? (
                  <div className="py-2">
                    {/* Orders results */}
                    {searchResults.orders.length > 0 && (
                      <div>
                        <p className="px-3 py-1.5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider">📦 Orders</p>
                        {searchResults.orders.map((o) => (
                          <Link
                            key={o.id}
                            to="/orders-admin"
                            onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 no-underline"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 truncate">
                                #{shortId(o.id)} · {o.customer?.name || 'Customer'}
                              </p>
                              <p className="text-[0.65rem] text-gray-400">
                                {o.status} · {o.payment_status}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-eglux-secondary flex-shrink-0 ml-2">
                              Rp {(o.total_amount || 0).toLocaleString('id-ID')}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {/* Products results */}
                    {searchResults.products.length > 0 && (
                      <div>
                        <p className="px-3 py-1.5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100">🏷️ Produk</p>
                        {searchResults.products.map((p) => (
                          <Link
                            key={p.id}
                            to="/products-admin"
                            onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 no-underline"
                          >
                            <span className="text-xs text-gray-900 truncate flex-1">{p.name}</span>
                            <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {p.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                    {/* Users results (admin only) */}
                    {isAdmin && searchResults.users.length > 0 && (
                      <div>
                        <p className="px-3 py-1.5 text-[0.65rem] font-bold text-gray-400 uppercase tracking-wider border-t border-gray-100">👥 User</p>
                        {searchResults.users.map((u) => (
                          <Link
                            key={u.id}
                            to="/users-admin"
                            onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 no-underline"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 truncate">{u.full_name || u.email}</p>
                              <p className="text-[0.65rem] text-gray-400 truncate">{u.email}</p>
                            </div>
                            <span className="text-[0.6rem] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0 ml-2 capitalize">{u.role}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ) : !searchLoading ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-gray-400">Tidak ada hasil untuk "{searchQuery}"</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Notification Bell */}
          <div ref={notifRef} className="relative">
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              className="relative p-2 rounded-lg hover:bg-gray-100 cursor-pointer border-none bg-transparent"
              aria-label="Notifikasi"
            >
              <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notifCount > 0 && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[0.6rem] font-bold rounded-full flex items-center justify-center">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifDropdown && (
              <div className="absolute top-full mt-1 right-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl max-h-[400px] overflow-y-auto z-[2000]">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Notifikasi</h3>
                  {notifCount > 0 && (
                    <span className="text-[0.65rem] text-gray-400">{notifCount} alert aktif</span>
                  )}
                </div>
                <div className="py-2">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-3xl mb-2">✅</p>
                      <p className="text-xs text-gray-400">Semua aman, tidak ada alert.</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <Link
                        key={n.id}
                        to={n.href}
                        onClick={() => setShowNotifDropdown(false)}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 no-underline border-b border-gray-50 last:border-0"
                      >
                        <span className="text-base flex-shrink-0 mt-0.5">{n.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900">{n.title}</p>
                          <p className="text-[0.65rem] text-gray-400">{n.description}</p>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* UserMenu */}
          <UserMenu variant="admin" />
        </header>

        {/* === Title Bar === */}
        <div className="bg-white border-b border-gray-200">
          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold text-eglux-primary truncate">{title}</h1>
              {subtitle && <p className="text-xs text-gray-500 hidden md:block">{subtitle}</p>}
            </div>
            {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
          </div>
        </div>

        {/* === Content === */}
        <div className="px-4 md:px-6 py-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
