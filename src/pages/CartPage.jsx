// src/pages/CartPage.jsx
// ============================================================================
// CartPage — Provider component yang wrap seluruh app.
// Manage state cart panel + checkout modals + toast notifications.
// Provide action functions lewat CartActionsContext.
//
// [FIX] Auth-gated checkout:
//   - Semua fungsi checkout (openCheckout, openMidtransCheckout,
//     handleCheckoutNow, handleCheckoutNowMidtrans) cek auth DULU.
//   - Kalau belum login → simpan intent di sessionStorage + redirect ke /admin.
//   - Setelah login berhasil → useEffect auto-open checkout modal yang sesuai.
//   - Intent values: 'whatsapp' (CheckoutModal) atau 'midtrans' (CheckoutModalMidtrans).
//
// Cara pakai (di App.jsx):
//   <CartPage>
//     <Routes>...</Routes>
//   </CartPage>
//
// Cara pakai useCartActions (di page manapun di dalam CartPage):
//   const { openCart, handleAddToCart, openMidtransCheckout } = useCartActions();
// ============================================================================

import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart }    from '../context/CartContext';
import { useAuth }    from '../context/AuthContext';
import { useToast }   from '../hooks/useToast';
import CartPanel      from '../components/ui/CartPanel';
import CheckoutModal         from '../components/ui/CheckoutModal';
import CheckoutModalMidtrans from '../components/ui/CheckoutModalMidtrans';
import Toast          from '../components/ui/Toast';

// ── Checkout intent key ──
// Dipakai di sessionStorage sebagai flag supaya setelah login, modal checkout
// yang sesuai bisa auto-open. Value: 'whatsapp' atau 'midtrans'.
export const CHECKOUT_INTENT_KEY = 'eglux_checkout_intent';

export const CartActionsContext = createContext(null);
export const useCartActions = () => {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error('useCartActions harus dipakai di dalam <CartPage>');
  return ctx;
};

const CartPage = ({ children }) => {
  const { addItem, clearCart } = useCart();
  const { user } = useAuth();
  const { toast, showToast, closeToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [cartOpen,     setCartOpen]     = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);          // modal WhatsApp (CheckoutModal)
  const [midtransCheckoutOpen, setMidtransCheckoutOpen] = useState(false); // modal Bayar Sekarang (Midtrans)

  // ── Auth helper ──
  // Cek apakah user sudah login. Kalau belum, simpan intent + redirect ke /admin.
  // Return true kalau sudah login (boleh lanjut checkout), false kalau di-redirect.
  const requireAuth = useCallback((intent = 'midtrans') => {
    if (user) return true;
    try { sessionStorage.setItem(CHECKOUT_INTENT_KEY, intent); } catch (e) {}
    setCartOpen(false);
    document.body.style.overflow = '';
    navigate('/admin', {
      state: { from: location.pathname + location.search },
      replace: true,
    });
    return false;
  }, [user, navigate, location]);

  // ── Auto-open checkout setelah login ──
  // Saat user berubah dari null → user object (setelah login/register),
  // cek apakah ada intent flag. Kalau ada, buka modal yang sesuai.
  useEffect(() => {
    if (!user) return;
    const intent = sessionStorage.getItem(CHECKOUT_INTENT_KEY);
    if (!intent) return;
    sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
    if (intent === 'midtrans') {
      setMidtransCheckoutOpen(true);
      document.body.style.overflow = 'hidden';
    } else if (intent === 'whatsapp') {
      setCheckoutOpen(true);
      document.body.style.overflow = 'hidden';
    }
  }, [user]);

  // ── Cart panel handlers ──
  const openCart = useCallback(() => {
    setCartOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeCart = useCallback(() => {
    setCartOpen(false);
    document.body.style.overflow = '';
  }, []);

  // ── Checkout handlers (auth-gated) ──
  // WhatsApp checkout (CheckoutModal)
  const openCheckout = useCallback(() => {
    if (!requireAuth('whatsapp')) return;
    setCartOpen(false);
    setCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [requireAuth]);

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    document.body.style.overflow = '';
  }, []);

  // Midtrans checkout (CheckoutModalMidtrans) — "Bayar Sekarang"
  const openMidtransCheckout = useCallback(() => {
    if (!requireAuth('midtrans')) return;
    setCartOpen(false);
    setMidtransCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [requireAuth]);

  const closeMidtransCheckout = useCallback(() => {
    setMidtransCheckoutOpen(false);
    document.body.style.overflow = '';
  }, []);

  // ── Add to cart ──
  const handleAddToCart = useCallback((product, variant, qty) => {
    addItem(product, variant, qty);
    showToast('Produk ditambahkan ke keranjang ✓');
  }, [addItem, showToast]);

  // ── "Beli sekarang" langsung ke checkout WhatsApp (auth-gated) ──
  const handleCheckoutNow = useCallback((product, variant, qty) => {
    if (!requireAuth('whatsapp')) return;
    clearCart();
    addItem(product, variant, qty);
    setCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [requireAuth, clearCart, addItem]);

  // ── "Beli sekarang" versi langsung ke pembayaran Midtrans (auth-gated) ──
  const handleCheckoutNowMidtrans = useCallback((product, variant, qty) => {
    if (!requireAuth('midtrans')) return;
    clearCart();
    addItem(product, variant, qty);
    setMidtransCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [requireAuth, clearCart, addItem]);

  return (
    <CartActionsContext.Provider
      value={{
        openCart,
        handleAddToCart,
        handleCheckoutNow,
        openCheckout,
        openMidtransCheckout,
        handleCheckoutNowMidtrans,
      }}
    >
      {children}

      <CartPanel
        isOpen={cartOpen}
        onClose={closeCart}
        onCheckout={openCheckout}
        onCheckoutMidtrans={openMidtransCheckout}
      />

      {checkoutOpen && (
        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={closeCheckout}
          showToast={showToast}
        />
      )}

      {midtransCheckoutOpen && (
        <CheckoutModalMidtrans
          isOpen={midtransCheckoutOpen}
          onClose={closeMidtransCheckout}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </CartActionsContext.Provider>
  );
};

export default CartPage;
