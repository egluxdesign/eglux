// src/components/layout/HeaderProducts.jsx
import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { NAV_LINKS } from '../../data';
import { useCart } from '../../context/CartContext';

const CartIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      d="M6 8h2.5l2.1 9.4a2 2 0 0 0 1.9 1.6h8a2 2 0 0 0 1.9-1.5l1.6-6.5H9.5M13 24a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M20 24a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0" fill="none"/>
  </svg>
);
const ShopeeIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path fill="currentColor" d="M25.08,10.89c0-.22-.17-.39-.39-.39h-4.22c-.1-2.75-2.07-4.95-4.48-4.95s-4.37,2.19-4.48,4.95h-4.22c-.21,0-.38.18-.38.39,0,.01,0,.02,0,.03h0l.6,13.27s0,.07,0,.11c0,0,0,.02,0,.03v.03s0,0,0,0c.09.92.76,1.67,1.67,1.7h0s13.46,0,13.46,0h0c.93-.03,1.68-.78,1.76-1.71h0s0-.01,0-.01c0,0,0-.02,0-.03,0-.02,0-.05,0-.07l.66-13.32h0s0-.01,0-.02ZM16,6.75c1.75,0,3.19,1.67,3.25,3.75h-6.5c.07-2.08,1.5-3.75,3.25-3.75ZM19.33,20.9c-.12.98-.72,1.77-1.64,2.17-.52.22-1.21.34-1.75.3-.85-.03-1.66-.24-2.39-.62-.26-.14-.66-.41-.96-.66-.08-.06-.09-.1-.04-.18.03-.04.08-.11.19-.28.16-.24.18-.27.2-.29.05-.08.14-.09.22-.02t.02.01s.01.01.05.04c.03.03.05.04.06.05.8.62,1.73.98,2.66,1.02,1.3-.02,2.24-.6,2.41-1.5.19-.99-.59-1.85-2.11-2.32-.48-.15-1.68-.63-1.9-.76-1.04-.61-1.53-1.41-1.46-2.4.11-1.37,1.38-2.39,2.99-2.4.72,0,1.44.15,2.13.44.24.1.68.34.83.45.09.06.1.14.05.22-.03.05-.07.12-.17.27h0c-.13.2-.13.21-.16.26-.05.08-.11.08-.2.03-.74-.5-1.56-.74-2.45-.76-1.12.02-1.96.69-2.01,1.6-.01.82.6,1.42,1.93,1.87,2.7.87,3.73,1.88,3.53,3.48Z"/>
  </svg>
);
const TikTokIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path fill="currentColor" d="M13.77,14.38v-.78c-.27-.04-.54-.07-.82-.07-2.64,0-4.98,1.71-5.78,4.23-.79,2.52.14,5.27,2.31,6.78-2.28-2.44-2.15-6.26.29-8.53,1.09-1.01,2.51-1.59,3.99-1.62h0Z"/>
    <path fill="currentColor" d="M13.92,23.18c1.48,0,2.69-1.17,2.76-2.64V7.36h2.41c-.05-.28-.07-.55-.07-.83h-3.29v13.16c-.05,1.48-1.27,2.66-2.76,2.66-.44,0-.88-.11-1.27-.32.52.72,1.35,1.14,2.23,1.15h0ZM23.58,11.83v-.73c-.89,0-1.75-.26-2.49-.75.65.75,1.52,1.27,2.49,1.48Z"/>
    <path fill="currentColor" d="M21.09,10.35c-.73-.83-1.13-1.89-1.13-2.99h-.88c.23,1.23.95,2.31,2.01,2.99h0ZM12.96,16.83c-1.53,0-2.76,1.25-2.75,2.78,0,1.02.57,1.96,1.48,2.43-.89-1.23-.62-2.96.62-3.85.47-.34,1.04-.52,1.62-.52.28,0,.55.05.82.13v-3.35c-.27-.04-.54-.06-.82-.06h-.15v2.55c-.27-.07-.54-.1-.82-.1h0Z"/>
    <path fill="currentColor" d="M23.58,11.83v2.55c-1.64,0-3.24-.52-4.57-1.48v6.69c0,3.34-2.72,6.04-6.06,6.04-1.24,0-2.45-.38-3.46-1.1,2.27,2.44,6.1,2.58,8.54.31,1.23-1.14,1.93-2.75,1.93-4.42v-6.67c1.33.95,2.93,1.47,4.57,1.46v-3.28c-.32,0-.64-.04-.96-.1h0Z"/>
    <path fill="currentColor" d="M19.02,19.59v-6.69c1.33.96,2.93,1.47,4.57,1.46v-2.55c-.97-.2-1.84-.72-2.5-1.46-1.05-.68-1.78-1.76-2.01-2.99h-2.41v13.18c-.06,1.53-1.35,2.71-2.87,2.65-.85-.03-1.63-.45-2.13-1.14-1.35-.71-1.87-2.38-1.16-3.73.48-.9,1.41-1.47,2.43-1.48.28,0,.55.05.82.13v-2.59c-3.33.06-5.99,2.84-5.93,6.18.03,1.51.62,2.95,1.65,4.05,1.02.69,2.24,1.05,3.47,1.03,3.34,0,6.05-2.7,6.06-6.04Z"/>
  </svg>
);
const InstagramIcon = () => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
    <path fill="currentColor" d="M19.85,6.36h-7.7c-3.19,0-5.79,2.6-5.79,5.79v7.7c0,3.19,2.6,5.79,5.79,5.79h7.7c3.19,0,5.79-2.6,5.79-5.79v-7.7c0-3.19-2.6-5.79-5.79-5.79ZM23.83,19.85c0,2.2-1.78,3.98-3.98,3.98h-7.7c-2.2,0-3.98-1.78-3.98-3.98v-7.7c0-2.2,1.78-3.98,3.98-3.98h7.7c2.2,0,3.98,1.78,3.98,3.98v7.7Z"/>
    <circle fill="currentColor" cx="21.11" cy="10.93" r="1.13"/>
    <path fill="currentColor" d="M16.08,11.25c-2.62,0-4.75,2.14-4.75,4.76s2.13,4.75,4.75,4.75,4.75-2.13,4.75-4.75-2.13-4.76-4.75-4.76ZM16.08,19.04c-1.68,0-3.04-1.36-3.04-3.04s1.36-3.05,3.04-3.05,3.04,1.37,3.04,3.05-1.36,3.04-3.04,3.04Z"/>
  </svg>
);

