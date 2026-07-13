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

  return (
    <div ref={wrapperRef} className="min-h-[48px]">
      <nav
        id="duplicateNav"
        className={`duplicate-nav${isStuck ? ' stuck' : ''}`}
        aria-label="Navigasi kategori (sticky)"
      >
        <div className="max-w-container mx-auto px-2 md:px-8 flex items-center justify-center gap-0.5 md:gap-8 h-12">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`nav-link text-[0.65rem] px-1.5 md:text-[0.8rem] md:px-4 whitespace-nowrap${activeKey === link.key ? ' active' : ''}`}
              aria-current={activeKey === link.key ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default DuplicateNav;
