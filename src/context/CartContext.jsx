// src/context/CartContext.jsx
// ============================================================================
// [v3] Variant-as-source-of-truth + discount-aware + auto-refresh prices
// ============================================================================
//
// ⭐ v3 NEW: Auto-refresh cart prices
//   Cart item prices (especially discount prices) dapat berubah saat:
//     1. Discount expire (end_at < NOW) → harga balik normal
//     2. Discount mulai (start_at < NOW) → harga turun
//     3. Admin ubah variant price/discount → harga update
//
//   Triggers re-fetch dari DB:
//     - Setiap 60 detik (periodic refresh)
//     - Saat cart drawer dibuka
//     - Saat tab browser dapat focus lagi (visibilitychange)
//     - Manual via recomputeCartPrices() function
//
//   recomputeCartPrices() akan:
//     - Fetch semua variant IDs dari cart dari DB
//     - Recompute current price (discount-aware) per variant
//     - Update cart items: price, originalPrice, isDiscounted, discountPercent
//     - Skip items yang gak punya variantId (defensive)
// ============================================================================

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const CartContext = createContext(null);

const CART_KEY = 'eglux_cart';
const REFRESH_INTERVAL_MS = 60 * 1000; // 60 detik

export const rupiah = (n) => {
  if (n === null || n === undefined) return '—';
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};