const NavLinks = () => {
  const { pathname } = useLocation();
  return (
    <>
      {NAV_LINKS.map((link) => (
        <Link key={link.href} to={link.href}
           className={`nav-link ${link.href === pathname ? 'active' : ''}`}>
          {link.label}
        </Link>
      ))}
    </>
  );
};

// ✅ Hanya terima onCartOpen dari props — tidak pakai useCart().openCart
const HeaderProducts = ({ onCartOpen }) => {
  const { totalQty } = useCart();   // hanya untuk badge angka
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [primaryNavHidden, setPrimaryNavHidden] = useState(false);
  const [navStuck, setNavStuck] = useState(false);
  const primaryNavRef = useRef(null);
  const duplicateNavRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      const scrollY = window.scrollY;
      const headerHeight = headerRef.current?.offsetHeight ?? 60;
      const dupTop = duplicateNavRef.current?.getBoundingClientRect().top ?? 0;
      const triggerPoint = dupTop + scrollY - headerHeight;
      const primBottom = primaryNavRef.current?.getBoundingClientRect().bottom ?? 1;
      setPrimaryNavHidden(primBottom <= 0);
      setNavStuck(scrollY >= triggerPoint);
      ticking = false;
    };
    const handle = () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    };
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header ref={headerRef} className="sticky top-0 left-0 right-0 bg-white z-[1000] shadow-header">
        <div className="max-w-container mx-auto px-8 flex items-center justify-between h-[60px]">

          {/* Hamburger */}
          <button onClick={() => setSidebarOpen(true)} aria-label="Buka menu kategori"
            className="bg-transparent border-none cursor-pointer p-2 flex flex-col gap-1 transition-all duration-300 z-10">
            {[0,1,2].map((i) => (
              <span key={i} className="block w-[22px] h-[2px] bg-eglux-primary rounded-sm transition-all duration-300" />
            ))}
          </button>

          {/* Logo centered */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2" aria-label="EGLUX Beranda">
            <img src="/src/assets/img/Logo1.png" alt="Eglux Logo" className="h-12 w-auto" />
          </Link>

          {/* Right icons */}
          <div className="flex items-center gap-1.5 ml-auto">
            <button onClick={() => window.open('https://www.instagram.com/eglux_id','_blank')} aria-label="Instagram"
              className="bg-transparent border-none cursor-pointer p-0.5 flex items-center text-eglux-primary hover:text-eglux-secondary transition-colors duration-300">
              <InstagramIcon />
            </button>
            <button onClick={() => window.open('https://shopee.co.id/eglux','_blank')} aria-label="Shopee"
              className="bg-transparent border-none cursor-pointer p-0.5 flex items-center text-eglux-primary hover:text-eglux-secondary transition-colors duration-300">
              <ShopeeIcon />
            </button>
            <button onClick={() => window.open('https://www.tiktok.com/@eglux_id','_blank')} aria-label="TikTok"
              className="bg-transparent border-none cursor-pointer p-0.5 flex items-center text-eglux-primary hover:text-eglux-secondary transition-colors duration-300">
              <TikTokIcon />
            </button>

            {/* ✅ Cart — pakai onCartOpen dari props */}
            <button onClick={onCartOpen} aria-label="Keranjang Belanja"
              className="relative bg-transparent border-none cursor-pointer p-0.5 flex items-center text-eglux-primary hover:text-eglux-secondary transition-colors duration-300">
              <CartIcon />
              <span className={`absolute -top-1 -right-1 bg-eglux-secondary text-white text-[0.6rem]
                               font-bold w-4 h-4 rounded-full flex items-center justify-center
                               transition-all duration-200
                               ${totalQty > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}>
                {totalQty}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Nav */}
        <nav ref={primaryNavRef}
          className={`bg-white border-t border-b border-[#eee] will-change-transform
                      transition-[transform,opacity] duration-[400ms]
                      ${primaryNavHidden ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'}`}>
          <div className="max-w-container mx-auto px-8 flex items-center justify-center gap-12 md:gap-8 h-12 overflow-x-auto no-scrollbar">
            <NavLinks />
          </div>
        </nav>
      </header>
    </>
  );
};

export default HeaderProducts;