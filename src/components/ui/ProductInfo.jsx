// src/components/ui/ProductInfo.jsx
// Sub-komponen: informasi teks produk + tombol Buy Now
import CartIcon from './CartIcon';

const ProductInfo = ({ name, model }) => (
  <div className="p-6">
    <h4 className="text-[1rem] font-semibold mb-1 text-eglux-primary leading-snug">
      {name}
    </h4>
    <p className="text-[0.85rem] text-[#666] mb-3">{model}</p>
    <p className="flex items-center gap-1.5 text-[1.1rem] font-bold text-eglux-secondary">
      <CartIcon />
      Buy Now
    </p>
  </div>
);

export default ProductInfo;
