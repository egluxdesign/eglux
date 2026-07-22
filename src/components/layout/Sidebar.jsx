// src/components/layout/Sidebar.jsx
// ============================================================================
// Sidebar panel dengan kategori, submenu, dan background image per item.
// v3: Pakai react-router useNavigate + parse filter dari href
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SIDEBAR_CATEGORIES } from '../../data';

// ── Helper: parse filter value dari href ──
// Contoh: '/?filter=kitchen' → 'kitchen', '/' → 'all'
function parseFilter(href) {
  if (!href) return null;
  try {
    const url = new URL(href, window.location.origin);
    return url.searchParams.get('filter') || 'all';
  } catch {
    return null;
  }
}

// ── Single menu item ──────────────────────────────────────────
const SidebarItem = ({ item, onNavigate }) => {
  const [submenuOpen, setSubmenuOpen] = useState(false);

  // ⭐ Handler: klik item → navigate ke /?filter=xxx + close sidebar
  const handleClick = (e, href) => {
    e.preventDefault();
    const filter = parseFilter(href);
    if (filter) {
      onNavigate(filter);
    } else {
      // Fallback: navigate to href directly
      onNavigate('all');
    }
  };

  if (item.hasSubmenu) {
    return (
      <li className="relative flex flex-col border-b border-[#f0f0f0] min-h-[100px]">
        {/* Background Image */}
        <div
          className={`absolute inset-0 bg-cover bg-center transition-all duration-300 z-[1]
                      ${submenuOpen ? 'opacity-100 scale-105' : 'opacity-40'}`}
          style={{ backgroundImage: `url('${item.image}')` }}
          aria-hidden="true"
        />
        {/* Gradient Overlay */}
        <div
          className="absolute inset-0 z-[1]"
          style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.2) 20%, rgba(49,41,8,0) 100%)' }}
          aria-hidden="true"
        />
        {/* Toggle Button */}
        <button
          onClick={() => setSubmenuOpen((v) => !v)}
          className="relative z-[2] flex items-center justify-center w-full min-h-[100px] px-8
                     text-eglux-primary text-[1.1rem] font-semibold uppercase tracking-[2px]
                     transition-all duration-300 hover:pl-10 bg-transparent border-none cursor-pointer"
        >
          <span>{item.label}</span>
          <span
            className={`absolute right-8 top-1/2 -translate-y-1/2 text-[1.6rem] text-eglux-primary
                        transition-transform duration-300 pointer-events-none
                        ${submenuOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>

        {/* Submenu */}
        <ul
          className={`overflow-hidden transition-[max-height] duration-300 ease-in-out bg-white w-full
                      ${submenuOpen ? 'max-h-[300px]' : 'max-h-0'}`}
        >
          {item.submenu.map((sub) => (
            <li key={sub.href} className="relative overflow-hidden border-b border-[#eee] last:border-b-0">
              <a
                href={sub.href}
                onClick={(e) => handleClick(e, sub.href)}
                className="block py-4 pl-12 pr-8 text-eglux-primary no-underline text-[0.85rem]
                           font-medium uppercase tracking-[1.5px] transition-all duration-300
                           border-l-[3px] border-transparent hover:border-eglux-secondary hover:pl-24
                           relative z-[2] cursor-pointer"
              >
                {sub.label}
              </a>
            </li>
          ))}
        </ul>
      </li>
    );
  }

  return (
    <li className="relative overflow-hidden border-b border-[#f0f0f0] h-[100px] flex items-center group">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 transition-all duration-300 z-[1]
                   group-hover:opacity-100 group-hover:scale-105"
        style={{ backgroundImage: `url('${item.image}')` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-[1]"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.2) 20%, rgba(49,41,8,0) 100%)' }}
        aria-hidden="true"
      />
      <a
        href={item.href}
        onClick={(e) => handleClick(e, item.href)}
        className="group relative z-[2] flex items-center justify-center w-full h-full px-8
                   text-eglux-primary no-underline text-[1.1rem] font-semibold uppercase tracking-[2px]
                   transition-all duration-300 hover:pl-10 cursor-pointer"
      >
        <span className="relative z-[2]">{item.label}</span>
      </a>
    </li>
  );
};

// ── Sidebar Panel ─────────────────────────────────────────────
const Sidebar = ({ isOpen, onClose }) => {
  const navigate = useNavigate();

  // ⭐ Handler: navigate ke /?filter=xxx + close sidebar
  const handleNavigate = (filter) => {
    navigate(`/?filter=${filter}`);
    onClose?.();
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[1001] transition-all duration-300
                    ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 left-0 w-full md:w-[420px] lg:w-[542px] h-screen bg-white z-[1002]
                    overflow-y-auto flex flex-col transition-transform duration-[400ms]
                    ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Kategori Produk"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-[#eee]">
          <h3 className="text-eglux-primary text-[0.85rem] font-semibold uppercase tracking-[3px]">
            Categories
          </h3>
          <button
            onClick={onClose}
            aria-label="Tutup sidebar"
            className="bg-transparent border-none text-eglux-primary text-[1.8rem] cursor-pointer
                       opacity-60 hover:opacity-100 hover:text-eglux-secondary transition-all duration-300
                       w-8 h-8 flex items-center justify-center leading-none"
          >
            &times;
          </button>
        </div>

        {/* Menu */}
        <ul className="list-none flex-1 m-0 p-0">
          {SIDEBAR_CATEGORIES.map((item) => (
            <SidebarItem key={item.label} item={item} onNavigate={handleNavigate} />
          ))}
        </ul>
      </aside>
    </>
  );
};

export default Sidebar;
