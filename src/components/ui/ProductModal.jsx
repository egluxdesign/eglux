// src/components/ui/ProductModal.jsx
// ============================================================================
// [v3] Updated for variant-as-source-of-truth model
// ============================================================================
// Changes:
//   - Remove fallback `selectedVariant?.price ?? product.price` → always use variant.price
//   - Auto-select CHEAPEST active variant (not first in array)
//   - Sort variants by price ascending (cheapest first)
//   - Filter: only show active variants (inactive variants hidden)
//   - Strike through base_price always (anchor display)
//   - Show stock if < 20 (urgency hint, Shopee pattern)
//   - Disable out-of-stock variants (stock = 0)
//   - Remove unused onCheckoutNow prop
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { rupiah } from '../../context/CartContext';

const ProductModal = ({ product, onClose, onAddToCart }) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState('');

  // 1. Filter: hanya tampilkan variant yang ACTIVE (hide inactive)
  const activeVariants = useMemo(() => {
    if (!product?.variants) return [];
    return product.variants.filter((v) => v.is_active);
  }, [product]);

  // 2. Sort variants by price ascending (cheapest first)
  const sortedVariants = useMemo(() => {
    return [...activeVariants].sort((a, b) => {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      return priceA - priceB;
    });
  }, [activeVariants]);

  // 3. Pisahkan gambar umum (BUKAN milik variant)
  const generalImages = useMemo(() => {
    if (!product?.images) return [];
    return product.images.filter((img) => !img.variant_id);
  }, [product]);

  // 4. Cari gambar variant yang sedang dipilih
  const variantImage = useMemo(() => {
    if (!selectedVariant || !product?.images) return null;
    return product.images.find((img) => img.variant_id === selectedVariant.id) || null;
  }, [selectedVariant, product]);

  // 5. INISIALISASI: auto-select CHEAPEST active variant (bukan first)
  useEffect(() => {
    if (!product) return;

    // Auto-select variant termurah (sudah sorted di sortedVariants[0])
    const cheapest = sortedVariants[0] || null;
    setSelectedVariant(cheapest);
    setQty(1);

    // Set active image dari general images
    const primary = generalImages.find((img) => img.is_primary) || generalImages[0];
    setActiveImage(primary?.url || '');
  }, [product, sortedVariants, generalImages]);

  if (!product) return null;

  // 6. LOGIC HARGA: selalu pakai variant price (no fallback to product price)
  const effectivePrice = selectedVariant?.price ?? 0;
  const subtotal = effectivePrice * qty;
  const isOutOfStock = selectedVariant && Number(selectedVariant.stock) === 0;

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
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

        {/* 7. AREA GAMBAR */}
        <div className="flex h-[260px] md:h-[300px] overflow-hidden rounded-t-[20px] bg-[#f3f4f6]">
          {activeImage ? (
            <img
              src={activeImage}
              alt={product.name}
              className={`${variantImage ? 'w-2/3' : 'w-full'} h-full object-cover transition-all duration-300`}
              loading="lazy"
            />
          ) : (
            <div className={`${variantImage ? 'w-2/3' : 'w-full'} h-full flex flex-col items-center justify-center text-[#9ca3af]`}>
              <span className="text-3xl mb-2">📷</span>
              <span className="text-[0.8rem]">Upload gambar utama di Admin</span>
            </div>
          )}

          {variantImage && (
            <img
              src={variantImage.url}
              alt={selectedVariant.name}
              className="w-1/3 h-full object-cover border-l-2 border-white"
            />
          )}
        </div>

        {/* 8. THUMBNAIL GALERI */}
        {generalImages.length > 1 && (
          <div className="flex gap-2 px-6 pt-4">
            {generalImages.map((img) => (
              <button
                key={img.id || img.url}
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

          {/* 9. DISPLAY HARGA: strike through base, show variant price */}
          <div className="mb-5">
            {selectedVariant && Number(selectedVariant.price) > 0 ? (
              <>
                {/* Base price struck through (anchor display) */}
                {product.price > Number(selectedVariant.price) && (
                  <span className="block text-[0.82rem] text-[#999] line-through mb-0.5">
                    {rupiah(product.price)}
                  </span>
                )}
                <span className="text-[1.2rem] font-bold text-eglux-secondary">
                  {rupiah(selectedVariant.price)}
                </span>
              </>
            ) : (
              <span className="text-[1.2rem] font-bold text-[#999]">
                Hubungi CS
              </span>
            )}
          </div>

          {/* 10. VARIANT SELECTOR — hanya active variants, sorted by price */}
          {sortedVariants.length > 0 && (
            <>
              <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">
                Pilih Varian *
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {sortedVariants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  const isOutOfStock = Number(v.stock) === 0;
                  const showStock = Number(v.stock) > 0 && Number(v.stock) < 20;

                  return (
                    <button
                      key={v.id}
                      onClick={() => !isOutOfStock && setSelectedVariant(v)}
                      disabled={isOutOfStock}
                      className={`py-1.5 px-4 border-[1.5px] rounded-lg text-[0.82rem] cursor-pointer font-medium transition-all duration-300 text-center
                        ${isSelected
                          ? 'border-eglux-secondary bg-eglux-accent'
                          : 'border-[#ddd] bg-white hover:border-eglux-secondary hover:bg-eglux-accent'}
                        ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      <span className="block font-semibold leading-tight">{v.name}</span>
                      <span className="text-[0.75rem] text-eglux-secondary">
                        {Number(v.price) > 0 ? rupiah(v.price) : 'Hubungi CS'}
                      </span>
                      {showStock && (
                        <span className="block text-[0.68rem] text-[#999] mt-0.5">
                          Sisa {v.stock}
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="block text-[0.68rem] text-red-400 mt-0.5">
                          Habis
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* 11. QUANTITY — disable jika out of stock */}
          {!isOutOfStock && selectedVariant && (
            <>
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
            </>
          )}

          {/* 12. SUBTOTAL */}
          {selectedVariant && !isOutOfStock && (
            <div className="flex items-center justify-between bg-eglux-accent rounded-[10px] py-3 px-4 mb-5">
              <span className="text-[0.82rem] text-[#666] font-medium">Subtotal</span>
              <span className="text-base font-bold text-eglux-primary">
                {Number(effectivePrice) > 0 ? rupiah(subtotal) : '—'}
              </span>
            </div>
          )}

          {/* 13. TOMBOL CTA — disable jika out of stock atau no variant */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (selectedVariant && !isOutOfStock && Number(effectivePrice) > 0) {
                  onAddToCart(product, selectedVariant, qty);
                  onClose();
                }
              }}
              disabled={!selectedVariant || isOutOfStock || Number(effectivePrice) === 0}
              className="flex-1 py-3.5 border-2 border-eglux-secondary bg-white text-eglux-secondary rounded-xl text-[0.9rem] font-semibold cursor-pointer transition-all hover:bg-eglux-accent disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isOutOfStock ? 'Stok Habis' : '+ Keranjang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
