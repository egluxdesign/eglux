import { useState, useCallback, createContext, useContext } from 'react';
import { useCart }    from '../context/CartContext';
import { useToast }   from '../hooks/useToast';
import CartPanel      from '../components/ui/CartPanel';
import CheckoutModal  from '../components/ui/CheckoutModal';
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

  const handleAddToCart = useCallback((product, variant, qty) => {
    addItem(product, variant, qty);
    showToast('Produk ditambahkan ke keranjang ✓');
  }, [addItem, showToast]);

  const handleCheckoutNow = useCallback((product, variant, qty) => {
    clearCart();
    addItem(product, variant, qty);
    setCheckoutOpen(true);
    document.body.style.overflow = 'hidden';
  }, [clearCart, addItem]);

  return (
    <CartActionsContext.Provider value={{ openCart, handleAddToCart, handleCheckoutNow }}>
      {children}

      <CartPanel
        isOpen={cartOpen}
        onClose={closeCart}
        onCheckout={openCheckout}
      />

      {checkoutOpen && (
        <CheckoutModal
          isOpen={checkoutOpen}
          onClose={closeCheckout}
          showToast={showToast}
        />
      )}

      <Toast toast={toast} />
    </CartActionsContext.Provider>
  );
};

export default CartPage;