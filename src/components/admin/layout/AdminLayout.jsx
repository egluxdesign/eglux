// src/components/admin/layout/AdminLayout.jsx
// ============================================================================
// AdminLayout v3 — Editorial Minimalist (EGLUX Design System)
// ============================================================================
// Design philosophy:
//   - Editorial aesthetic: Playfair Display headings + Inter body
//   - Brand palette: #1a1a1a (primary), #9a7d4a (gold), #f7f3ed (cream),
//                    #3a3944 (text), #8a8a8a (muted), #e8e4df (border)
//   - Sharp corners everywhere (no rounded-xl)
//   - Borderless cards, no shadows
//   - Generous whitespace
//   - Single accent color (gold) for all highlights
//
// Structure:
//   Desktop (md+):
//     [Sidebar 240px persistent dark-brown] [Main: Header + Title Bar + Content]
//   Mobile:
//     [Header with hamburger] [Sidebar slide-in overlay]
//
// Header berisi:
//   - Hamburger (mobile only, buka sidebar)
//   - Global Search input (underline-style, minimal)
//   - Notification Bell (badge + dropdown) — original gray theme
//   - UserMenu (avatar)
//
// Sidebar:
//   - Dark brown bg (#554521) + gold accents (#cba65a)
//   - White logo (filtered via CSS)
//   - SVG nav icons tinted gold via CSS mask-image
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
// NavIcon — renders SVG image from Supabase storage, falls back to emoji
// ============================================================================
// Implementation:
//   Pakai CSS mask-image untuk tinting SVG ke warna gold #cba65a
//   (lebih clean dari CSS filter hack, hasil exact match brand color)
//   Hidden <img> dipakai untuk detect load error → fallback ke emoji
// ============================================================================
const NavIcon = ({ item, active, className = '' }) => {
  const [svgError, setSvgError] = useState(false);
  const iconClasses = `flex-shrink-0 ${className}`;

  // Prefer SVG if available and not failed
  if (item.iconSvg && !svgError) {
    return (
      <div
        className={`${iconClasses} w-[18px] h-[18px] relative`}
        style={{
          backgroundColor: '#cba65a',
          maskImage: `url(${item.iconSvg})`,
          WebkitMaskImage: `url(${item.iconSvg})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          // Active = full gold, inactive = 70% opacity gold (softer)
          opacity: active ? 1 : 0.7,
        }}
      >
        {/* Hidden img untuk detect load error — triggers fallback ke emoji */}
        <img
          src={item.iconSvg}
          alt=""
          onError={() => setSvgError(true)}
          className="hidden"
          aria-hidden="true"
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback to emoji
  return (
    <span className={`${iconClasses} text-base w-[18px] text-center`}>
      {item.icon}
    </span>
  );
};

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

  // ── Fetch notifications from admin_notifications table (via edge function) ──
  const fetchNotifications = useCallback(async () => {
    try {
      const token = await getToken();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-admin-notifications`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const result = await resp.json();
      if (result.success) {
        setNotifications(result.notifications || []);
        setNotifCount(result.unread_count || 0);
      }
    } catch (e) {
      console.warn('[AdminLayout] notif fetch error:', e?.message);
    }
  }, [getToken]);

  // Mark all as read
  const markAllRead = useCallback(async () => {
    try {
      const token = await getToken();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-admin-notifications`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.warn('[AdminLayout] mark all read error:', e?.message);
    }
  }, [getToken]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Refresh notif setiap 30s (lebih sering karena ada event real-time)
  useEffect(() => {
    const interval = setInterval(fetchNotifications, 30000);
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
    <div className="min-h-screen bg-white">
      {/* === Sidebar (persistent desktop, slide-in mobile) === */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-[#554521] border-r border-white z-[1500] flex flex-col
                    transition-transform duration-300
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                    md:translate-x-0 md:z-auto`}
      >
        {/* Sidebar Header: logo (filtered to white via CSS) */}
        <div className="px-6 py-5 border-b border-[#cba65a] flex items-center justify-between h-[64px] md:h-[72px]">
          <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center">
            <img
              src={logoImg}
              alt="Eglux Logo"
              className="h-7 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
              draggable={false}
            />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden w-8 h-8 hover:bg-[#cba65a]/5 flex items-center justify-center text-white cursor-pointer border-none bg-transparent"
          >
            ✕
          </button>
        </div>

        {/* Admin Panel label */}
        <div className="px-6 pt-6 pb-3">
          <span className="text-[0.65rem] font-medium text-[#cba65a] uppercase tracking-[0.2em]">Admin Panel</span>
        </div>

        {/* Nav items — editorial list style, SVG icons tinted gold via CSS mask-image */}
        <nav className="flex-1 py-2 px-3 space-y-0 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-all no-underline border-l-2 -ml-3 ${
                  isActive
                    ? 'border-[#9a7d4a] text-[#1a1a1a] font-semibold bg-white/60'
                    : 'border-transparent text-white hover:border-[#9a7d4a]/40 hover:text-[#1a1a1a] hover:bg-white/40 font-normal'
                }`}
              >
                <NavIcon item={item} active={isActive} />
                <span className="truncate tracking-wide">{item.label}</span>
              </Link>
            );
          })}
          <div className="border-t border-[#cba65a] my-4 mx-3" />
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 text-sm text-white/60 hover:text-[#1a1a1a] hover:bg-white/40 transition-colors no-underline font-normal"
          >
            <span className="text-base flex-shrink-0 w-[18px] text-center">←</span>
            <span className="tracking-wide">Kembali ke Storefront</span>
          </Link>
        </nav>

        {/* Footer: role + email + logout */}
        <div className="px-6 py-4 border-t border-[#cba65a]">
          <p className="text-[0.65rem] font-medium text-[#cba65a] uppercase tracking-[0.2em] mb-1">{profile?.role || 'user'}</p>
          <p className="text-xs text-white/60 truncate mb-3">{user?.email}</p>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-0 py-1.5 text-sm font-medium text-[#cba65a] hover:text-[#cba65a] transition-colors cursor-pointer border-none bg-transparent text-left border-b border-transparent hover:border-[#cba65a]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#cba65a" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="tracking-wide text-[#cba65a] hover:text-white">Keluar</span>
          </button>
        </div>
      </aside>

      {/* Overlay (mobile only, saat sidebar open) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[1400] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* === Main Area (offset by sidebar width on desktop) === */}
      <div className="md:ml-64">
        {/* === Header (sticky) — minimal, underline-style search === */}
        <header className="sticky top-0 z-[1000] bg-white border-b border-[#e8e4df] h-[64px] md:h-[72px]">
          {/* Inner container — same pattern as /homepage (max-w-container mx-auto) */}
          <div className="max-w-container mx-auto px-4 md:px-8 h-full flex items-center gap-4">
            {/* Hamburger (mobile only) */}
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu"
              className="md:hidden bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1.5 items-center justify-center"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="block w-[22px] h-[1.5px] rounded-sm bg-[#1a1a1a]" />
              ))}
            </button>

            {/* Global Search — minimal underline style */}
            <div ref={searchRef} className="relative flex-1 max-w-md">
              <div className="relative">
                <svg className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a8a8a]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                  className="w-full pl-6 pr-3 py-2 text-sm bg-transparent border-b border-transparent focus:border-[#9a7d4a] outline-none transition-colors placeholder:text-[#8a8a8a]/70 text-[#1a1a1a]"
                />
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-3 h-3 border border-[#9a7d4a] border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>

              {/* Search Dropdown */}
              {showSearchDropdown && searchQuery.trim().length >= 2 && (
                <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-[#e8e4df] shadow-lg max-h-[400px] overflow-y-auto z-[2000]">
                  {searchResults && (searchResults.orders.length > 0 || searchResults.products.length > 0 || searchResults.users.length > 0) ? (
                    <div className="py-2">
                      {/* Orders results */}
                      {searchResults.orders.length > 0 && (
                        <div>
                          <p className="px-4 py-1.5 text-[0.6rem] font-medium text-[#9a7d4a] uppercase tracking-[0.15em]">Orders</p>
                          {searchResults.orders.map((o) => (
                            <Link
                              key={o.id}
                              to="/orders-admin"
                              onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                              className="flex items-center justify-between px-4 py-2 hover:bg-[#f7f3ed] no-underline transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[#1a1a1a] truncate">
                                  #{shortId(o.id)} · {o.customer?.name || 'Customer'}
                                </p>
                                <p className="text-[0.65rem] text-[#8a8a8a] mt-0.5">
                                  {o.status} · {o.payment_status}
                                </p>
                              </div>
                              <span className="text-xs font-semibold text-[#9a7d4a] flex-shrink-0 ml-2">
                                Rp {(o.total_amount || 0).toLocaleString('id-ID')}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {/* Products results */}
                      {searchResults.products.length > 0 && (
                        <div>
                          <p className="px-4 py-1.5 text-[0.6rem] font-medium text-[#9a7d4a] uppercase tracking-[0.15em] border-t border-[#e8e4df]">Produk</p>
                          {searchResults.products.map((p) => (
                            <Link
                              key={p.id}
                              to="/products-admin"
                              onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                              className="flex items-center justify-between px-4 py-2 hover:bg-[#f7f3ed] no-underline transition-colors"
                            >
                              <span className="text-xs text-[#1a1a1a] truncate flex-1">{p.name}</span>
                              <span className={`text-[0.6rem] px-2 py-0.5 flex-shrink-0 ml-2 ${p.is_active ? 'bg-[#9a7d4a]/10 text-[#9a7d4a]' : 'bg-[#f7f3ed] text-[#8a8a8a]'}`}>
                                {p.is_active ? 'Aktif' : 'Nonaktif'}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {/* Users results (admin only) */}
                      {isAdmin && searchResults.users.length > 0 && (
                        <div>
                          <p className="px-4 py-1.5 text-[0.6rem] font-medium text-[#9a7d4a] uppercase tracking-[0.15em] border-t border-[#e8e4df]">User</p>
                          {searchResults.users.map((u) => (
                            <Link
                              key={u.id}
                              to="/users-admin"
                              onClick={() => { setShowSearchDropdown(false); setSearchQuery(''); }}
                              className="flex items-center justify-between px-4 py-2 hover:bg-[#f7f3ed] no-underline transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-[#1a1a1a] truncate">{u.full_name || u.email}</p>
                                <p className="text-[0.65rem] text-[#8a8a8a] truncate">{u.email}</p>
                              </div>
                              <span className="text-[0.6rem] px-2 py-0.5 bg-[#f7f3ed] text-[#3a3944] flex-shrink-0 ml-2 capitalize">{u.role}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : !searchLoading ? (
                    <div className="py-8 text-center">
                      <p className="text-xs text-[#8a8a8a]">Tidak ada hasil untuk "{searchQuery}"</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* === Right-side group: Notif + UserMenu (dipush ke kanan, align dengan container) === */}
            <div className="ml-auto flex items-center gap-2">
              {/* Notification Bell — admin notifications (order, review, return, alert) */}
              <div ref={notifRef} className="relative">
                <button
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    if (!showNotifDropdown && notifCount > 0) {
                      // Auto mark all read after 2s (let user see the notifications first)
                      setTimeout(() => markAllRead(), 2000);
                    }
                  }}
                  className="relative p-2 rounded-lg hover:bg-gray-100 cursor-pointer border-none bg-transparent transition-colors"
                  aria-label="Notifikasi"
                >
                  <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {notifCount > 0 && (
                    <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[0.6rem] font-bold rounded-full flex items-center justify-center">
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown */}
                {showNotifDropdown && (
                  <div className="absolute top-full mt-1 right-0 w-96 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-xl max-h-[450px] flex flex-col z-[2000]">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                      <h3 className="text-sm font-bold text-gray-900">Notifikasi</h3>
                      <div className="flex items-center gap-2">
                        {notifCount > 0 && (
                          <button
                            onClick={() => markAllRead()}
                            className="text-[0.65rem] text-blue-600 hover:underline cursor-pointer border-none bg-transparent"
                          >
                            Tandai semua dibaca
                          </button>
                        )}
                        <span className="text-[0.65rem] text-gray-400">{notifCount} belum dibaca</span>
                      </div>
                    </div>

                    {/* Notifications list */}
                    <div className="flex-1 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-3xl mb-2">🔔</p>
                          <p className="text-xs text-gray-400">Tidak ada notifikasi</p>
                        </div>
                      ) : (
                        notifications.map((n) => {
                          // Color per type
                          const bgUnread = n.type === 'order' ? 'bg-blue-50' :
                                          n.type === 'review' ? 'bg-amber-50' :
                                          n.type === 'return' ? 'bg-orange-50' :
                                          n.type === 'alert' ? 'bg-red-50' : '';
                          return (
                            <Link
                              key={n.id}
                              to={n.link || '#'}
                              onClick={() => setShowNotifDropdown(false)}
                              className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 no-underline border-b border-gray-50 last:border-0 transition-colors ${!n.is_read ? bgUnread : ''}`}
                            >
                              <span className="text-lg flex-shrink-0 mt-0.5">{n.icon}</span>
                              <div className="min-w-0 flex-1">
                                <p className={`text-xs ${!n.is_read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{n.title}</p>
                                {n.description && (
                                  <p className="text-[0.65rem] text-gray-500 mt-0.5 line-clamp-2">{n.description}</p>
                                )}
                                <p className="text-[0.6rem] text-gray-400 mt-1">
                                  {new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              {!n.is_read && (
                                <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 mt-1.5"></span>
                              )}
                            </Link>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* UserMenu */}
              <UserMenu variant="admin" />
            </div>
          </div>
        </header>

        {/* === Title Bar — cream accent background, editorial typography === */}
        <div className="bg-[#f7f3ed] border-b border-[#e8e4df]">
          <div className="px-6 md:px-10 py-6 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-medium text-[#1a1a1a] truncate tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{title}</h1>
              {subtitle && <p className="text-[0.7rem] text-[#8a8a8a] mt-1 uppercase tracking-[0.15em] hidden md:block">{subtitle}</p>}
            </div>
            {actions && <div className="flex gap-3 flex-shrink-0">{actions}</div>}
          </div>
        </div>

        {/* === Content — generous whitespace === */}
        <div className="px-6 md:px-10 py-8">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;