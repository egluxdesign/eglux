// src/components/layout/DuplicateNav.jsx
// ============================================================================
// DuplicateNav — content sticky navigation (ala Pomelo Fashion).
//
// Component ini SELF-CONTAINED:
//   - Handle scroll detection sendiri (gak perlu parent pass isStuck)
//   - Accept `activePage` prop untuk highlight navlink active
//   - Kalau `activePage` tidak di-pass, fallback ke useLocation pathname
//
// Cara kerja scroll detection:
//   - Ref di-attach ke WRAPPER div (tetap di normal flow, walaupun nav
//     di dalamnya jadi position:fixed saat stuck). Ini fix bug "stuck forever"
//     karena posisi wrapper tidak terpengaruh oleh nav menjadi fixed.
//   - Saat wrapper top <= header height (60px), set isStuck = true
//     → class 'stuck' ditambahkan → CSS set position:fixed; top:60px
//   - Saat scroll balik ke atas, wrapper top > 60 → isStuck = false
//     → nav kembali ke posisi normal
//
// Props:
//   activePage?: string — key NAV_LINKS yang mau di-highlight sebagai active.
//                          Contoh: "blog", "contact", "affiliate".
//                          Kalau tidak di-pass, auto-detect dari URL pathname.
//
// Pemakaian (pattern user):
//   <DuplicateNav />                    // activePage auto-detect dari URL
//   <DuplicateNav activePage="blog" />  // activePage manual override
// ============================================================================

import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { NAV_LINKS } from '../../data';

// Tinggi header (sticky top bar) — HARUS SAMA dengan h-[60px] di HeaderProducts.
// Kalau header height berubah, update ini juga.
const HEADER_HEIGHT = 60;

const DuplicateNav = ({ activePage }) => {
  const [isStuck, setIsStuck] = useState(false);
  // Ref ke wrapper div (TETAP di normal flow, walaupun nav jadi fixed).
  // Bukan ke <nav> sendiri — supaya posisi yang dibaca tidak terpengaruh
  // oleh nav menjadi position:fixed (yang bikin bug "stuck forever").
  const wrapperRef = useRef(null);
  const { pathname } = useLocation();

  // ── Scroll handler ──
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      const wrapperTop = wrapperRef.current?.getBoundingClientRect().top ?? Infinity;
      setIsStuck(wrapperTop <= HEADER_HEIGHT);
      ticking = false;
    };
    const handle = () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    };
    window.addEventListener('scroll', handle, { passive: true });
    onScroll(); // initial check
    return () => window.removeEventListener('scroll', handle);
  }, []);

  // ── Determine active link ──
  // Prioritas:
  //   1. activePage prop (manual override dari parent)
  //   2. useLocation pathname (auto-detect)
  const activeKey = activePage || (() => {
    // Cari NAV_LINKS yang href-nya cocok dengan pathname
    const match = NAV_LINKS.find((l) => l.href === pathname);
    return match?.key || null;
  })();

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

const NAV_ICONS = {
  home: NavIconHome,
  products: NavIconProduct,
  blog: NavIconBlog,
  about: NavIconAbout,
  contact: NavIconContact,
  affiliate: NavIconAffiliate,
};

  return (
    <div ref={wrapperRef} className="min-h-[48px]">
      <nav
        id="duplicateNav"
        className={`duplicate-nav${isStuck ? ' stuck' : ''}`}
        aria-label="Navigasi kategori (sticky)"
      >
        <div className="max-w-container mx-auto px-4 md:px-8 flex items-center justify-evenly md:justify-center gap-2 md:gap-8 h-12 overflow-hidden">
          {NAV_LINKS.map((link) => {
            const Icon = NAV_ICONS[link.key];
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`nav-link flex items-center justify-center px-2 md:px-4 whitespace-nowrap${activeKey === link.key ? ' active' : ''}`}
                aria-current={activeKey === link.key ? 'page' : undefined}
              >
                <span className="md:hidden"><Icon /></span>
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default DuplicateNav;
