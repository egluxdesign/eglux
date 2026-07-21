// src/hooks/useProducts.js
// ============================================================================
// [v3] Variant-as-source-of-truth + discount support + auto-refresh
// ============================================================================
// Features:
//   - Hapus base_price + weight_in_gram dari products (lihat SQL 028)
//   - Fetch discount fields per variant (discount_type, discount_value,
//     discount_start_at, discount_end_at)
//   - Compute discount price per variant (currentPrice, originalPrice,
//     discountPercent) — discount cuma aktif kalau dalam schedule
//   - Compute minDiscountPrice per product (untuk ProductCardFull display)
//
// ⭐ v3 Auto-refresh:
//   Product prices (especially discount prices) auto-refresh tanpa user refresh page:
//     - Setiap 60 detik (periodic refresh via setInterval)
//     - Saat tab browser dapat focus lagi (visibilitychange event)
//     - Manual via refreshProducts() function
//   Berguna saat discount expire/mulai saat user sedang browsing catalog.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const CATEGORY_LABELS = {
  kitchen:   'Kitchen',
  storage:   'Storage',
  homedecor: 'Home Decor',
  bathroom:  'Bathroom',
};

const toLabel = (category) =>
  CATEGORY_LABELS[category] ??
  category.charAt(0).toUpperCase() + category.slice(1);

const REFRESH_INTERVAL_MS = 60 * 1000; // 60 detik

// ⭐ Helper: compute discount price berdasarkan type + value + schedule
// Return: { isActive, currentPrice, originalPrice, discountPercent }
function computeVariantDiscount(variant) {
  const originalPrice = Number(variant?.price) || 0;

  if (!variant?.discount_type || !variant?.discount_value) {
    return {
      isActive: false,
      currentPrice: originalPrice,
      originalPrice,
      discountPercent: 0,
    };
  }

  // Cek schedule: discount cuma aktif kalau NOW() dalam range
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
    case 'percentage':
      currentPrice = Math.max(0, Math.round(originalPrice - (originalPrice * value / 100)));
      break;
    case 'nominal':
      currentPrice = Math.max(0, originalPrice - value);
      break;
    case 'final_price':
      currentPrice = Math.max(0, value);
      break;
    default:
      currentPrice = originalPrice;
  }

  const discountPercent = originalPrice > currentPrice
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : 0;

  return {
    isActive: discountPercent > 0,
    currentPrice,
    originalPrice,
    discountPercent,
  };
}

const useProducts = () => {
  const [products,      setProducts]      = useState([]);
  const [filterButtons, setFilterButtons] = useState([{ label: 'Semua', value: 'all' }]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  // ⭐ v3: Ref untuk prevent concurrent refresh
  const isRefreshingRef = useRef(false);

  // ⭐ v3: Extract load function jadi useCallback (reusable untuk periodic refresh)
  // isInitial = true → set loading=true (first load). false → silent refresh (gak show loading).
  const refreshProducts = useCallback(async (isInitial = false) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    if (isInitial) setLoading(true);

    try {
      const { data, error: productsError } = await supabase
        .from('products')
        .select(`
          id, name, slug, description, category, badge, is_active,
          created_at, updated_at,
          product_images ( id, url, position, is_primary, variant_id ),
          product_variants (
            id, name, attributes, price, stock, sku, is_active,
            weight_in_gram, length_cm, width_cm, height_cm,
            discount_type, discount_value, discount_start_at, discount_end_at
          )
        `)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (productsError) {
        setError(productsError);
        setLoading(false);
        isRefreshingRef.current = false;
        return;
      }

      // Bentuk ulang data produk
      const shaped = data
        .map((p) => {
          const nonVariantImages = (p.product_images || []).filter((img) => !img.variant_id);
          const primaryImage =
            nonVariantImages.find((img) => img.is_primary) || nonVariantImages[0] || (p.product_images || [])[0];

          const allVariants = p.product_variants || [];
          const activeVariants = allVariants.filter((v) => v.is_active);

          const variantsWithDiscount = activeVariants.map((v) => ({
            ...v,
            ...computeVariantDiscount(v),
          }));

          const currentPrices = variantsWithDiscount
            .map((v) => v.currentPrice)
            .filter((price) => price > 0);
          const minCurrentPrice = currentPrices.length > 0 ? Math.min(...currentPrices) : null;

          const originalPrices = variantsWithDiscount
            .map((v) => v.originalPrice)
            .filter((price) => price > 0);
          const minOriginalPrice = originalPrices.length > 0 ? Math.min(...originalPrices) : null;

          const hasActiveDiscount = variantsWithDiscount.some((v) => v.isActive);
          const maxDiscountPercent = Math.max(0, ...variantsWithDiscount.map((v) => v.discountPercent));

          const sortedVariants = [...variantsWithDiscount].sort((a, b) => {
            const priceA = Number(a.currentPrice) || 0;
            const priceB = Number(b.currentPrice) || 0;
            return priceA - priceB;
          });

          return {
            id:       p.id,
            name:     p.name,
            slug:     p.slug,
            desc:     p.description,
            category: p.category,
            badge:    p.badge,
            image:    primaryImage?.url || '',
            images:   p.product_images || [],
            variants: sortedVariants,
            minVariantPrice: minCurrentPrice,
            minOriginalPrice: minOriginalPrice,
            hasActiveDiscount,
            maxDiscountPercent,
            hasActiveVariant: activeVariants.length > 0,
            variantCount: allVariants.length,
            activeVariantCount: activeVariants.length,
            updated_at: p.updated_at,
          };
        })
        .filter((p) => p.hasActiveVariant);

      const uniqueCategories = [...new Set(shaped.map((p) => p.category).filter(Boolean))];
      const knownOrder = Object.keys(CATEGORY_LABELS);
      const sorted = [
        ...knownOrder.filter((c) => uniqueCategories.includes(c)),
        ...uniqueCategories.filter((c) => !knownOrder.includes(c)).sort(),
      ];
      const buttons = [
        { label: 'Semua', value: 'all' },
        ...sorted.map((c) => ({ label: toLabel(c), value: c })),
      ];

      setProducts(shaped);
      setFilterButtons(buttons);
      setLoading(false);
    } catch (e) {
      console.error('[useProducts] refresh error:', e);
      if (isInitial) setLoading(false);
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  // ⭐ v3: Initial load on mount
  useEffect(() => {
    refreshProducts(true);
  }, [refreshProducts]);

  // ⭐ v3: Periodic refresh (setiap 60 detik) — cek discount expire/start
  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshProducts(false);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [refreshProducts]);

  // ⭐ v3: Refresh saat tab browser dapat focus (visibilitychange)
  // User pindah tab → balik → discount mungkin expire/start selama di tab lain
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshProducts(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshProducts]);

  // Export helper + refreshProducts supaya bisa dipakai di komponen lain
  return { products, filterButtons, loading, error, computeVariantDiscount, refreshProducts };
};

export default useProducts;
