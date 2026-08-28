// src/components/admin/layout/AdminLayout.jsx
// ============================================================================
// AdminLayout — reusable layout untuk semua admin pages.
// ============================================================================
// Struktur:
//   - Header: [hamburger admin] [logo center] [UserMenu] — putih, fixed
//   - Title Bar: [title + subtitle + actions] — sticky di bawah header
//   - Sidebar: slide-in dari kiri (logo + nav: Products, Homepage, Kembali ke Storefront + logout)
//
// ⭐ UserMenu di-import dari shared component (sama dengan storefront) — gak ada
//    2 versi UserMenu lagi.
//
// Pemakaian:
//   <AdminLayout title="Products Admin" subtitle="..." actions={<>...buttons...</>}>
//     {children}
//   </AdminLayout>
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import UserMenu from '../../ui/UserMenu';
import logoImg from '../../../assets/img/Logo1.png';
import { ADMIN_PAGES, canAccess } from '../../../lib/permissions';

// ── Admin nav items (dari permissions.js ADMIN_PAGES) ──
// ⭐ Filter berdasarkan canAccess() — hidden kalau gak punya akses

// ============================================================================
// AdminLayout (root)
// ============================================================================
const AdminLayout = ({ children, title = 'Admin', subtitle, actions }) => {
  const { user, profile, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const currentPath = window.location.pathname;

  // ⭐ Filter nav items berdasarkan user permissions
  const visibleNavItems = ADMIN_PAGES.filter(page => canAccess(page.key, profile));

  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    window.location.href = '/admin';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* === Admin Header (fixed, putih) === */}
      {/* ⭐ Layout: [hamburger] [logo center] [UserMenu] — sama seperti HeaderProducts */}
      <header className="fixed top-0 left-0 right-0 z-[1000] bg-white shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-[60px] md:h-[72px]">

          {/* ── LEFT: Hamburger (buka admin sidebar) ── */}
          <div className="flex items-center flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu admin"
              className="bg-transparent border-none cursor-pointer p-2 min-w-[40px] min-h-[40px] flex flex-col gap-1.5 items-center justify-center transition-all duration-500"
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="block w-[20px] h-[1.5px] rounded-sm bg-eglux-primary" />
              ))}
            </button>
          </div>

          {/* ── CENTER: Logo (link ke storefront home) ── */}
          <Link
            to="/"
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-auto"
            aria-label="EGLUX Beranda"
          >
            <img
              src={logoImg}
              alt="Eglux Logo"
              className="h-8 w-auto max-w-[120px]"
            />
          </Link>

          {/* ── RIGHT: UserMenu (shared component — sama dengan storefront) ── */}
          <div className="flex items-center gap-1 md:gap-4 flex-1 justify-end">
            <UserMenu variant="admin" />
          </div>
        </div>
      </header>

      {/* === Admin Title Bar (sticky, di bawah header) === */}
      {/* ⭐ TANPA hamburger di sini — hamburger ada di header atas */}
      <div className="bg-white border-b border-gray-200 sticky top-[60px] md:top-[72px] z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-4">
          {/* Left: Title + Subtitle */}
          <div className="min-w-0">
            <h1 className="text-base md:text-xl font-bold text-eglux-primary truncate">{title}</h1>
            {subtitle && <p className="text-xs text-gray-500 hidden md:block">{subtitle}</p>}
          </div>

          {/* Right: Actions (Tombol tambah produk, export, dll — dipassing dari page) */}
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      </div>

      {/* === Admin Sidebar (slide-in dari kiri) === */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[1500]"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white z-[1501] shadow-2xl flex flex-col
                    transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Sidebar Header: logo + close button */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <Link to="/" onClick={() => setSidebarOpen(false)} className="flex items-center">
            <img
              src={logoImg}
              alt="Eglux Logo"
              className="h-7 w-auto"
            />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
          >
            ✕
          </button>
        </div>

        {/* Admin Panel label */}
        <div className="px-5 py-3 border-b border-gray-100">
          <span className="text-xs font-bold text-eglux-primary uppercase tracking-wider">Admin Panel</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                currentPath === item.href
                  ? 'bg-eglux-primary text-white'
                  : 'text-gray-700 hover:bg-eglux-accent'
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 my-3" />
          <Link
            to="/"
            onClick={() => setSidebarOpen(false)}
            className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-eglux-accent transition-colors"
          >
            ← Kembali ke Storefront
          </Link>
        </nav>

        {/* Footer: role + email + logout */}
        <div className="px-4 py-3 border-t border-gray-200">
          <p className="text-sm font-bold text-eglux-primary uppercase tracking-wider">{profile?.role || 'user'}</p>
          <p className="text-xs text-gray-500 truncate mb-3">{user?.email}</p>
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

      {/* === Content === */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 pt-24 md:pt-28">
        {children}
      </div>
    </div>
  );
};

export default AdminLayout;
