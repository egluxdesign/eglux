import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const CartContext = createContext(null);

const CART_KEY = 'eglux_cart';

export const rupiah = (n) => {
  if (n === null || n === undefined) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};

export const CartProvider = ({ children }) => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const toggleCart = useCallback(() => setIsCartOpen((open) => !open), []);

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem(CART_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  const totalQty   = cart.reduce((s, i) => s + i.qty, 0);
  const totalPrice = cart.reduce((s, i) => s + (i.price || 0) * i.qty, 0);

  const addItem = useCallback((product, variant, qty) => {
    setCart((prev) => {
      const variantId   = variant?.id ?? null;
      const variantName = variant?.name ?? null;
      const unitPrice    = variant?.price ?? product.price ?? 0;

      const existing = prev.find(
        (i) => i.productId === product.id && i.variantId === variantId
      );
      if (existing) {
        return prev.map((i) =>
          i === existing ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [
        ...prev,
        {
          id: Date.now(),
          productId: product.id,
          img: product.image,
          name: product.name,
          variantId,
          variantName,
          price: unitPrice,
          qty,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((id, delta) => {
    setCart((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i
      )
    );
  }, []);

  const removeItem = useCallback((id) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  return (
    <CartContext.Provider
      value={{
        cart,
        totalQty,
        totalPrice,
        addItem,
        updateQty,
        removeItem,
        clearCart,
        isCartOpen,
        toggleCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart harus digunakan di dalam CartProvider');
  return ctx;
};