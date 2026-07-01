// src/components/ui/ProductModal.jsx
import { useState, useEffect } from 'react';
import { rupiah } from '../../context/CartContext';

const ProductModal = ({ product, onClose, onAddToCart, onCheckoutNow }) => {
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!product) return;
    const v = product.variants ?? [];
    setVariants(v);
    setSelectedVariant(v[0] ?? null);
    setQty(1);
  }, [product]);

  if (!product) return null;

  // Kalau varian punya price sendiri, pakai itu. Kalau null, ikut harga dasar produk.
  const effectivePrice = selectedVariant?.price ?? product.price;
  const subtotal = effectivePrice ? effectivePrice * qty : null;

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog" aria-modal="true"
    >
      <div className="bg-white rounded-[20px] max-w-[520px] w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[2] w-[34px] h-[34px] rounded-full bg-black/[0.07]
                     flex items-center justify-center text-eglux-primary text-xl cursor-pointer
                     border-none hover:bg-black/[0.13] transition-colors duration-300"
        >
          &times;
        </button>

        {/* Image dari Supabase Storage URL */}
        <img src={product.image} alt={product.name}
             className="w-full h-[260px] md:h-[300px] object-cover rounded-t-[20px]" loading="lazy" />

        <div className="p-6">
          {product.badge && (
            <span className="inline-block bg-eglux-secondary text-white text-[0.72rem] font-semibold py-1 px-3 rounded-full mb-2">
              {product.badge}
            </span>
          )}
          <h2 className="text-[1.05rem] font-bold text-eglux-primary mb-1 leading-snug">{product.name}</h2>
          <p className="text-[0.82rem] text-[#666] mb-2">{product.category}</p>
          <p className="text-[0.88rem] text-[#666] leading-relaxed mb-5">{product.desc}</p>

          {/* Variant Selector */}
          {variants.length > 0 && (
            <>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">Pilih Varian</p>
              <div className="flex flex-wrap gap-2 mb-5">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={`py-1.5 px-4 border-[1.5px] rounded-lg text-[0.82rem] cursor-pointer font-medium text-eglux-primary transition-all duration-300 text-center
                      ${selectedVariant?.id === v.id
                        ? 'border-eglux-secondary bg-eglux-accent'
                        : 'border-[#ddd] bg-white hover:border-eglux-secondary hover:bg-eglux-accent'}`}
                  >
                    <span className="block font-semibold leading-tight">{v.name}</span>
                    <span className="text-[0.75rem] text-eglux-secondary">
                      {rupiah(v.price ?? product.price)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Qty */}
          <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">Jumlah</p>
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-9 h-9 border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all">
              −
            </button>
            <span className="text-[1.1rem] font-bold min-w-[28px] text-center text-eglux-primary">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)}
              className="w-9 h-9 border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all">
              +
            </button>
          </div>

          {/* Subtotal */}
          <div className="flex items-center justify-between bg-eglux-accent rounded-[10px] py-3 px-4 mb-5">
            <span className="text-[0.82rem] text-[#666] font-medium">Subtotal</span>
            <span className="text-base font-bold text-eglux-primary">{subtotal ? rupiah(subtotal) : '—'}</span>
          </div>

          {/* CTA */}
          <div className="flex gap-3">
            <button
              onClick={() => { onAddToCart(product, selectedVariant, qty); onClose(); }}
              disabled={variants.length > 0 && !selectedVariant}
              className="flex-1 py-3.5 border-2 border-eglux-secondary bg-white text-eglux-secondary rounded-xl text-[0.9rem] font-semibold cursor-pointer transition-all hover:bg-eglux-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + Keranjang
            </button>
            <button
              onClick={() => { onCheckoutNow(product, selectedVariant, qty); onClose(); }}
              disabled={variants.length > 0 && !selectedVariant}
              className="flex-1 py-3.5 border-none bg-eglux-secondary text-white rounded-xl text-[0.9rem] font-semibold cursor-pointer transition-all hover:bg-eglux-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Beli Sekarang
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;