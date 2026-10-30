// src/pages/CartPage.jsx
// ============================================================================
// CartPage — Provider component yang wrap seluruh app.
// Manage state cart panel + checkout modals + toast notifications.
// Provide action functions lewat CartActionsContext.
//
// [v3] Switch dari Midtrans → DOKU Checkout:
//   - Import & render CheckoutModalDoku (bukan CheckoutModalMidtrans)
//   - State variables tetap pakai nama 'midtransCheckoutOpen' untuk backward
//     compat dengan consumer components (cuma nama, fungsional jalan ke DOKU)
//
// [FIX] Auth-gated checkout:
//   - Semua fungsi checkout cek auth DULU.
//   - Kalau belum login → simpan intent di sessionStorage + redirect ke /admin.
//   - Setelah login berhasil → useEffect auto-open checkout modal yang sesuai.
//
// Cara pakai (di App.jsx):
//   <CartPage>
//     <Routes>...</Routes>
//   </CartPage>
// ============================================================================

import { useState, useCallback, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart }    from '../context/CartContext';
import { useAuth }    from '../context/AuthContext';
import { useToast }   from '../hooks/useToast';
import CartPanel      from '../components/ui/CartPanel';
import CheckoutModal         from '../components/ui/CheckoutModal';
import CheckoutModalDoku     from '../components/ui/CheckoutModalDoku';
import TicketModal    from '../components/ui/TicketModal';
import Toast          from '../components/ui/Toast';

// ── Checkout intent key ──
// Dipakai di sessionStorage sebagai flag supaya setelah login, modal checkout
// yang sesuai bisa auto-open. Value: 'whatsapp' atau 'midtrans' (legacy name,
// sekarang opens DOKU modal).
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
  const [midtransCheckoutOpen, setMidtransCheckoutOpen] = useState(false); // modal Bayar Sekarang (DOKU — nama variabel legacy)
  const [ticketOpen,   setTicketOpen]   = useState(false);           // modal Tiket Bantuan

  // ── Auth helper ──
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

  // DOKU checkout (CheckoutModalDoku) — "Bayar Sekarang"
  // Nama variabel tetap 'midtrans' untuk backward compat dengan consumer components.
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

  // ── "Beli sekarang" versi langsung ke pembayaran DOKU (auth-gated) ──
  // Nama tetap 'handleCheckoutNowMidtrans' untuk backward compat.
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
        openTicket: () => {
          if (!user) {
            try { sessionStorage.setItem(CHECKOUT_INTENT_KEY, 'ticket'); } catch (e) {}
            setCartOpen(false);
            document.body.style.overflow = '';
            navigate('/admin', {
              state: { from: location.pathname + location.search },
              replace: true,
            });
            return;
          }
          setTicketOpen(true);
          document.body.style.overflow = 'hidden';
        },
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
        <CheckoutModalDoku
          isOpen={midtransCheckoutOpen}
          onClose={closeMidtransCheckout}
          showToast={showToast}
        />
      )}

      {/* ⭐ TicketModal — global, muncul di atas page manapun */}
      <TicketModal
        isOpen={ticketOpen}
        onClose={() => { setTicketOpen(false); document.body.style.overflow = ''; }}
      />

      <Toast toast={toast} onClose={closeToast} />
    </CartActionsContext.Provider>
  );
};

export default CartPage;
