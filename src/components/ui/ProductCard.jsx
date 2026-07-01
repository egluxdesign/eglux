// src/components/ui/ProductCard.jsx
// Komponen reusable untuk kartu produk.
// Props:
//  - product: { id, name, model, badge, image, shopLink }
import ProductImage from './ProductImage';
import ProductInfo  from './ProductInfo';

const ProductCard = ({ product }) => {
  const { name, model, badge, image, shopLink } = product;

  return (
    <article
      className="group bg-white rounded-[20px] overflow-hidden cursor-pointer
                 transition-all duration-300 hover:-translate-y-2 hover:shadow-card-hover"
      onClick={() => window.open(shopLink, '_blank')}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && window.open(shopLink, '_blank')}
      aria-label={`Lihat produk: ${name}`}
    >
      <ProductImage src={image} alt={name} badge={badge} />
      <ProductInfo  name={name} model={model} />
    </article>
  );
};

export default ProductCard;
