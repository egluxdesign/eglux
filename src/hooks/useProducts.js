BELS = {
  kitchen:   'Kitchen',
  storage:   'Storage',
  homedecor: 'Home Decor',
  bathroom:  'Bathroom',
};

const toLabel = (category) =>
  CATEGORY_LABELS[category] ??
  category.charAt(0).toUpperCase() + category.slice(1);

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
    // Belum mulai
    return { isActive: false, currentPrice: originalPrice, originalPrice, discountPercent: 0 };
  }
  if (endAt && now > endAt) {
    // Sudah expired
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

  useEffect(() => {
    const load = async () => {
      // ⭐ v3: Hapus base_price + weight_in_gram dari products select
      // Tambah discount_* fields di product_variants
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

          // ⭐ v3: Compute discount per variant (active variants only)
          // Hasil: variantsWithDiscount punya field: currentPrice, originalPrice, isActive, discountPercent
          // PLUS field original: id, name, price, stock, weight_in_gram, discount_type, dst.
          const variantsWithDiscount = activeVariants.map((v) => ({
            ...v,
            ...computeVariantDiscount(v),
          }));

          // Compute min CURRENT price (discount-aware) dari active variants
          const currentPrices = variantsWithDiscount
            .map((v) => v.currentPrice)
            .filter((price) => price > 0);
          const minCurrentPrice = currentPrices.length > 0 ? Math.min(...currentPrices) : null;

          // Compute min ORIGINAL price (untuk strike-through display)
          const originalPrices = variantsWithDiscount
            .map((v) => v.originalPrice)
            .filter((price) => price > 0);
          const minOriginalPrice = originalPrices.length > 0 ? Math.min(...originalPrices) : null;

          // Cek apakah ada variant dengan discount aktif
          const hasActiveDiscount = variantsWithDiscount.some((v) => v.isActive);

          // Compute max discount percent (untuk badge di card)
          const maxDiscountPercent = Math.max(0, ...variantsWithDiscount.map((v) => v.discountPercent));

          // ⭐ v3 FIX: Sort variantsWithDiscount (BUKAN allVariants) by CURRENT price ascending
          // Supaya ProductModal dapat variant dengan field currentPrice/originalPrice/discountPercent
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
            // ⭐ v3 FIX: variants = sortedVariants (dengan field discount_*)
            variants: sortedVariants,
            // v3: discount-aware fields untuk display
            minVariantPrice: minCurrentPrice,    // harga termurah variant (sudah dikurangi discount)
            minOriginalPrice: minOriginalPrice,   // harga termurah variant (sebelum discount)
            hasActiveDiscount,                    // ada variant dengan discount aktif?
            maxDiscountPercent,                   // persen diskon terbesar (untuk badge)
            hasActiveVariant: activeVariants.length > 0,
            variantCount: allVariants.length,
            activeVariantCount: activeVariants.length,
            updated_at: p.updated_at,
          };
        })
        // Filter: hanya tampilkan produk yang punya ≥1 active variant
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

  // Export helper supaya bisa dipakai di komponen lain (ProductModal, CartContext)
  return { products, filterButtons, loading, error, computeVariantDiscount };
};

export default useProducts;
