// src/components/admin/layout/AdminLayout.jsx
// ============================================================================
// AdminLayout — reusable layout untuk semua admin pages.
// Header = simple admin bar (hamburger + title + actions + UserMenu dropdown)
// Sidebar = slide-in dari kiri (minimalist)
//
// Pemakaian:
//   <AdminLayout title="Products Admin" subtitle="..." actions={<>...buttons...</>}>
//     {children}
//   </AdminLayout>
// ============================================================================

import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import ProfileModal from '../../ui/ProfileModal';
import TicketModal from '../../ui/TicketModal';

// ── Icons (line art, 1-color) ──
const ChevronDown = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconUser = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconPackage = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const IconTruck = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);
const IconClipboard = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);
const IconTicket = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" />
  </svg>
);
const IconWrench = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);
const IconLogOut = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ── Admin nav items ──
const ADMIN_NAV_ITEMS = [
  { label: 'Products Admin', href: '/products-admin' },
  // { label: 'Pesanan', href: '/admin/orders' },
  // { label: 'Customers', href: '/admin/customers' },
];

// ── UserMenu (sinkron dengan HeaderProducts.jsx — Tiket Bantuan pakai modal) ──
const UserMenu = () => {
  const { user, profile, role, isAdmin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/register" state={{ from: pathname }}
          className="text-[0.82rem] font-semibold text-eglux-primary hover:text-eglux-secondary transition-colors px-2">
          Daftar
        </Link>
        <Link to="/admin" state={{ from: pathname }}
          className="text-[0.82rem] font-semibold text-eglux-primary hover:text-eglux-secondary transition-colors px-2">
          Masuk
        </Link>
      </div>
    );
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Akun';
  // FIX: 'Tiket Bantuan' dihapus dari sini — sekarang jadi button modal
  // di bawah, bukan Link ke /tickets lagi. Sinkron dengan HeaderProducts.jsx.
  const menuItems = [
    { label: 'Pesanan Saya', href: '/orders', Icon: IconPackage },
    { label: 'Lacak Pesanan', href: '/track', Icon: IconTruck },
    { label: 'Riwayat Order', href: '/order-history', Icon: IconClipboard },
  ];
  const adminMenuItems = isAdmin
    ? [{ label: 'Admin Produk', href: '/products-admin', Icon: IconWrench }]
    : [];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-eglux-primary hover:text-eglux-secondary transition-colors cursor-pointer border-none bg-transparent"
      >
        {/* Avatar */}
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover border border-eglux-secondary/30" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-eglux-secondary flex items-center justify-center text-white text-xs font-bold">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="max-w-[80px] truncate hidden sm:inline">Hi, {displayName}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-[#eee] overflow-hidden z-[2000]">
          <div className="px-4 py-3 border-b border-[#eee] bg-[#faf6ef]">
            <p className="text-[0.82rem] font-bold text-eglux-primary truncate">{displayName}</p>
            <p className="text-[0.7rem] text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[0.6rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-eglux-secondary/10 text-eglux-secondary">
              {role}
            </span>
          </div>
          <div className="py-1">
            {adminMenuItems.length > 0 && (
              <>
                {adminMenuItems.map((item) => (
                  <Link key={item.href} to={item.href} onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[0.82rem] font-semibold text-eglux-secondary hover:bg-[#faf6ef] transition-colors">
                    <item.Icon className="w-4 h-4" />{item.label}
                  </Link>
                ))}
                <div className="border-t border-[#eee] my-1" />
              </>
            )}
            {/* Profil Saya — opens modal */}
            <button
              onClick={() => { setDropdownOpen(false); setProfileModalOpen(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-eglux-primary hover:bg-[#faf6ef] transition-colors cursor-pointer border-none bg-transparent text-left"
            >
              <IconUser className="w-4 h-4" />Profil Saya
            </button>
            {menuItems.map((item) => (
              <Link key={item.href} to={item.href} onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-eglux-primary hover:bg-[#faf6ef] transition-colors">
                <item.Icon className="w-4 h-4" />{item.label}
              </Link>
            ))}
            {/* Tiket Bantuan — opens modal (FIX: sebelumnya Link ke /tickets) */}
            <button
              onClick={() => { setDropdownOpen(false); setTicketModalOpen(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-eglux-primary hover:bg-[#faf6ef] transition-colors cursor-pointer border-none bg-transparent text-left"
            >
              <IconTicket className="w-4 h-4" />Tiket Bantuan
            </button>
          </div>
          <div className="border-t border-[#eee] py-1">
            <button
              onClick={async () => { await logout(); setDropdownOpen(false); navigate('/'); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-red-500 hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent"
            >
              <IconLogOut className="w-4 h-4" />Keluar
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
      <TicketModal isOpen={ticketModalOpen} onClose={() => setTicketModalOpen(false)} />
    </div>
  );
};

// ============================================================================
// AdminLayout (root)
// ============================================================================
const AdminLayout = ({ children, title = 'Admin', subtitle, actions }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPath = window.location.pathname;

  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    navigate('/admin', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* === Admin Sidebar === */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-[1500]" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white z-[1501] shadow-2xl flex flex-col
                    transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-bold text-eglux-primary uppercase tracking-wider">Admin Panel</span>
          <button onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none">✕</button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.href ? 'bg-eglux-primary text-white' : 'text-gray-700 hover:bg-eglux-accent'
              }`}>
              {item.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 my-3" />
          <Link to="/" onClick={() => setSidebarOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-eglux-accent transition-colors">
            Kembali ke Storefront
          </Link>
        </nav>

        {/* Footer: role + email + logout */}
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-sm font-bold text-eglux-primary uppercase tracking-wider">{role}</p>
          <p className="text-xs text-gray-500 truncate mb-2">{user?.email}</p>
          <button onClick={handleLogout}
            className="w-full px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border-none bg-transparent text-left">
            Keluar
          </button>
        </div>
      </aside>

      {/* === Admin Header Bar === */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          {/* Left: Hamburger + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} aria-label="Buka menu admin"
              className="p-2 min-w-[44px] min-h-[44px] flex flex-col gap-1 items-center justify-center cursor-pointer border-none bg-transparent">
              {[0,1,2].map((i) => (
                <span key={i} className="block w-5 h-[2px] bg-eglux-primary rounded-sm" />
              ))}
            </button>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold text-eglux-primary truncate">{title}</h1>
              {subtitle && <p className="text-xs text-gray-500 hidden md:block">{subtitle}</p>}
            </div>
          </div>

          {/* Right: Actions + UserMenu */}
          <div className="flex items-center gap-3">
            {actions && <div className="flex gap-2">{actions}</div>}
            <UserMenu />
          </div>
        </div>
      </div>

      {/* === Content === */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;