// src/components/layout/HeaderProducts.jsx
// ============================================================================
// HeaderProducts — Pomelo Fashion style scroll-stick behavior.
//
// Struktur (3 lapis):
//   ┌─────────────────────────────────────────────────────────┐
//   │ Header (top bar): [☰]  [LOGO]  [User] [Cart]           │  ← STICKY top:0
//   ├─────────────────────────────────────────────────────────┤
//   │ Primary nav (top bubble): Beranda | Produk | Blog | ... │  ← NOT sticky, scroll away
//   ├─────────────────────────────────────────────────────────┤
//   │ [Swiper container placeholder — user akan tambah]       │  ← scroll away
//   ├─────────────────────────────────────────────────────────┤
//   │ Duplicate nav (content sticky): Beranda | Produk | ...  │  ← STICKY saat ditemui header
//   └─────────────────────────────────────────────────────────┘
//
// Scroll behavior (Pomelo style):
//   1. Awal (belum scroll): header sticky di top, primary nav di bawah header
//      (natural flow), duplicate nav jauh di bawah (belum kelihatan).
//   2. User scroll ke bawah: header tetap sticky di top. Primary nav & swiper
//      scroll ke atas (lewati header, hilang dari viewport).
//   3. Saat duplicate nav naik & top-nya mencapai bottom header (dupTop <=
//      headerHeight), navStuck = true → class 'stuck' ditambahkan ke dup nav.
//      CSS user akan set position:fixed; top:<headerHeight> → dup nav menempel
//      tepat di bawah header. Keduanya sticky bersama-sama.
//   4. User scroll balik ke atas: dupTop > headerHeight → navStuck = false →
//      dup nav kembali ke normal flow.
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProfileModal from '../ui/ProfileModal';
import { NAV_LINKS } from '../../data';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

const CartIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      d="M6 8h2.5l2.1 9.4a2 2 0 0 0 1.9 1.6h8a2 2 0 0 0 1.9-1.5l1.6-6.5H9.5M13 24a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M20 24a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0" fill="none"/>
  </svg>
);

const ChevronDown = ({ className = '' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// ── Minimalist 1-color line icons (stroke=currentColor, no fill) ──
const IconUser = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconPackage = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4 7.5 4.21" />
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
    <path d="M13 5v2" />
    <path d="M13 17v2" />
    <path d="M13 11v2" />
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

// ── Line Art Icons untuk mobile nav (minimalist 1-color) ──
const NavIconHome = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const NavIconProduct = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);
const NavIconBlog = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);
const NavIconAbout = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const NavIconContact = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
  </svg>
);
const NavIconAffiliate = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

// Map key → icon component
const NAV_ICONS = {
  home: NavIconHome,
  products: NavIconProduct,
  blog: NavIconBlog,
  about: NavIconAbout,
  contact: NavIconContact,
  affiliate: NavIconAffiliate,
};

const NavLinks = () => {
  const { pathname } = useLocation();
  return (
    <>
      {NAV_LINKS.map((link) => {
        const Icon = NAV_ICONS[link.key];
        return (
          <Link key={link.href} to={link.href}
             className={`nav-link flex items-center justify-center px-2 md:px-4 whitespace-nowrap ${link.href === pathname ? 'active' : ''}`}>
            {/* Mobile: icon saja */}
            <span className="md:hidden"><Icon /></span>
            {/* Desktop: text saja */}
            <span className="hidden md:inline">{link.label}</span>
          </Link>
        );
      })}
    </>
  );
};

