// src/components/layout/StorefrontLayout.jsx
// ============================================================================
// StorefrontLayout — parent layout untuk halaman storefront (product page, dll).
//
// Komponen ini menggabungkan:
//   1. HeaderProducts     — header dengan logo, nav, cart icon, user menu
//   2. CartDrawer          — slide-out cart panel (auth-gated checkout)
//   3. Toast               — notifikasi singkat
//   4. <Outlet /> atau children — content halaman
//
// State management:
//   - isCartOpen      — buka/tutup cart drawer
//   - toast           — notifikasi yang sedang tampil
//   - Auth + Cart     — di-handle oleh AuthContext + CartContext (Provider di App.jsx)
//
// Auth-gated checkout flow:
//   1. User belum login, klik cart icon → CartDrawer buka
//   2. Klik "Bayar Sekarang" di CartDrawer → cek auth:
//      - Kalau belum login → simpan flag di sessionStorage + redirect ke /admin
//      - Kalau sudah login → buka CheckoutModalMidtrans (di-render internal di CartDrawer)
//   3. User login di /admin → AdminPage redirect balik ke page asal (state.from)
//   4. CartDrawer useEffect deteksi flag + user login → auto-buka CheckoutModalMidtrans
//
// Pemakaian:
//   <StorefrontLayout>
//     <ProductsSection />
//   </StorefrontLayout>
//
//   ATAU dengan react-router Outlet:
//   <StorefrontLayout />  ← children di-render via <Outlet />
// ============================================================================

import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import HeaderProducts from './HeaderProducts';
import CartDrawer from './CartDrawer';
import Toast from '../ui/Toast';
import { useToast } from '../../hooks/useToast';

const StorefrontLayout = ({ children }) => {
  // ── Cart drawer state ──
  // State lokal di sini (BUKAN pakai CartContext.isCartOpen) supaya
  // lebih mudah di-control dari parent. HeaderProducts manggil onCartOpen,
  // CartDrawer manggil onClose — semua lewat sini.
  const [isCartOpen, setIsCartOpen] = useState(false);

  // ── Toast state ──
  const { toast, showToast, closeToast } = useToast();

  const openCart = useCallback(() => setIsCartOpen(true), []);
  const closeCart = useCallback(() => setIsCartOpen(false), []);

  return (
    <>
      {/* ── Header ── */}
      <HeaderProducts onCartOpen={openCart} />

      {/* ── Page content ──
          Kalau pakai react-router nested routes, gunakan <Outlet />.
          Kalau pakai children prop, render children. */}
      {children ?? <Outlet />}

      {/* ── Cart Drawer ──
          Render di sini (bukan di tiap page) supaya:
          - State isCartOpen shared antara header & drawer
          - Auto-open checkout modal setelah login bisa di-trigger
          - Cart items persistent lewat CartContext (localStorage) */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={closeCart}
        showToast={showToast}
      />

      {/* ── Toast notification ── */}
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
};

export default StorefrontLayout;
