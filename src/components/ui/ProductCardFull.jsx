// src/components/ui/ProductCardFull.jsx
// ============================================================================
// [v3.1] Shopee/Tokopedia-style + defensive coding + debug logging
// ============================================================================
// Defensive: kalau minVariantPrice/hasActiveVariant undefined (props not passed),
// compute di tempat dari product.variants. Fallback ke base price kalau no variants.
//
// Debug: console.log product data di dev mode untuk troubleshooting.
// ============================================================================

import CartIcon from './CartIcon';

const formatRupiah = (amount) => {
  if (!amount && amount !== 0) return '—';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
};

const ProductCardFull = ({ product, onOpenModal }) => {
  // Defensive: kalau useProducts v2 belum deploy, compute minVariantPrice di tempat
  const variants = product?.variants || [];
  const activeVariants = variants.filter((v) => v.is_active);
  const variantPrices = activeVariants
    .map((v) => Number(v.price))
    .filter((p) => p > 0);

  // Gunakan dari props (useProducts v2) ATAU compute di tempat (defensive)
  const minVariantPrice = product?.minVariantPrice ??
    (variantPrices.length > 0 ? Math.min(...variantPrices) : null);
  const hasActiveVariant = product?.hasActiveVariant ?? activeVariants.length > 0;

  const { name, category, badge, desc, image } = product;
  const basePrice = Number(product?.price) || Number(product?.base_price) || 0;

  // Compute discount
  const hasDiscount = hasActiveVariant && minVariantPrice && basePrice > minVariantPrice;
  const discountPercent = hasDiscount
    ? Math.round(((basePrice - minVariantPrice) / basePrice) * 100)
    : 0;

  // ⭐ NEW: Review stats + sold count dari useProducts
  const avgRating = Number(product?.avgRating) || 0;
  const reviewCount = Number(product?.reviewCount) || 0;
  const soldCount = Number(product?.soldCount) || 0;

  // Format sold count untuk compact display (e.g., 1500 → "1.5rb", 1200000 → "1.2jt")
  const formatSoldCount = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'jt';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'rb';
    return String(n);
  };

  // Format rating untuk display (e.g., 4.5, 4.0 → "4.5", "4.0")
  const formatRating = (r) => r.toFixed(1);

  // Debug logging (remove setelah production)
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    console.log('[ProductCardFull]', name, {
      basePrice,
      minVariantPrice,
      hasActiveVariant,
      hasDiscount,
      discountPercent,
      variantCount: variants.length,
      activeVariantCount: activeVariants.length,
      avgRating,
      reviewCount,
      soldCount,
    });
  }

  return (
    <article
      className="group bg-white rounded-[20px] overflow-hidden cursor-pointer
                 border border-[#eee] transition-all duration-300
                 hover:-translate-y-2 hover:shadow-card-hover"
      onClick={() => onOpenModal(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenModal(product)}
      aria-label={`Lihat detail: ${name}`}
    >
      {/* === IMAGE === */}
      <div className="relative overflow-hidden h-[250px]">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {badge && (
          <span className="absolute top-4 left-4 bg-eglux-secondary text-white
                           text-[0.75rem] font-semibold py-1 px-3 rounded-full">
            {badge}
          </span>
        )}

        {hasDiscount && (
          <span className="absolute top-4 right-4 bg-red-500 text-white
                           text-[0.72rem] font-bold py-1 px-2 rounded-full shadow-sm">
            -{discountPercent}%
          </span>
        )}
      </div>

      {/* === INFO === */}
      <div className="p-6">
        <h4 className="text-base font-semibold text-eglux-primary mb-1 leading-snug line-clamp-2">
          {name}
        </h4>
        <p className="text-[0.85rem] text-[#666] mb-3 uppercase tracking-[0.5px]">{category}</p>

        {/* === PRICE BLOCK === */}
        <div className="mb-2">
          {hasActiveVariant && minVariantPrice ? (
            <>
              <p className="text-[0.65rem] text-[#999] uppercase tracking-[0.5px] mb-1">
                Mulai dari
              </p>
              <div className="flex items-baseline gap-2 flex-wrap">
                {hasDiscount && (
                  <span className="text-[0.78rem] text-[#999] line-through">
                    {formatRupiah(basePrice)}
                  </span>
                )}
                <span className="text-[1.15rem] font-bold text-eglux-secondary">
                  {formatRupiah(minVariantPrice)}
                </span>
              </div>
            </>
          ) : basePrice > 0 ? (
            /* Defensive fallback: tampilkan base price kalau no active variant */
            <span className="text-[1.1rem] font-bold text-eglux-secondary">
              {formatRupiah(basePrice)}
            </span>
          ) : (
            <p className="text-[0.95rem] font-semibold text-[#999]">
              Hubungi CS
            </p>
          )}
        </div>

        {/* ⭐ NEW: Rating + Sold Count (compact, inline) */}
        {/* Hanya tampil kalau ada review ATAU sold > 0 */}
        {(reviewCount > 0 || soldCount > 0) && (
          <div className="flex items-center gap-2 mb-2 text-[0.72rem]">
            {/* Rating stars + avg */}
            {reviewCount > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-amber-500" aria-label={`${formatRating(avgRating)} dari 5 bintang`}>
                  {'★'.repeat(Math.round(avgRating))}
                  <span className="text-gray-300">{'★'.repeat(5 - Math.round(avgRating))}</span>
                </span>
                <span className="font-semibold text-amber-600">{formatRating(avgRating)}</span>
                <span className="text-[#999]">({reviewCount})</span>
              </div>
            )}

            {/* Separator dot kalau both rating + sold ada */}
            {reviewCount > 0 && soldCount > 0 && (
              <span className="text-[#ccc]">·</span>
            )}

            {/* Sold count */}
            {soldCount > 0 && (
              <span className="text-[#666]">
                {formatSoldCount(soldCount)} terjual
              </span>
            )}
          </div>
        )}

        {desc && (
          <p className="text-[0.9rem] text-[#666] leading-relaxed line-clamp-2">{desc}</p>
        )}
      </div>
    </article>
  );
};

export default ProductCardFull;