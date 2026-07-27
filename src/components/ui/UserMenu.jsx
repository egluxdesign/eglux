// src/components/ui/UserMenu.jsx
// ============================================================================
// UserMenu — Shared component untuk avatar dropdown (dipakai HeaderProducts + AdminLayout)
// ============================================================================
//
// Props:
//   - variant: 'storefront' | 'admin' (default: 'storefront')
//     - 'storefront': text color depends on isScrolled (transparent header support)
//     - 'admin': always dark text (admin header always white)
//
// Extracted dari HeaderProducts.jsx supaya gak ada duplikasi code.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileModal from './ProfileModal';

// ── Icons ──
const IconUser = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const IconPackage2 = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
  </svg>
);
const IconTruck = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="3" width="15" height="13" />
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
);
const IconClipboard = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);
const IconTicket = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
    <path d="M9 5v14" />
  </svg>
);
const IconLogOut = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// ============================================================================
// UserMenu component
// ============================================================================
const UserMenu = ({ variant = 'storefront', isScrolled = true }) => {
  const { user, profile, logout, isAdmin } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  // ⭐ 'admin' variant: selalu dark text (header admin selalu putih)
  //   'storefront' variant: text color depends on isScrolled
  const textColor = variant === 'admin'
    ? 'text-eglux-primary'
    : (isScrolled ? 'text-eglux-primary' : 'text-white');
  const avatarBg = variant === 'admin'
    ? 'bg-eglux-secondary/10 text-eglux-secondary'
    : (isScrolled ? 'bg-eglux-secondary/10 text-eglux-secondary' : 'bg-white/20 text-white');

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2 md:gap-3">
        <Link
          to="/admin"
          className={`text-[0.65rem] md:text-[0.72rem] font-medium uppercase tracking-[0.1em] no-underline transition-colors duration-500 ${textColor} hover:opacity-70 whitespace-nowrap`}
        >
          Masuk
        </Link>
        <Link
          to="/register"
          className={`text-[0.65rem] md:text-[0.72rem] font-medium uppercase tracking-[0.1em] no-underline transition-colors duration-500 ${variant === 'admin' ? 'text-eglux-secondary' : (isScrolled ? 'text-eglux-secondary' : 'text-white/80')} hover:opacity-70 whitespace-nowrap hidden xs:inline-block sm:inline-block`}
        >
          Daftar
        </Link>
      </div>
    );
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Akun';

  // User account menu items
  const USER_MENU_ITEMS = [
    { label: 'Profil Saya', href: null, icon: IconUser, action: () => { setDropdownOpen(false); setProfileModalOpen(true); } },
    { label: 'Pesanan Saya', href: '/orders', icon: IconPackage2 },
    { label: 'Lacak Pesanan', href: '/track', icon: IconTruck },
    { label: 'Riwayat Order', href: '/order-history', icon: IconClipboard },
    { label: 'Tiket Bantuan', href: '/tickets', icon: IconTicket },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`flex items-center gap-1.5 transition-colors duration-500 cursor-pointer border-none bg-transparent relative z-[2100] ${textColor} hover:opacity-70`}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${avatarBg}`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-[#eee] overflow-hidden z-[2000]">
          {/* Header with name + email + role */}
          <div className="px-4 py-3 border-b border-[#eee] bg-[var(--eglux-accent)]">
            <p className="text-[0.78rem] font-medium text-eglux-primary truncate">{displayName}</p>
            <p className="text-[0.68rem] text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1 text-[0.55rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-eglux-secondary/10 text-eglux-secondary">
              {profile?.role || 'verified'}
            </span>
          </div>

          {/* Admin panel link (atas, hanya untuk admin) */}
          {isAdmin && (
            <div className="py-1">
              <a href="/products-admin" className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] font-semibold text-eglux-secondary hover:bg-eglux-secondary/5 transition-colors no-underline">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                Admin Panel
              </a>
            </div>
          )}

          {/* User account menu */}
          <div className="py-1">
            {USER_MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              if (item.action) {
                return (
                  <button key={item.label} onClick={item.action} className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors cursor-pointer border-none bg-transparent text-left">
                    <Icon className="w-4 h-4" /> {item.label}
                  </button>
                );
              }
              return (
                <a key={item.label} href={item.href} className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline">
                  <Icon className="w-4 h-4" /> {item.label}
                </a>
              );
            })}
          </div>

          {/* Extra space before logout */}
          <div className="h-3 bg-white" />

          {/* Logout */}
          <div className="border-t border-[#eee] py-1">
            <button onClick={async () => { await logout(); setDropdownOpen(false); window.location.href = '/'; }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-red-500 hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent">
              <IconLogOut className="w-4 h-4" /> Keluar
            </button>
          </div>
        </div>
      )}
      {profileModalOpen && <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />}
    </div>
  );
};

export default UserMenu;
