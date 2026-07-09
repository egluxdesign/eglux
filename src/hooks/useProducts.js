// src/hooks/useProducts.js
// ============================================================================
// [v2] Updated for variant-as-source-of-truth model
// ============================================================================
// Changes:
//   - Sort by updated_at DESC (Boss request: produk baru di-update muncul atas)
//   - Fetch variant weight + dimensions (weight_in_gram, length_cm, width_cm, height_cm)
//   - Compute minVariantPrice per product (for ProductCardFull display)
//   - Filter: only include products yang punya ≥1 ACTIVE variant
//     (produk dengan semua variant inactive → hide dari catalog)
// ============================================================================

import { useState, useEffect } from 'react';
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

const useProducts = () => {
  const [products,      setProducts]      = useState([]);
  const [filterButtons, setFilterButtons] = useState([{ label: 'Semua', value: 'all' }]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  useEffect(() => {
    const load = async () => {
      // Fetch produk + foto + varian sekaligus
      // Sort by updated_at DESC (produk baru di-update muncul atas)
      const { data, error: productsError } = await supabase
        .from('products')
        .select(`
          id, name, slug, description, category, base_price, badge, is_active,
          created_at, updated_at,
          product_images ( url, position, is_primary, variant_id ),
          product_variants (
            id, name, attributes, price, stock, sku, is_active,
            weight_in_gram, length_cm, width_cm, height_cm
          )
        `)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (productsError) {
        setError(productsError);
        setLoading(false);
        return;
      }

      // Bentuk ulang data produk
      const shaped = data
        .map((p) => {
          // Filter gambar: AMBIL GAMBAR YANG BUKAN MILIK VARIAN
          const nonVariantImages = (p.product_images || []).filter((img) => !img.variant_id);
          const primaryImage =
            nonVariantImages.find((img) => img.is_primary) || nonVariantImages[0] || (p.product_images || [])[0];

          // Filter variant yang active saja untuk display
          const allVariants = p.product_variants || [];
          const activeVariants = allVariants.filter((v) => v.is_active);

          // Compute min price dari active variants (price > 0)
          const variantPrices = activeVariants
            .map((v) => Number(v.price))
            .filter((price) => price > 0);
          const minVariantPrice = variantPrices.length > 0 ? Math.min(...variantPrices) : null;

          // Sort variants by price ascending (cheapest first)
          const sortedVariants = [...allVariants].sort((a, b) => {
            const priceA = Number(a.price) || 0;
            const priceB = Number(b.price) || 0;
            return priceA - priceB;
          });

          return {
            id:       p.id,
            name:     p.name,
            slug:     p.slug,
            desc:     p.description,
            category: p.category,
            price:    Number(p.base_price),     // base_price = display anchor (struck-through)
            badge:    p.badge,
            image:    primaryImage?.url || '',
            images:   p.product_images || [],
            variants: sortedVariants,
            // New fields for display logic
            minVariantPrice,                    // harga termurah variant (null kalau tidak ada active variant)
            hasActiveVariant: activeVariants.length > 0,
            variantCount: allVariants.length,
            activeVariantCount: activeVariants.length,
            updated_at: p.updated_at,
          };
        })
        // Filter: hanya tampilkan produk yang punya ≥1 active variant
        // (produk dengan semua variant inactive → hide dari catalog)
        .filter((p) => p.hasActiveVariant);

      // Bangun filter buttons dari kategori yang benar-benar ada di database
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
    };

    load();
  }, []);

  return { products, filterButtons, loading, error };
};

export default useProducts;
