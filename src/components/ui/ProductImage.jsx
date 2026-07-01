// src/components/ui/ProductImage.jsx
// Sub-komponen: gambar produk + badge label
// TODO: Saat integrasi Supabase, `src` akan berupa URL dari
//       supabase.storage.from('products').getPublicUrl(product.image_path)

const ProductImage = ({ src, alt, badge }) => (
  <div className="relative overflow-hidden h-[250px]">
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
    {badge && (
      <span className="absolute top-4 left-4 bg-eglux-secondary text-white text-[0.75rem] font-semibold py-1 px-3 rounded-full">
        {badge}
      </span>
    )}
  </div>
);

export default ProductImage;
