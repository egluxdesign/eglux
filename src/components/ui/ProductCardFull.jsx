// src/components/ui/ProductCardFull.jsx
// ============================================================================
// [v3] Shopee/Tokopedia-style ProductCardFull — match ProductModal v4
// ============================================================================
// Changes from v2:
//   - Strike through base price (gray, small)
//   - Show minVariantPrice (large, gold/bold)
//   - Show discount % badge (red) if minVariantPrice < base
//   - "Mulai dari" label kecil di atas
//   - Remove "Buy Now" (replaced with price block)
//   - "Hubungi CS" fallback if no active variant
// ============================================================================

import CartIcon from './CartIcon';

// Format rupiah — fallback kalau rupiah dari CartContext belum di-import
const formatRupiah = (amount) => {
  if (!amount && amount !== 0) return '—';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
};

const ProductCardFull = ({ product, onOpenModal }) => {
  const { name, category, badge, desc, image, price, minVariantPrice, hasActiveVariant } = product;

  // Compute discount percentage
  const hasDiscount = hasActiveVariant && minVariantPrice && price > minVariantPrice;
  const discountPercent = hasDiscount
    ? Math.round(((price - minVariantPrice) / price) * 100)
    : 0;

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

        {/* Badge (Best Seller / Baru) — top left */}
        {badge && (
          <span className="absolute top-4 left-4 bg-eglux-secondary text-white
                           text-[0.75rem] font-semibold py-1 px-3 rounded-full">
            {badge}
          </span>
        )}

        {/* Discount % badge — top right (only if ada diskon) */}
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

        {/* === PRICE BLOCK (Shopee/Tokopedia pattern, match ProductModal v4) === */}
        <div className="mb-3">
          {hasActiveVariant && minVariantPrice ? (
            <>
              {/* "Mulai dari" label */}
              <p className="text-[0.65rem] text-[#999] uppercase tracking-[0.5px] mb-1">
                Mulai dari
              </p>

              {/* Strike base + min variant price + discount inline */}
              <div className="flex items-baseline gap-2 flex-wrap">
                {/* Strike through base price (gray, small) — only if variant < base */}
                {hasDiscount && (
                  <span className="text-[0.78rem] text-[#999] line-through">
                    {formatRupiah(price)}
                  </span>
                )}
                {/* Min variant price (large, gold/bold) */}
                <span className="text-[1.15rem] font-bold text-eglux-secondary">
                  {formatRupiah(minVariantPrice)}
                </span>
              </div>
            </>
          ) : (
            /* Fallback: no active variant */
            <p className="text-[0.95rem] font-semibold text-[#999]">
              Hubungi CS
            </p>
          )}
        </div>

        {desc && (
          <p className="text-[0.9rem] text-[#666] leading-relaxed line-clamp-2">{desc}</p>
        )}
      </div>
    </article>
  );
};

export default ProductCardFull;
