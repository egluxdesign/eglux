// src/components/ui/ProductModal.jsx
// ============================================================================
// [v7] ProductModal with Reviews — full rewrite
// ============================================================================

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { rupiah } from '../../context/CartContext';
import { supabase } from '../../lib/supabaseClient';

const trackedImpressions = new Set();

const ProductModal = ({ product, onClose, onAddToCart }) => {
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [descOpen, setDescOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const swiperRef = useRef(null);
  const scrollContainerRef = useRef(null);

  // ⭐ Review state
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // ── Fetch published reviews untuk product ini ──
  useEffect(() => {
    if (!product?.id) {
      setReviews([]);
      return;
    }
    setReviewsLoading(true);

    // Query 1: fetch reviews TANPA join profiles (avoid FK error)
    supabase
      .from('product_reviews')
      .select('id, rating, title, comment, images, is_verified, created_at, user_id')
      .eq('product_id', product.id)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(async ({ data, error }) => {
        if (error) {
          console.warn('[ProductModal] fetch reviews error:', error.message);
          setReviews([]);
          setReviewsLoading(false);
          return;
        }

        if (!data || data.length === 0) {
          setReviews([]);
          setReviewsLoading(false);
          return;
        }

        // Query 2: fetch user names untuk reviews yang ada
        const userIds = [...new Set(data.map((r) => r.user_id).filter(Boolean))];
        if (userIds.length === 0) {
          setReviews(data);
          setReviewsLoading(false);
          return;
        }

// Query 2: fetch user names + roles
const { data: profilesData } = await supabase
  .from('profiles')
  .select('id, full_name, role')
  .in('id', userIds);

const profileMap = {};
(profilesData || []).forEach((p) => {
  profileMap[p.id] = { full_name: p.full_name, role: p.role };
});

const reviewsWithUser = data.map((r) => ({
  ...r,
  user: { full_name: profileMap[r.user_id]?.full_name || null },
  user_role: profileMap[r.user_id]?.role || null,
}));

        setReviews(reviewsWithUser);
        setReviewsLoading(false);
      });
  }, [product?.id]);

  // ⭐ Compute average rating + distribution
  const reviewStats = useMemo(() => {
    if (reviews.length === 0) return { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
    const total = reviews.reduce((sum, r) => sum + (r.rating || 0), 0);
    const avg = total / reviews.length;
    const distribution = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1]++;
    });
    return { avg, count: reviews.length, distribution };
  }, [reviews]);

  // ── Variant computations ──
  const activeVariants = useMemo(() => {
    if (!product?.variants) return [];
    return product.variants.filter((v) => v.is_active);
  }, [product]);

  const sortedVariants = useMemo(() => {
    return [...activeVariants].sort((a, b) => {
      const priceA = Number(a.price) || 0;
      const priceB = Number(b.price) || 0;
      return priceA - priceB;
    });
  }, [activeVariants]);

  const generalImages = useMemo(() => {
    if (!product?.images) return [];
    const covers = product.images.filter((img) => !img.variant_id);
    return [...covers].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.position || 0) - (b.position || 0);
    });
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

  // ── Impression tracking ──
  useEffect(() => {
    if (!product?.id) return;
    if (trackedImpressions.has(product.id)) return;
    trackedImpressions.add(product.id);

    const trackImpression = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        let sid = sessionStorage.getItem('eglux_session_id');
        if (!sid) {
          sid = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
          sessionStorage.setItem('eglux_session_id', sid);
        }
        await supabase.from('page_views').insert({
          user_id: user?.id || null,
          session_id: sid,
          page_path: window.location.pathname,
          page_type: 'product_impression',
          product_id: null,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
        });
      } catch (e) {
        console.error('[funnel] impression exception:', e?.message);
      }
    };
    trackImpression();
  }, [product?.id]);

  const allThumbnails = useMemo(() => {
    const covers = generalImages.map((img) => ({ ...img, type: 'cover' }));
    const variants = sortedVariants
      .map((v) => {
        const img = variantImagesMap.get(v.id);
        return img ? { ...img, type: 'variant', variantId: v.id, variantName: v.name } : null;
      })
      .filter(Boolean);
    return [...covers, ...variants];
  }, [generalImages, sortedVariants, variantImagesMap]);

  // ── Reset state saat product berubah ──
  useEffect(() => {
    if (!product) return;
    setSelectedVariant(null);
    setQty(1);
    setActiveIndex(0);
    setDescOpen(false);
    setReviewsOpen(false);
    if (swiperRef.current) {
      swiperRef.current.slideTo(0, 0);
    }
  }, [product]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e) => {
    const tag = e.target.tagName.toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if (isTyping) return;

    const swiper = swiperRef.current;
    const scrollEl = scrollContainerRef.current;
    const maxIdx = allThumbnails.length - 1;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (swiper && activeIndex > 0) swiper.slideTo(activeIndex - 1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (swiper && activeIndex < maxIdx) swiper.slideTo(activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (scrollEl) scrollEl.scrollBy({ top: -60, behavior: 'smooth' });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (scrollEl) scrollEl.scrollBy({ top: 60, behavior: 'smooth' });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [activeIndex, allThumbnails.length, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!product) return null;

  // ── Price computation (discount-aware) ──
  const _originalVariantPrice = Number(selectedVariant?.price) || 0;
  const _discountInfo = (() => {
    if (!selectedVariant) return { currentPrice: 0, originalPrice: 0, discountPercent: 0, isActive: false };
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
  const basePrice = _discountInfo.originalPrice;
  const isDiscounted = _discountInfo.isActive;
  const discountPercent = _discountInfo.discountPercent;
  const subtotal = effectivePrice * qty;
  const selectedStock = selectedVariant ? parseInt(selectedVariant.stock, 10) || 0 : 0;
  const isOutOfStock = selectedVariant && selectedStock === 0 && selectedVariant.stock !== null && selectedVariant.stock !== undefined;
  const maxStock = selectedStock;

  // ── Handlers ──
  const handleVariantClick = (variant) => {
    const stock = parseInt(variant.stock, 10) || 0;
    if (stock === 0 && variant.stock !== null && variant.stock !== undefined) return;
    setSelectedVariant(variant);
    setQty(1);
    const imgIdx = allThumbnails.findIndex((t) => t.type === 'variant' && t.variantId === variant.id);
    if (imgIdx !== -1 && swiperRef.current) {
      swiperRef.current.slideTo(imgIdx);
    }
  };

  const handleThumbnailClick = (idx) => {
    if (swiperRef.current) swiperRef.current.slideTo(idx);
  };

  const handleSlideChange = (swiper) => {
    const idx = swiper.activeIndex;
    setActiveIndex(idx);
    const item = allThumbnails[idx];
    if (item?.type === 'variant' && item.variantId) {
      const variant = sortedVariants.find((v) => v.id === item.variantId);
      if (variant && variant.id !== selectedVariant?.id) {
        setSelectedVariant(variant);
        setQty(1);
      }
    }
  };

  // ⭐ Format helpers untuk reviews
  const formatRating = (r) => r.toFixed(1);
  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[2000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-[20px] max-w-[520px] w-full max-h-[90vh] flex flex-col overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-[2] w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/[0.07]
                     flex items-center justify-center text-eglux-primary text-xl cursor-pointer
                     border-none hover:bg-black/[0.13] transition-colors duration-300"
          aria-label="Tutup"
        >
          &times;
        </button>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {/* === IMAGE GALLERY === */}
          <div className="relative w-full aspect-square overflow-hidden bg-[#f3f4f6]">
            {allThumbnails.length > 0 ? (
              <Swiper
                onSwiper={(swiper) => { swiperRef.current = swiper; }}
                onSlideChange={handleSlideChange}
                grabCursor
                slidesPerView={1}
                spaceBetween={0}
                className="w-full h-full"
                style={{ touchAction: 'pan-y' }}
              >
                {allThumbnails.map((img, idx) => (
                  <SwiperSlide key={img.id || img.url || idx} style={{ touchAction: 'pan-y' }}>
                    <img
                      src={img.url}
                      alt={product.name}
                      draggable={false}
                      className="w-full h-full object-cover select-none"
                      loading={idx === 0 ? 'eager' : 'lazy'}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#9ca3af]">
                <span className="text-4xl mb-2">📷</span>
                <span className="text-[0.85rem]">Upload gambar di Admin Panel</span>
              </div>
            )}

            {product.badge && (
              <span className="absolute bottom-4 left-4 z-[5] bg-eglux-secondary text-white text-[0.72rem] font-semibold py-1 px-3 rounded-full pointer-events-none">
                {product.badge}
              </span>
            )}

            {allThumbnails.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[5] flex gap-1.5 pointer-events-none">
                {allThumbnails.map((_, idx) => (
                  <span
                    key={idx}
                    className={`block w-1.5 h-1.5 rounded-full transition-all ${
                      idx === activeIndex ? 'bg-white w-4' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* === THUMBNAILS === */}
          {allThumbnails.length > 1 && (
            <div className="flex gap-2 px-6 pt-3 pb-2 overflow-x-auto">
              {allThumbnails.map((img, idx) => (
                <button
                  key={img.id || img.url || idx}
                  onClick={() => handleThumbnailClick(idx)}
                  className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    activeIndex === idx
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
            <h2
              className="text-[1.1rem] font-bold text-eglux-primary mb-1 leading-snug"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {product.name}
            </h2>
            <p className="text-[0.8rem] text-[#999] mb-3 uppercase tracking-[0.5px]">{product.category}</p>

            {/* === PRICE BLOCK === */}
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
              ) : !selectedVariant ? (
                <span className="text-[0.95rem] text-[#999] italic">Pilih varian untuk menampilkan harga</span>
              ) : (
                <span className="text-[1.2rem] font-bold text-[#999]">Hubungi CS</span>
              )}
            </div>

            {/* === VARIANTS === */}
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
                          <span className="block text-[0.65rem] text-[#bbb] mt-0.5">Sisa {vStock}</span>
                        )}
                        {vOutOfStock && (
                          <span className="block text-[0.65rem] text-red-400 mt-0.5">Habis</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* === QUANTITY === */}
            {selectedVariant && !isOutOfStock && effectivePrice > 0 && (
              <div className="mb-4">
                <p className="text-[0.78rem] font-semibold uppercase tracking-[1px] text-eglux-primary mb-2">Jumlah</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Kurangi jumlah"
                  >−</button>
                  <span className="text-[1.1rem] font-bold min-w-[28px] text-center text-eglux-primary">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                    disabled={qty >= maxStock}
                    className="w-11 h-11 min-w-[44px] min-h-[44px] border-[1.5px] border-[#ddd] rounded-lg bg-white flex items-center justify-center text-xl font-semibold text-eglux-primary cursor-pointer hover:border-eglux-secondary hover:bg-eglux-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Tambah jumlah"
                  >+</button>
                  <span className="text-[0.75rem] text-[#999] ml-2">{maxStock} tersedia</span>
                </div>
              </div>
            )}

            {/* === DESCRIPTION (collapsible) === */}
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

            {/* === ⭐ REVIEWS SECTION (collapsible) === */}
            <div className="border-t border-[#eee] pt-4 mt-2">
              <button
                onClick={() => setReviewsOpen(!reviewsOpen)}
                className="w-full flex items-center justify-between text-[0.85rem] font-semibold text-eglux-primary cursor-pointer border-none bg-transparent"
              >
                <span className="flex items-center gap-2">
                  <span>Ulasan</span>
                  {reviewStats.count > 0 && (
                    <span className="flex items-center gap-1 text-[0.75rem] font-normal text-amber-500">
                      <span>{'★'.repeat(Math.round(reviewStats.avg))}<span className="text-gray-300">{'★'.repeat(5 - Math.round(reviewStats.avg))}</span></span>
                      <span className="font-semibold">{formatRating(reviewStats.avg)}</span>
                      <span className="text-[#999]">({reviewStats.count})</span>
                    </span>
                  )}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${reviewsOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${reviewsOpen ? 'max-h-[700px] mt-3' : 'max-h-0'}`}>
                {reviewsLoading ? (
                  <div className="py-6 text-center">
                    <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-[0.7rem] text-[#999] mt-2">Memuat ulasan...</p>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-[0.8rem] text-[#999] mb-1">Belum ada ulasan</p>
                    <p className="text-[0.7rem] text-[#bbb]">Jadilah yang pertama review produk ini setelah membeli!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Rating summary card */}
                    <div className="bg-amber-50 rounded-lg p-3 flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">{formatRating(reviewStats.avg)}</p>
                        <p className="text-amber-500 text-[0.7rem]">
                          {'★'.repeat(Math.round(reviewStats.avg))}{'☆'.repeat(5 - Math.round(reviewStats.avg))}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[0.75rem] text-gray-600">{reviewStats.count} ulasan</p>
                        <div className="space-y-0.5 mt-1">
                          {[5, 4, 3, 2, 1].map((star) => {
                            const cnt = reviewStats.distribution[star - 1];
                            const pct = reviewStats.count > 0 ? (cnt / reviewStats.count) * 100 : 0;
                            return (
                              <div key={star} className="flex items-center gap-1.5 text-[0.6rem]">
                                <span className="text-gray-500 w-3">{star}★</span>
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-gray-500 w-5 text-right">{cnt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Reviews list */}
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {reviews.map((r) => (
                        <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0 flex-1">
                              <p className="text-[0.8rem] font-medium text-gray-900 truncate">
                                {r.user?.full_name || 'Customer'}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5">
  <span className="text-amber-500 text-[0.7rem]">
    {'★'.repeat(r.rating)}<span className="text-gray-300">{'★'.repeat(5 - r.rating)}</span>
  </span>
  {r.is_verified && (
    <span className="text-[0.6rem] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
      ✓ Verified
    </span>
  )}
  {r.user_role && ['team_dev', 'master', 'admin'].includes(r.user_role) && (
    <span className="text-[0.6rem] text-eglux-secondary bg-eglux-accent px-1.5 py-0.5 rounded font-medium">
      {r.user_role === 'team_dev' ? 'Developer' : r.user_role === 'master' ? 'Owner' : 'Admin'}
    </span>
  )}
</div>
                            </div>
                            <span className="text-[0.6rem] text-gray-400 whitespace-nowrap">
                              {formatDate(r.created_at)}
                            </span>
                          </div>
                          {r.title && (
                            <p className="text-[0.8rem] font-semibold text-gray-800 mt-1">{r.title}</p>
                          )}
                          {r.comment && (
                            <p className="text-[0.78rem] text-gray-600 mt-1 leading-relaxed">{r.comment}</p>
                          )}
                          {r.images && Array.isArray(r.images) && r.images.length > 0 && (
  <                         div className="flex gap-1.5 mt-2">
    {r.images.slice(0, 5).map((img, i) => (
      <a
        key={i}
        href={img}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-12 h-12 overflow-hidden rounded border border-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <img
          src={img}
          alt={`Review foto ${i + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </a>
    ))}
  </div>
)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* === FOOTER (Add to cart) === */}
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
                const variantWithDiscount = {
                  ...selectedVariant,
                  price: effectivePrice,
                  originalPrice: basePrice,
                  isDiscounted,
                  discountPercent,
                };
                onAddToCart(product, variantWithDiscount, qty);
                onClose();
              }
            }}
            disabled={!selectedVariant || isOutOfStock || effectivePrice === 0}
            className="w-full py-3.5 border-2 border-eglux-secondary bg-white text-eglux-secondary rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:bg-eglux-accent disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isOutOfStock ? 'Stok Habis' : !selectedVariant ? 'Harap Pilih Varian' : '+ Keranjang'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;