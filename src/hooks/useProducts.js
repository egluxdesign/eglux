// src/hooks/useProducts.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

// Mapping category value → label tampil di filter bar.
// Kalau ada kategori baru di database yang belum ada di sini,
// labelnya otomatis di-capitalize (fallback).
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
      const { data, error: productsError } = await supabase
        .from('products')
        .select(`
          id, name, slug, description, category, base_price, badge, is_active,
          product_images ( url, position, is_primary ),
          product_variants ( id, name, attributes, price, stock, sku, is_active )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (productsError) {
        setError(productsError);
        setLoading(false);
        return;
      }

      // Bentuk ulang data produk
      const shaped = data.map((p) => {
        // Filter dulu: AMBIL GAMBAR YANG BUKAN MILIK VARIAN
      const nonVariantImages = p.product_images.filter((img) => !img.variant_id);
      const primaryImage =
        nonVariantImages.find((img) => img.is_primary) || nonVariantImages[0] || p.product_images[0];
        return {
          id:       p.id,
          name:     p.name,
          slug:     p.slug,
          desc:     p.description,
          category: p.category,
          price:    p.base_price,
          badge:    p.badge,
          image:    primaryImage?.url || '',
          images:   p.product_images,
          variants: p.product_variants,
        };
      });

      // Bangun filter buttons dari kategori yang benar-benar ada di database,
      // urutan sesuai CATEGORY_LABELS (known first), sisanya alphabetical.
      const uniqueCategories = [...new Set(data.map((p) => p.category).filter(Boolean))];
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