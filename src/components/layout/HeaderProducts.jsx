// src/components/layout/HeaderProducts.jsx
// ============================================================================
// HeaderProducts v4.2 — Fixed: logo visible, nav links, proper layout
// ============================================================================
// Layout:
//   Desktop: [Logo left] [Nav center] [User+Cart right]
//   Mobile:  [Hamburger left] [Logo center] [Cart right]
//
// Transition: transparent → white when section touches header
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import Sidebar from './Sidebar';
import { NAV_LINKS } from '../../data';
import ProfileModal from '../ui/ProfileModal';
import '/src/assets/styles/eglux-design-system.css';

// ── Cart Icon ──
const CartIcon = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

// ── Icons ──
const IconHome = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>);
const IconPackage = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>);
const IconBook = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>);
const IconInfo = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>);
const IconMail = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>);
const IconUsers = () => (<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>);
const IconUser = ({ className = 'w-4 h-4' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>);
const IconLogOut = ({ className = 'w-4 h-4' }) => (<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
const IconPackage2 = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>);
const IconTruck = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>);
const IconClipboard = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg>);
const IconTicket = () => (<svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" /><path d="M9 5v14" /></svg>);

const NAV_ICONS = {
  home: IconHome, products: IconPackage, blog: IconBook,
  about: IconInfo, contact: IconMail, affiliate: IconUsers,
};
const NAV_LINKS_COMPACT = NAV_LINKS.filter((l) => l.key !== 'home');

// ── UserMenu ──
const UserMenu = ({ isScrolled }) => {
  const { user, profile, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const dropdownRef = useRef(null);

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
          className={`text-[0.65rem] md:text-[0.72rem] font-medium uppercase tracking-[0.1em] no-underline transition-colors duration-500 ${isScrolled ? 'text-eglux-primary' : 'text-white'} hover:opacity-70 whitespace-nowrap`}
        >
          Masuk
        </Link>
        <Link
          to="/register"
          className={`text-[0.65rem] md:text-[0.72rem] font-medium uppercase tracking-[0.1em] no-underline transition-colors duration-500 ${isScrolled ? 'text-eglux-secondary' : 'text-white/80'} hover:opacity-70 whitespace-nowrap hidden xs:inline-block sm:inline-block`}
        >
          Daftar
        </Link>
      </div>
    );
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Akun';
  const textColor = isScrolled ? 'text-eglux-primary' : 'text-white';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`flex items-center gap-1.5 transition-colors duration-500 cursor-pointer border-none bg-transparent relative z-[2100] ${textColor} hover:opacity-70`}
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${isScrolled ? 'bg-eglux-secondary/10 text-eglux-secondary' : 'bg-white/20 text-white'}`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-2xl border border-[#eee] overflow-hidden z-[2000]">
          <div className="px-4 py-3 border-b border-[#eee] bg-[var(--eglux-accent)]">
            <p className="text-[0.78rem] font-medium text-eglux-primary truncate">{displayName}</p>
            <p className="text-[0.68rem] text-gray-500 truncate">{user.email}</p>
          </div>
          <div className="py-1">
            {NAV_LINKS_COMPACT.map((item) => {
              const Icon = NAV_ICONS[item.key];
              return (
                <a key={item.href} href={item.href} className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline">
                  {Icon && <Icon />} {item.label}
                </a>
              );
            })}
            <div className="border-t border-[#eee] my-1" />
            <button onClick={() => { setDropdownOpen(false); setProfileModalOpen(true); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors cursor-pointer border-none bg-transparent text-left">
              <IconUser className="w-4 h-4" /> Profil Saya
            </button>
            <a href="/orders" className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline"><IconPackage2 /> Pesanan Saya</a>
            <a href="/track" className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline"><IconTruck /> Lacak Pesanan</a>
            <a href="/order-history" className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline"><IconClipboard /> Riwayat Order</a>
            <a href="/tickets" className="flex items-center gap-3 px-4 py-2.5 text-[0.78rem] text-eglux-primary hover:bg-[var(--eglux-accent)] transition-colors no-underline"><IconTicket /> Tiket Bantuan</a>
          </div>
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

// ============================================================================
// MAIN
// ============================================================================
const HeaderProducts = ({ onCartOpen }) => {
  const { totalQty } = useCart();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { pathname } = useLocation();

  // ⭐ Transition when section touches header
  useEffect(() => {
    const handleScroll = () => {
      const headerHeight = window.innerWidth >= 768 ? 72 : 60;
      const threshold = window.innerHeight - headerHeight;
      setIsScrolled(window.scrollY > threshold);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const headerBg = isScrolled ? 'bg-white' : 'bg-transparent';
  const headerShadow = isScrolled ? 'shadow-[0_1px_8px_rgba(0,0,0,0.06)]' : 'shadow-none';
  const textColor = isScrolled ? 'text-eglux-primary' : 'text-white';
  const hamburgerColor = isScrolled ? 'bg-eglux-primary' : 'bg-white';
  const logoFilter = isScrolled ? 'none' : 'brightness(0) invert(1)';
  const logoHeight = isScrolled ? 'h-8' : 'h-10 md:h-14';
  const navColor = isScrolled ? 'text-eglux-primary' : 'text-white';

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header
        className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-500 ease-out ${headerBg} ${headerShadow}`}
      >
        <div className="max-w-container mx-auto px-4 md:px-8 flex items-center justify-between h-[60px] md:h-[72px]">

          {/* ── LEFT: Hamburger only ── */}
          <div className="flex items-center flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu kategori"
              className="bg-transparent border-none cursor-pointer p-2 min-w-[40px] min-h-[40px] flex flex-col gap-1.5 items-center justify-center transition-all duration-500"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className={`block w-[20px] h-[1.5px] rounded-sm transition-all duration-500 ${hamburgerColor}`} />
              ))}
            </button>
          </div>

          {/* ── CENTER: Logo (always centered, absolute to prevent overlap) ── */}
          <Link
            to="/"
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-auto"
            aria-label="EGLUX Beranda"
          >
            <img
              src="/src/assets/img/Logo1.png"
              alt="Eglux Logo"
              className={`${logoHeight} w-auto max-w-[120px] transition-all duration-500 ease-out`}
              style={{ filter: logoFilter }}
            />
          </Link>

          {/* ── RIGHT: User/Login + Cart ── */}
          <div className="flex items-center gap-1 md:gap-4 flex-1 justify-end">

            <UserMenu isScrolled={isScrolled} />
            <button
              onClick={onCartOpen}
              aria-label="Keranjang Belanja"
              className={`relative bg-transparent border-none cursor-pointer p-2 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors duration-500 ${textColor} hover:opacity-70`}
            >
              <CartIcon className="w-5 h-5" />
              <span className={`absolute top-1 right-1 bg-eglux-secondary text-white text-[0.6rem] font-bold w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 ${totalQty > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>
                {totalQty}
              </span>
            </button>
          </div>
        </div>
      </header>
    </>
  );
};

export default HeaderProducts;
