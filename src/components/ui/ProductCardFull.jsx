// src/components/ui/ProductCardFull.jsx
// ============================================================================
// [v2] Updated for variant-as-source-of-truth model
// ============================================================================
// Changes:
//   - Display "Mulai dari Rp {minVariantPrice}" instead of just "Buy Now"
//   - Strike through base_price if minVariantPrice < base_price (diskon model)
//   - Show "Hubungi CS" if no active variant (product not ready for sale)
//   - Props now include: minVariantPrice, hasActiveVariant (from useProducts v2)
// ============================================================================

import CartIcon from './CartIcon';

// Format rupiah — fallback kalau rupiah dari CartContext belum di-import
const formatRupiah = (amount) => {
  if (!amount && amount !== 0) return '—';
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
};

const ProductCardFull = ({ product, onOpenModal }) => {
  const { name, category, badge, desc, image, price, minVariantPrice, hasActiveVariant } = product;

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
      {/* Image */}
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
      </div>

      {/* Info */}
      <div className="p-6">
        <h4 className="text-base font-semibold text-eglux-primary mb-1 leading-snug line-clamp-2">
          {name}
        </h4>
        <p className="text-[0.85rem] text-[#666] mb-3">{category}</p>

        {/* Price display — variant-as-source-of-truth model */}
        <div className="mb-2">
          {hasActiveVariant && minVariantPrice ? (
            <>
              {/* "Mulai dari" label + strike through base if min < base */}
              <p className="text-[0.7rem] text-[#999] uppercase tracking-[0.5px] mb-0.5">
                Mulai dari
              </p>
              {minVariantPrice < price ? (
                <>
                  <span className="block text-[0.78rem] text-[#999] line-through mb-0.5">
                    {formatRupiah(price)}
                  </span>
                  <span className="text-[1.1rem] font-bold text-eglux-secondary">
                    {formatRupiah(minVariantPrice)}
                  </span>
                </>
              ) : (
                <span className="text-[1.1rem] font-bold text-eglux-secondary">
                  {formatRupiah(minVariantPrice)}
                </span>
              )}
            </>
          ) : (
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
