// src/components/ui/ProductCardFull.jsx
// Versi ProductCard untuk halaman /products.
// Berbeda dari ProductCard di index (tanpa desc, tanpa modal).
// Props:
//  - product: { id, name, category, badge, desc, image }
//  - onOpenModal: (product) => void
import CartIcon from './CartIcon';

const ProductCardFull = ({ product, onOpenModal }) => {
  const { name, category, badge, desc, image } = product;

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
      {/* Image
          TODO: `image` → supabase.storage.from('products').getPublicUrl(p.image_path) */}
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
        <p className="flex items-center gap-1.5 text-[1.1rem] font-bold text-eglux-secondary mb-2">
          <CartIcon /> Buy Now
        </p>
        {desc && (
          <p className="text-[0.9rem] text-[#666] leading-relaxed line-clamp-2">{desc}</p>
        )}
      </div>
    </article>
  );
};

export default ProductCardFull;
