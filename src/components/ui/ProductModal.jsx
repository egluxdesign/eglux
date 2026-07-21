// src/components/ui/ProductModal.jsx
// ============================================================================
// [v4] Shopee/Tokopedia-style ProductModal
// ============================================================================
// UI changes from v3:
//   - Main image: single large (square), shows activeImage (cover OR variant)
//   - Thumbnail strip: ALL images (cover + variant images), clickable
//   - Clicking variant auto-switches main image to variant image
//   - Price: strike base (small gray) + variant price (large gold)
//   - Variant chips: sorted by price, show stock if < 20, disable if 0
//   - Quantity: with stock limit
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { rupiah } from '../../context/CartContext';

const ProductModal = ({ product, onClose, onAddToCart }) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState('');
  const [descOpen, setDescOpen] = useState(false);

  // 1. Filter: hanya tampilkan variant yang ACTIVE
  const activeVariants = useMemo(() => {
    if (!product?.variants) return [];
    return product.variants.filter((v) => v.is_active);
  }, [product]);

  // 2. Sort variants by price ascending (cheapest first — Shopee pattern)
  const sortedVariants = useMemo(() => {
    return [...activeVariants].sort((a, b) => {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      return priceA - priceB;
    });
  }, [activeVariants]);

  // 3. Pisahkan gambar: cover (variant_id=null) vs variant images
  const generalImages = useMemo(() => {
    if (!product?.images) return [];
    return product.images.filter((img) => !img.variant_id);
  }, [product]);

  const variantImagesMap = useMemo(() => {
    if (!product?.images) return new Map();
    const map = new Map();
    product.images
      .filter((img) => img.variant_id)
      .forEach((img) => {
        if (!map.has(img.variant_id)) {
          map.set(img.variant_id, img);
        }
      });
    return map;
  }, [product]);

  // 4. ALL thumbnails untuk gallery strip (cover + variant images)
  const allThumbnails = useMemo(() => {
    const covers = generalImages.map((img) => ({
      ...img,
      type: 'cover',
    }));
    const variants = sortedVariants
      .map((v) => {
        const img = variantImagesMap.get(v.id);
        return img ? { ...img, type: 'variant', variantId: v.id, variantName: v.name } : null;
      })
      .filter(Boolean);
    return [...covers, ...variants];
  }, [generalImages, sortedVariants, variantImagesMap]);

  // 5. Cari variant image untuk selectedVariant
  const variantImage = useMemo(() => {
    if (!selectedVariant) return null;
    return variantImagesMap.get(selectedVariant.id) || null;
  }, [selectedVariant, variantImagesMap]);

  // 6. INISIALISASI: auto-select cheapest variant + set cover image
  useEffect(() => {
    if (!product) return;
    const cheapest = sortedVariants[0] || null;
    setSelectedVariant(cheapest);
    setQty(1);

    // Set main image to primary cover image
    const primary = generalImages.find((img) => img.is_primary) || generalImages[0];
    setActiveImage(primary?.url || '');
  }, [product, sortedVariants, generalImages]);

  // 7. Saat variant berubah, auto-switch main image ke variant image (Shopee pattern)
  useEffect(() => {
    if (variantImage) {
      setActiveImage(variantImage.url);
    } else if (generalImages.length > 0) {
      // Kalau variant tidak punya image, fallback ke cover
      const primary = generalImages.find((img) => img.is_primary) || generalImages[0];
      setActiveImage(primary?.url || '');
    }
  }, [variantImage, generalImages]);

  if (!product) return null;

  // 8. LOGIC HARGA: selalu pakai variant price
  // ⭐ v3: Discount-aware pricing — pakai computeVariantDiscount dari useProducts
  // Jika variant punya discount aktif (dalam schedule), pakai currentPrice.
  // effectivePrice = harga setelah discount, originalPrice = harga asli (untuk strike)
  const _originalVariantPrice = Number(selectedVariant?.price) || 0;
  const _discountInfo = (() => {
    if (!selectedVariant) return { currentPrice: 0, originalPrice: 0, discountPercent: 0, isActive: false };
    // Inline compute (same logic as useProducts.computeVariantDiscount)
    if (!selectedVariant.discount_type || !selectedVariant.discount_value) {
      return { currentPrice: _originalVariantPrice, originalPrice: _originalVariantPrice, discountPercent: 0, isActive: false };
    }
    const now = new Date();
    const startAt = selectedVariant.discount_start_at ? new Date(selectedVariant.discount_start_at) : null;
    const endAt = selectedVariant.discount_end_at ? new Date(selectedVariant.discount_end_at) : null;
    if (startAt && now < startAt) return { currentPrice: _originalVariantPrice, originalPrice: _originalVariantPrice, discountPercent: 0, isActive: false };
    if (endAt && now > endAt) return { currentPrice: _originalVariantPrice, originalPrice: _originalVariantPrice, discountPercent: 0, isActive: false };
    const value = Number(selectedVariant.discount_value);
    let currentPrice = _originalVariantPrice;
    switch (selectedVariant.discount_type) {
      case 'percentage': currentPrice = Math.max(0, Math.round(_originalVariantPrice - (_originalVariantPrice * value / 100))); break;
      case 'nominal':    currentPrice = Math.max(0, _originalVariantPrice - value); break;
      case 'final_price':currentPrice = Math.max(0, value); break;
      default: currentPrice = _originalVariantPrice;
    }
    const discountPercent = _originalVariantPrice > currentPrice
      ? Math.round(((_originalVariantPrice - currentPrice) / _originalVariantPrice) * 100)
      : 0;
    return { currentPrice, originalPrice: _originalVariantPrice, discountPercent, isActive: discountPercent > 0 };
  })();
  const effectivePrice = _discountInfo.currentPrice;
  const basePrice = _discountInfo.originalPrice;       // = originalVariantPrice (for strike-through)
  const isDiscounted = _discountInfo.isActive;
  const discountPercent = _discountInfo.discountPercent;
  const subtotal = effectivePrice * qty;
  const selectedStock = selectedVariant ? parseInt(selectedVariant.stock, 10) || 0 : 0;
  // Hanya anggap out of stock kalau stock PASTI 0 (bukan null/undefined)
  const isOutOfStock = selectedVariant && selectedStock === 0 && selectedVariant.stock !== null && selectedVariant.stock !== undefined;
  const maxStock = selectedStock;

  // 9. Handler: klik variant → switch variant + auto-switch image
  const handleVariantClick = (variant) => {
    const stock = parseInt(variant.stock, 10) || 0;
    // Hanya skip kalau stock PASTI 0. Kalau null/undefined, biarkan tetap bisa dipilih.
    if (stock === 0 && variant.stock !== null && variant.stock !== undefined) return;
    setSelectedVariant(variant);
    setQty(1); // reset qty kalau ganti variant
  };

  // 10. Handler: klik thumbnail → manually switch main image
  const handleThumbnailClick = (img) => {
    setActiveImage(img.url);
    // Kalau thumbnail adalah variant image, switch selected variant juga
    if (img.type === 'variant' && img.variantId) {
      const variant = sortedVariants.find((v) => v.id === img.variantId);
      if (variant) {
        setSelectedVariant(variant);
        setQty(1);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-[20px] max-w-[520px] w-full max-h-[90vh] flex flex-col overflow-hidden relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-[2] w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/[0.07]
                     flex items-center justify-center text-eglux-primary text-xl cursor-pointer
                     border-none hover:bg-black/[0.13] transition-colors duration-300"
          aria-label="Tutup"
        >
          &times;
        </button>

        {/* === SCROLLABLE CONTENT === */}
        <div className="flex-1 overflow-y-auto">
          {/* === MAIN IMAGE (1:1 square) === */}
          <div className="relative w-full aspect-square overflow-hidden bg-[#f3f4f6]">
            {activeImage ? (
              <img
                src={activeImage}
                alt={product.name}
                className="w-full h-full object-cover transition-all duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#9ca3af]">
                <span className="text-4xl mb-2">📷</span>
                <span className="text-[0.85rem]">Upload gambar di Admin</span>
              </div>
            )}

            {/* Badge overlay */}
            {product.badge && (
              <span className="absolute top-4 left-4 bg-eglux-secondary text-white text-[0.72rem] font-semibold py-1 px-3 rounded-full">
                {product.badge}
              </span>
            )}
          </div>

          {/* === THUMBNAIL STRIP === */}
          {allThumbnails.length > 1 && (
            <div className="flex gap-2 px-6 pt-3 pb-2 overflow-x-auto">
              {allThumbnails.map((img, idx) => (
                <button
                  key={img.id || img.url || idx}
                  onClick={() => handleThumbnailClick(img)}
                  className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    activeImage === img.url
                      ? 'border-eglux-secondary'
                      : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {img.type === 'variant' && (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[0.55rem] py-0.5 px-1 truncate">
                      {img.variantName}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* === PRODUCT INFO === */}
          <div className="p-6 pt-3">
            <h2 className="text-[1.1rem] font-bold text-eglux-primary mb-1 leading-snug">{product.name}</h2>
            <p className="text-[0.8rem] text-[#999] mb-3 uppercase tracking-[0.5px]">{product.category}</p>

            {/* === PRICE DISPLAY (v3: discount-aware) === */}
            <div className="mb-4 pb-4 border-b border-[#eee]">
              {selectedVariant && effectivePrice > 0 ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  {isDiscounted && basePrice > effectivePrice && (
                    <span className="text-[0.85rem] text-[#999] line-through">
                      {rupiah(basePrice)}
                    </span>
                  )}
                  <span className="text-[1.5rem] font-bold text-eglux-secondary">
                    {rupiah(effectivePrice)}
                  </span>
                  {isDiscounted && discountPercent > 0 && (
                    <span className="bg-red-500 text-white text-[0.65rem] font-bold py-0.5 px-1.5 rounded">
                      -{discountPercent}%
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[1.2rem] font-bold text-[#999]">Hubungi CS</span>
              )}
            </div>

            {/* === VARIANT SELECTOR (moved up, above description) === */}
            {sortedVariants.length > 0 && (
              <div className="mb-4">
                <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">
                  Pilih Varian {selectedVariant && <span className="text-eglux-secondary normal-case">: {selectedVariant.name}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sortedVariants.map((v) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const vStock = parseInt(v.stock, 10) || 0;
                    const vOutOfStock = vStock === 0 && v.stock !== null && v.stock !== undefined;
                    const showStock = vStock > 0 && vStock < 20;
                    // ⭐ v3: Pakai currentPrice (discount-aware) kalau ada, fallback ke price
                    const vDisplayPrice = v.currentPrice || Number(v.price) || 0;
                    const vOriginalPrice = v.originalPrice || Number(v.price) || 0;
                    const vHasDiscount = v.isActive && vOriginalPrice > vDisplayPrice;

                    return (
                      <button
                        key={v.id}
                        onClick={() => handleVariantClick(v)}
                        disabled={vOutOfStock}
                        className={`relative py-2 px-3 border-[1.5px] rounded-lg text-[0.82rem] cursor-pointer font-medium transition-all duration-200 text-center min-w-[80px]
                          ${isSelected
                            ? 'border-eglux-secondary bg-eglux-accent'
                            : 'border-[#ddd] bg-white hover:border-eglux-secondary hover:bg-eglux-accent/50'}
                          ${vOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span className="block font-semibold leading-tight">{v.name}</span>
                        {/* ⭐ v3: Tampilkan harga diskon (strike original + discounted) */}
                        <span className={`block text-[0.72rem] mt-0.5 ${isSelected ? 'text-eglux-secondary' : 'text-[#999]'}`}>
                          {vDisplayPrice > 0 ? (
                            vHasDiscount ? (
                              <>
                                <span className="line-through text-[0.6rem] mr-1 opacity-70">{rupiah(vOriginalPrice)}</span>
                                {rupiah(vDisplayPrice)}
                              </>
                            ) : rupiah(vDisplayPrice)
                          ) : 'Hubungi CS'}
                        </span>
                        {showStock && (
                          <span className="block text-[0.65rem] text-[#bbb] mt-0.5">
                            Sisa {vStock}
                          </span>
                        )}
                        {vOutOfStock && (
                          <span className="block text-[0.65rem] text-red-400 mt-0.5">
                            Habis
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === QUANTITY (moved up, above description) === */}
            {selectedVariant && !isOutOfStock && effectivePrice > 0 && (
              <div className="mb-4">
                <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">Jumlah</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Kurangi jumlah"
                  >
                    −
                  </button>
                  <span className="text-[1.1rem] font-bold min-w-[28px] text-center text-eglux-primary">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                    disabled={qty >= maxStock}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Tambah jumlah"
                  >
                    +
                  </button>
                  <span className="text-[0.75rem] text-[#999] ml-2">
                    {maxStock} tersedia
                  </span>
                </div>
              </div>
            )}

            {/* === DESCRIPTION (FAQ-style accordion, di bagian bawah) === */}
            {product.desc && (
              <div className="border-t border-[#eee] pt-4 mt-2">
                <button
                  onClick={() => setDescOpen(!descOpen)}
                  className="w-full flex items-center justify-between text-[0.85rem] font-semibold text-eglux-primary cursor-pointer border-none bg-transparent"
                >
                  <span>Deskripsi</span>
                  <svg
                    className={`w-4 h-4 transition-transform duration-300 ${descOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${descOpen ? 'max-h-[500px] mt-3' : 'max-h-0'}`}>
                  <p className="text-[0.85rem] text-[#666] leading-relaxed">{product.desc}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* === STICKY BOTTOM: Subtotal + Cart Button === */}
        <div className="border-t border-[#eee] bg-white px-6 py-4 flex-shrink-0">
          {selectedVariant && !isOutOfStock && effectivePrice > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-[0.82rem] text-[#666] font-medium">Subtotal</span>
              <span className="text-[1.1rem] font-bold text-eglux-primary">{rupiah(subtotal)}</span>
            </div>
          )}
          <button
            onClick={() => {
              if (selectedVariant && !isOutOfStock && effectivePrice > 0) {
                // ⭐ v3: Pass variant dengan price = effectivePrice (discounted)
                // supaya CartContext pakai harga diskon untuk total calculation
                const variantWithDiscount = {
                  ...selectedVariant,
                  price: effectivePrice,           // harga setelah discount (yang dipakai untuk total)
                  originalPrice: basePrice,         // harga asli (untuk strike-through display di cart)
                  isDiscounted,                     // flag: apakah variant lagi diskon?
                  discountPercent,                  // percent off (untuk badge)
                };
                onAddToCart(product, variantWithDiscount, qty);
                onClose();
              }
            }}
            disabled={!selectedVariant || isOutOfStock || effectivePrice === 0}
            className="w-full py-3.5 border-2 border-eglux-secondary bg-white text-eglux-secondary rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:bg-eglux-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isOutOfStock ? 'Stok Habis' : !selectedVariant ? 'Pilih Varian Dulu' : '+ Keranjang'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