// ⭐ Helper: compute discount price berdasarkan type + value + schedule
// (Sama logic dengan useProducts.js + ProductModal.jsx)
function computeVariantDiscount(variant) {
  const originalPrice = Number(variant?.price) || 0;
  if (!variant?.discount_type || !variant?.discount_value) {
    return { isActive: false, currentPrice: originalPrice, originalPrice, discountPercent: 0 };
  }
  const now = new Date();
  const startAt = variant.discount_start_at ? new Date(variant.discount_start_at) : null;
  const endAt = variant.discount_end_at ? new Date(variant.discount_end_at) : null;
  if (startAt && now < startAt) {
    return { isActive: false, currentPrice: originalPrice, originalPrice, discountPercent: 0 };
  }
  if (endAt && now > endAt) {
    return { isActive: false, currentPrice: originalPrice, originalPrice, discountPercent: 0 };
  }
  const value = Number(variant.discount_value);
  let currentPrice = originalPrice;
  switch (variant.discount_type) {
    case 'percentage':  currentPrice = Math.max(0, Math.round(originalPrice - (originalPrice * value / 100))); break;
    case 'nominal':     currentPrice = Math.max(0, originalPrice - value); break;
    case 'final_price': currentPrice = Math.max(0, value); break;
    default:            currentPrice = originalPrice;
  }
  const discountPercent = originalPrice > currentPrice
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;
  return { isActive: discountPercent > 0, currentPrice, originalPrice, discountPercent };
}

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

  // ============================================================================
  // ⭐ v3 NEW: recomputeCartPrices — re-fetch variant prices dari DB
  // ============================================================================
  // Fetch semua variant IDs yang ada di cart, query DB untuk harga terbaru +
  // discount fields, lalu update cart items.
  //
  // Triggers:
  //   - Setiap 60 detik (periodic refresh via setInterval)
  //   - Saat cart drawer dibuka (triggered dari CartDrawer)
  //   - Saat tab browser dapat focus (visibilitychange event)
  //   - Manual call via recomputeCartPrices()
  // ============================================================================
  const isRefreshingRef = useRef(false);

  const recomputeCartPrices = useCallback(async () => {
    // Prevent concurrent refresh
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      // Get current cart snapshot (avoid stale closure)
      const currentCart = await new Promise((resolve) => {
        setCart((prev) => {
          resolve(prev);
          return prev; // don't change state, just read
        });
      });

      if (!currentCart || currentCart.length === 0) {
        isRefreshingRef.current = false;
        return;
      }

      // Collect unique variant IDs dari cart items
      const variantIds = [...new Set(
        currentCart
          .map((item) => item.variantId)
          .filter(Boolean) // skip null/undefined
      )];

      if (variantIds.length === 0) {
        isRefreshingRef.current = false;
        return;
      }

      // Fetch latest variant data dari DB (price + discount fields + stock + weight)
      const { data: variants, error } = await supabase
        .from('product_variants')
        .select(`
          id, name, price, stock, weight_in_gram,
          length_cm, width_cm, height_cm,
          discount_type, discount_value, discount_start_at, discount_end_at
        `)
        .in('id', variantIds);

      if (error) {
        console.warn('[CartContext] recomputeCartPrices: fetch error', error.message);
        isRefreshingRef.current = false;
        return;
      }

      // Build map: variantId → computed discount info
      const variantMap = new Map();
      (variants || []).forEach((v) => {
        variantMap.set(v.id, {
          ...v,
          ...computeVariantDiscount(v),
        });
      });

      // Update cart items dengan latest prices
      let hasChanges = false;
      setCart((prev) => {
        const updated = prev.map((item) => {
          if (!item.variantId) return item; // skip items without variantId
          const latestVariant = variantMap.get(item.variantId);
          if (!latestVariant) return item; // variant not found in DB (maybe deleted) — keep as is

          const newPrice = latestVariant.currentPrice;
          const newOriginalPrice = latestVariant.originalPrice;
          const newIsDiscounted = latestVariant.isActive;
          const newDiscountPercent = latestVariant.discountPercent;

          // Cek apakah ada perubahan
          if (
            item.price === newPrice &&
            item.originalPrice === newOriginalPrice &&
            item.isDiscounted === newIsDiscounted &&
            item.discountPercent === newDiscountPercent
          ) {
            return item; // no change
          }

          hasChanges = true;
          return {
            ...item,
            price: newPrice,
            originalPrice: newOriginalPrice,
            isDiscounted: newIsDiscounted,
            discountPercent: newDiscountPercent,
            // Also update weight/dimensions kalau berubah
            weight_in_gram: Number(latestVariant.weight_in_gram) || item.weight_in_gram,
            length_cm: Number(latestVariant.length_cm) || item.length_cm,
            width_cm: Number(latestVariant.width_cm) || item.width_cm,
            height_cm: Number(latestVariant.height_cm) || item.height_cm,
          };
        });

        return hasChanges ? updated : prev;
      });

      if (hasChanges) {
        console.log('[CartContext] ✓ Cart prices recomputed (changes detected)');
      }
    } catch (e) {
      console.warn('[CartContext] recomputeCartPrices error:', e.message);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // ============================================================================
  // ⭐ v3 NEW: Periodic refresh (setiap 60 detik)
  // ============================================================================
  useEffect(() => {
    if (cart.length === 0) return; // skip kalau cart kosong

    const intervalId = setInterval(() => {
      recomputeCartPrices();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [cart.length, recomputeCartPrices]);

  // ============================================================================
  // ⭐ v3 NEW: Refresh saat tab browser dapat focus (visibilitychange)
  // ============================================================================
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && cart.length > 0) {
        // Tab jadi visible lagi → recompute prices (discount mungkin expire selama user di tab lain)
        recomputeCartPrices();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [cart.length, recomputeCartPrices]);

  // ============================================================================
  // ⭐ v3 NEW: Refresh saat cart drawer dibuka
  // ============================================================================
  useEffect(() => {
    if (isCartOpen && cart.length > 0) {
      // Cart drawer dibuka → recompute prices (defensive)
      recomputeCartPrices();
    }
  }, [isCartOpen, cart.length, recomputeCartPrices]);

  // ============================================================================
  // ⭐ v3 NEW: Initial refresh on mount (kalau cart ada saved data dari localStorage)
  // ============================================================================
  useEffect(() => {
    if (cart.length > 0) {
      // Delay 500ms supaya gak conflict dengan initial render
      const timeoutId = setTimeout(() => {
        recomputeCartPrices();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // ============================================================================
  // Existing functions (addItem, updateQty, removeItem, clearCart)
  // ============================================================================

  const addItem = useCallback((product, variant, qty) => {
    setCart((prev) => {
      const variantId   = variant?.id ?? null;
      const variantName = variant?.name ?? null;

      // ⚠️ PRICE: always from variant, NO fallback to product.price
      // (variant = source of truth per Boss's redesign)
      // ⭐ v3: variant.price SEKARANG adalah harga SETELAH discount (dari ProductModal)
      // Simpan originalPrice juga untuk strike-through display di cart
      const unitPrice = Number(variant?.price) || 0;
      const originalPrice = Number(variant?.originalPrice) || unitPrice;
      const isDiscounted = Boolean(variant?.isDiscounted) && originalPrice > unitPrice;
      const discountPercent = Number(variant?.discountPercent) || 0;

      // ⚠️ WEIGHT: from variant, fallback to product.weight_in_gram (defense in depth)
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
          price: unitPrice,              // ⭐ v3: harga SETELAH discount (untuk total calc)
          originalPrice,                 // ⭐ v3: harga asli (untuk strike display)
          isDiscounted,                  // ⭐ v3: flag diskon aktif
          discountPercent,               // ⭐ v3: persen off (untuk badge)
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
        totalWeightInGram,
        addItem,
        updateQty,
        removeItem,
        clearCart,
        isCartOpen,
        toggleCart,
        recomputeCartPrices,  // ⭐ v3 NEW: expose untuk manual trigger
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
