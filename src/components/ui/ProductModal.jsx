import { useState, useEffect, useMemo } from 'react';
import { rupiah } from '../../context/CartContext';

const ProductModal = ({ product, onClose, onAddToCart, onCheckoutNow }) => {
  const [variants, setVariants] = useState([]);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(product?.image || '');

  // 1. INISIALISASI SAAT MODAL DIBUKA
  // Hanya set gambar primary sekali di awal. Gak bakal berubah ke gambar varian.
  useEffect(() => {
    if (!product) return;
    const v = product.variants ?? [];
    setVariants(v);
    setSelectedVariant(v[0] ?? null);
    setQty(1);
    
    const primaryImg = product.images?.find(img => img.is_primary);
    setActiveImage(primaryImg?.url || product.image || '');
  }, [product]);

  // 2. CARI GAMBAR VARIAN (Murni Baca Data, Gak Ngubah Apa-apa)
  const variantImage = useMemo(() => {
    if (!selectedVariant || !product?.images) return null;
    return product.images.find(img => img.variant_id === selectedVariant.id) || null;
  }, [selectedVariant, product]);

  if (!product) return null;

  // 3. LOGIK HARGA
  const effectivePrice = selectedVariant?.price ?? product.price;
  const subtotal = effectivePrice ? effectivePrice * qty : null;

  // 4. FILTER GAMBAR UNTUK THUMBNAIL (Hanya Yang Bukan Punya Varian)
  const generalImages = product.images?.filter(img => !img.variant_id) || [];

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog" aria-modal="true"
    >
      <div className="bg-white rounded-[20px] max-w-[520px] w-full max-h-[90vh] overflow-y-auto relative">
        {/* Tombol Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-[2] w-[34px] h-[34px] rounded-full bg-black/[0.07]
                     flex items-center justify-center text-eglux-primary text-xl cursor-pointer
                     border-none hover:bg-black/[0.13] transition-colors duration-300"
        >
          &times;
        </button>

        {/* 5. AREA GAMBAR (FLEX: KIRI UTAMA, KANAN VARIAN) */}
        <div className="flex h-[260px] md:h-[300px] overflow-hidden rounded-t-[20px]">
          
          {/* Gambar Utama (Selalu di kiri) */}
          <img 
            src={activeImage} 
            alt={product.name}
            // Kalau ada gambar varian, lebarnya jadi 66%. Kalau gak ada, 100%.
            className={`${variantImage ? 'w-2/3' : 'w-full'} h-full object-cover transition-all duration-300`} 
            loading="lazy" 
          />
          
          {/* Gambar Varian (Selalu di kanan, kalau ada) */}
          {variantImage && (
            <img 
              src={variantImage.url} 
              alt={selectedVariant.name}
              className="w-1/3 h-full object-cover border-l-2 border-white"
            />
          )}
        </div>

        {/* 6. THUMBNIL GALERI UMUM */}
        {generalImages.length > 1 && (
          <div className="flex gap-2 px-6 pt-4">
            {generalImages.map((img) => (
              <button 
                key={img.id} 
                onClick={() => setActiveImage(img.url)}
                className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  activeImage === img.url ? 'border-eglux-secondary' : 'border-transparent opacity-70 hover:opacity-100'
                }`}
              >
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="p-6 pt-4">
          {product.badge && (
            <span className="inline-block bg-eglux-secondary text-white text-[0.72rem] font-semibold py-1 px-3 rounded-full mb-2">
              {product.badge}
            </span>
          )}
          <h2 className="text-[1.05rem] font-bold text-eglux-primary mb-1 leading-snug">{product.name}</h2>
          <p className="text-[0.82rem] text-[#666] mb-2">{product.category}</p>
          <p className="text-[0.88rem] text-[#666] leading-relaxed mb-4">{product.desc}</p>

          {/* 7. DISPLAY HARGA (DENGAN CORETAN) */}
          <div className="mb-5">
            {selectedVariant?.price ? (
              <>
                <span className="block text-[0.82rem] text-[#999] line-through mb-0.5">
                  {rupiah(product.price)}
                </span>
                <span className="text-[1.2rem] font-bold text-eglux-secondary">
                  {rupiah(selectedVariant.price)}
                </span>
              </>
            ) : (
              <span className="text-[1.2rem] font-bold text-eglux-secondary">
                {rupiah(product.price)}
              </span>
            )}
          </div>

          {/* 8. VARIANT SELECTOR */}
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
                      {v.price ? rupiah(v.price) : rupiah(product.price)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 9. QUANTITY */}
          <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">Jumlah</p>
          <div className="flex items-center gap-3 mb-5">
            <button 
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-9 h-9 border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all"
            >
              −
            </button>
            <span className="text-[1.1rem] font-bold min-w-[28px] text-center text-eglux-primary">{qty}</span>
            <button 
              onClick={() => setQty((q) => q + 1)}
              className="w-9 h-9 border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all"
            >
              +
            </button>
          </div>

          {/* 10. SUBTOTAL */}
          <div className="flex items-center justify-between bg-eglux-accent rounded-[10px] py-3 px-4 mb-5">
            <span className="text-[0.82rem] text-[#666] font-medium">Subtotal</span>
            <span className="text-base font-bold text-eglux-primary">{subtotal ? rupiah(subtotal) : '—'}</span>
          </div>

          {/* 11. TOMBOL CTA */}
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