// ── User Menu Dropdown ───────────────────────────────────────
const UserMenu = () => {
  const { user, profile, role, isAdmin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
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

  const menuItems = [
    { label: 'Pesanan Saya', href: '/orders', Icon: IconPackage },
    { label: 'Lacak Pesanan', href: '/track', Icon: IconTruck },
    { label: 'Riwayat Order', href: '/order-history', Icon: IconClipboard },
    { label: 'Tiket Bantuan', href: '/tickets', Icon: IconTicket },
  ];

  const adminMenuItems = isAdmin
    ? [{ label: 'Admin Produk', href: '/products-admin', Icon: IconWrench }]
    : [];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-1.5 text-[0.82rem] font-semibold text-eglux-primary hover:text-eglux-secondary transition-colors cursor-pointer border-none bg-transparent relative z-[2100]"
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
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[0.82rem] font-semibold text-eglux-secondary hover:bg-[#faf6ef] transition-colors"
                  >
                    <item.Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                ))}
                <div className="border-t border-[#eee] my-1" />
              </>
            )}

            {/* Profil Saya — opens modal (bukan navigate) */}
            <button
              onClick={() => { setDropdownOpen(false); setProfileModalOpen(true); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-eglux-primary hover:bg-[#faf6ef] transition-colors cursor-pointer border-none bg-transparent text-left"
            >
              <IconUser className="w-4 h-4" />
              Profil Saya
            </button>

            {menuItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-eglux-primary hover:bg-[#faf6ef] transition-colors"
              >
                <item.Icon className="w-4 h-4" />
                {item.label}
              </Link>
            ))}
          </div>

          <div className="border-t border-[#eee] py-1">
            <button
              onClick={async () => {
                await logout();
                setDropdownOpen(false);
                navigate('/');
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[0.82rem] text-red-500 hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent"
            >
              <IconLogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />
    </div>
  );
};

// ============================================================================
// HeaderProducts (root)
// ============================================================================
const HeaderProducts = ({ onCartOpen }) => {
  const { totalQty } = useCart();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* ── 1. Header (top bar) — STICKY top:0 ──
          Selalu sticky di top. Hanya berisi top bar (logo, user, cart).
          Primary nav dikeluarkan dari sini supaya scroll away natural. */}
      <header className="sticky top-0 left-0 right-0 bg-white z-[1000] shadow-header">
        <div className="max-w-container mx-auto px-4 md:px-8 flex items-center justify-between h-[60px]">

          {/* Hamburger */}
          <button onClick={() => setSidebarOpen(true)} aria-label="Buka menu kategori"
            className="bg-transparent border-none cursor-pointer p-2.5 min-w-[44px] min-h-[44px] flex flex-col gap-1 items-center justify-center transition-all duration-300 z-10">
            {[0,1,2].map((i) => (
              <span key={i} className="block w-[22px] h-[2px] bg-eglux-primary rounded-sm transition-all duration-300" />
            ))}
          </button>

          {/* Logo centered */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2" aria-label="EGLUX Beranda">
            <img src="/src/assets/img/Logo1.png" alt="Eglux Logo" className="h-12 w-auto" />
          </Link>

          {/* Right icons: UserMenu + Cart */}
          <div className="flex items-center gap-2 md:gap-3 ml-auto relative z-[1100]">
            <UserMenu />
            <button onClick={onCartOpen} aria-label="Keranjang Belanja"
              className="relative bg-transparent border-none cursor-pointer p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-eglux-primary hover:text-eglux-secondary transition-colors duration-300">
              <CartIcon />
              <span className={`absolute top-1 right-1 bg-eglux-secondary text-white text-[0.6rem]
                               font-bold w-4 h-4 rounded-full flex items-center justify-center
                               transition-all duration-200
                               ${totalQty > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>
                {totalQty}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. Primary nav (top bubble navigation) — NOT sticky ──
          Ada di normal document flow. Saat user scroll, primary nav akan
          scroll ke atas & lewati sticky header (visual: hilang dari viewport).
          Inilah "top bubble navigation" ala Pomelo.
          Tanpa border-bottom biar nempel langsung ke Swiper di bawahnya (no gap). */}
      <nav className="bg-white">
        <div className="max-w-container mx-auto px-4 md:px-8 flex items-center justify-evenly md:justify-center gap-2 md:gap-8 h-12 overflow-hidden">
          <NavLinks />
        </div>
      </nav>

      {/* ── 3. Swiper container ──
          Carousel banner/promo sebagai jeda antara primary nav (top bubble)
          dan duplicate nav (content sticky). Scroll away natural (TIDAK sticky).
          Slides bisa di-custom lewat props, default pakai 3 banner contoh.

          CATATAN: DuplicateNav TIDAK dirender di sini. DuplicateNav dirender
          di tiap page (BlogPage, AboutPage, ContactPage, dll) setelah hero
          section — supaya posisinya fleksibel mengikuti struktur tiap page.
          DuplicateNav handle scroll detection-nya sendiri (self-contained). */}
      
    </>
  );
};

export default HeaderProducts;
