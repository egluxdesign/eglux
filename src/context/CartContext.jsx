// src/context/CartContext.jsx
// ============================================================================
// [v2] Updated for variant-as-source-of-truth model
// ============================================================================
// Changes:
//   - Cart item now stores `weight_in_gram` (was: no weight field)
//   - Weight source: variant.weight_in_gram (fallback to product.weight_in_gram for safety)
//   - Price: always variant.price, NO fallback to product.price
//   - Optional: store length/width/height for Biteship volumetric calc
//   - Removed debug console.log
// ============================================================================

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

  // ⚠️ Total weight untuk Biteship rate calc (sum of variant weight × qty)
  const totalWeightInGram = cart.reduce(
    (s, i) => s + (Number(i.weight_in_gram) || 0) * i.qty,
    0
  );

  const addItem = useCallback((product, variant, qty) => {
    setCart((prev) => {
      const variantId   = variant?.id ?? null;
      const variantName = variant?.name ?? null;

      // ⚠️ PRICE: always from variant, NO fallback to product.price
      // (variant = source of truth per Boss's redesign)
      const unitPrice = Number(variant?.price) || 0;

      // ⚠️ WEIGHT: from variant, fallback to product.weight_in_gram (defense in depth)
      // Boss decision: A (keep product weight as fallback)
      const weightInGram =
        Number(variant?.weight_in_gram) ||
        Number(product?.weight_in_gram) ||
        0;

      // ⚠️ DIMENSIONS: from variant (optional, for Biteship volumetric calc)
      const lengthCm = Number(variant?.length_cm) || null;
      const widthCm  = Number(variant?.width_cm)  || null;
      const heightCm = Number(variant?.height_cm) || null;

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
          // ⚠️ NEW fields for shipping calc
          weight_in_gram: weightInGram,
          length_cm: lengthCm,
          width_cm: widthCm,
          height_cm: heightCm,
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
        totalWeightInGram,  // ← NEW export
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
