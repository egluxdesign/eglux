// src/pages/CartPage.jsx
import { useState, useCallback, createContext, useContext } from 'react';
import { useCart }    from '../context/CartContext';
import { useToast }   from '../hooks/useToast';
import CartPanel      from '../components/ui/CartPanel';
import CheckoutModal         from '../components/ui/CheckoutModal';
import CheckoutModalMidtrans from '../components/ui/CheckoutModalMidtrans';
import Toast          from '../components/ui/Toast';

export const CartActionsContext = createContext(null);
export const useCartActions = () => {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error('useCartActions harus dipakai di dalam <CartPage>');
  return ctx;
};

const CartPage = ({ children }) => {
  const { addItem, clearCart } = useCart();
  const { toast, showToast }   = useToast();

  const [cartOpen,     setCartOpen]     = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);          // modal WhatsApp (CheckoutModal)
  const [midtransCheckoutOpen, setMidtransCheckoutOpen] = useState(false); // modal Bayar Sekarang (Midtrans)

  const openCart = useCallback(() => {
    setCartOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeCart = useCallback(() => {
    setCartOpen(false);
    document.body.style.overflow = '';
  }, []);

  const openCheckout = useCallback(() => {
    setCartOpen(false);
    setCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeCheckout = useCallback(() => {
    setCheckoutOpen(false);
    document.body.style.overflow = '';
  }, []);

  const openMidtransCheckout = useCallback(() => {
    setCartOpen(false);
    setMidtransCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, []);

  const closeMidtransCheckout = useCallback(() => {
    setMidtransCheckoutOpen(false);
    document.body.style.overflow = '';
  }, []);

  const handleAddToCart = useCallback((product, variant, qty) => {
    addItem(product, variant, qty);
    showToast('Produk ditambahkan ke keranjang ✓');
  }, [addItem, showToast]);

  // "Beli sekarang" langsung ke checkout WhatsApp (perilaku lama, gak berubah)
  const handleCheckoutNow = useCallback((product, variant, qty) => {
    clearCart();
    addItem(product, variant, qty);
    setCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [clearCart, addItem]);

  // "Beli sekarang" versi langsung ke pembayaran Midtrans
  const handleCheckoutNowMidtrans = useCallback((product, variant, qty) => {
    clearCart();
    addItem(product, variant, qty);
    setMidtransCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [clearCart, addItem]);

  return (
    <CartActionsContext.Provider
      value={{
        openCart,
        handleAddToCart,
        handleCheckoutNow,
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

      <Toast toast={toast} />
    </CartActionsContext.Provider>
  );
};

export default CartPage;