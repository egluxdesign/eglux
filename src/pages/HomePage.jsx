// src/pages/HomePage.jsx
// ============================================================================
// HomePage v4.3 — Parallax hero + transform swiper + sticky filter + no carousel
// ============================================================================
//
// Changes from v4.2:
//   - HeroSwiper: transform-based (arrows work, smooth, touch-friendly)
//   - DuplicateNav removed; filter bar gets sticky behavior when touching header
//   - Category Carousel section removed
// ============================================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ProductModal from '../components/ui/ProductModal';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import '/src/assets/styles/eglux-design-system.css';
import useProducts from '../hooks/useProducts';

const ITEMS_PER_PAGE = 20;
const HEADER_HEIGHT_DESKTOP = 72;
const HEADER_HEIGHT_MOBILE = 60;

function filterProducts(products, filterValue) {
  if (filterValue === 'all') return products;
  if (filterValue === 'produkbaru') return products.filter((p) => p.badge === 'Baru');
  if (filterValue === 'bestseller') return products.filter((p) => p.badge === 'Best Seller');
  return products.filter((p) => p.category === filterValue);
}

const HomePage = () => {
  const { openCart, handleAddToCart } = useCartActions();
  const { products, filterButtons, loading, error } = useProducts();

  const [banners, setBanners] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const productsSectionRef = useRef(null);
  const filterWrapperRef = useRef(null);
  const [filterStuck, setFilterStuck] = useState(false);

  // Fetch banners
  useEffect(() => {
    const fetchContent = async () => {
      const bannersRes = await supabase.from('homepage_banners').select('*').eq('is_active', true).order('position', { ascending: true });
      if (bannersRes.data) setBanners(bannersRes.data);
    };
    fetchContent();
  }, []);

  // Deep link: ?filter=xxx
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter) {
      setActiveFilter(filter);
      setTimeout(() => productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [searchParams]);

  // Deep link: ?open=<product_id>
  useEffect(() => {
    if (!products.length) return;
    const openId = searchParams.get('open');
    if (!openId) return;
    const match = products.find((p) => p.id === openId);
    if (match) {
      setSelectedProduct(match);
      searchParams.delete('open');
      setSearchParams(searchParams, { replace: true });
    }
  }, [products, searchParams, setSearchParams]);

  // ⭐ Sticky filter bar — detect when filter bar touches header
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!filterWrapperRef.current) return;
      const headerH = window.innerWidth >= 768 ? HEADER_HEIGHT_DESKTOP : HEADER_HEIGHT_MOBILE;
      const wrapperTop = filterWrapperRef.current.getBoundingClientRect().top;
      setFilterStuck(wrapperTop <= headerH);
      ticking = false;
    };
    const handle = () => {
      if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
    };
    window.addEventListener('scroll', handle, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', handle);
  }, []);

  const filteredProducts = useMemo(() => filterProducts(products, activeFilter), [products, activeFilter]);
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const bestSellers = useMemo(() => products.filter((p) => p.badge === 'Best Seller').slice(0, 4), [products]);
  const newArrivals = useMemo(() => products.filter((p) => p.badge === 'Baru').slice(0, 4), [products]);

  const handleFilterChange = (value) => { setActiveFilter(value); setCurrentPage(1); };

  const handleBannerClick = (banner) => {
    if (banner.cta_link_type === 'filter' && banner.cta_link_value) {
      setActiveFilter(banner.cta_link_value); setCurrentPage(1);
      productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (banner.cta_link_type === 'product' && banner.cta_link_value) {
      const match = products.find((p) => p.id === banner.cta_link_value);
      if (match) setSelectedProduct(match);
    } else if (banner.cta_link_type === 'url' && banner.cta_link_value) {
      window.open(banner.cta_link_value, '_blank', 'noopener,noreferrer');
    }
  };

  const handleHighlightProduct = (product) => {
    if (product.badge === 'Best Seller') setActiveFilter('bestseller');
    else if (product.badge === 'Baru') setActiveFilter('produkbaru');
    setCurrentPage(1);
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelectedProduct(product), 500);
  };

  const closeModal = () => setSelectedProduct(null);
  const formatPrice = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v ?? 0);

  // Sticky filter header height
  const headerH = typeof window !== 'undefined' && window.innerWidth >= 768 ? HEADER_HEIGHT_DESKTOP : HEADER_HEIGHT_MOBILE;

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO — Parallax + Transform Swiper
          ═══════════════════════════════════════════════════════════════ */}
      {banners.length > 0 ? (
        <HeroSwiper banners={banners} onBannerClick={handleBannerClick} />
      ) : (
        <section className="hero-parallax bg-[var(--eglux-accent)] flex items-center justify-center">
          <div className="text-center px-4">
            <h2 className="font-heading text-[2rem] md:text-[4rem] font-medium text-eglux-primary tracking-tight">EGLUX</h2>
            <p className="text-[0.8rem] md:text-[1rem] text-eglux-text-muted mt-3 tracking-[0.15em] uppercase">Produk Rumah Tangga & Dapur Berkualitas</p>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: BEST SELLER + PRODUK BARU (combined)
          ═══════════════════════════════════════════════════════════════ */}
      {(bestSellers.length > 0 || newArrivals.length > 0) && (
        <section className="section-overlay bg-eglux-text-muted py-4 md:py-12">
          <div className="max-w-[1600px] mx-auto px-4 md:px-8 w-full">

            {bestSellers.length > 0 && (
              <div className="mb-4 md:mb-8">
                <div className="flex items-end justify-between mb-2 md:mb-5">
                  <div>
                    <h2 className="section-title text-[1.2rem] md:text-[1.6rem]">Best Seller</h2>
                    <p className="section-subtitle">Produk terlaris paling dicari</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('bestseller'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 md:gap-4">
                  {bestSellers.map((product) => (
                    <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact hideBadge />
                  ))}
                </div>
              </div>
            )}

            {newArrivals.length > 0 && (
              <div>
                <div className="flex items-end justify-between mb-2 md:mb-5">
                  <div>
                    <h2 className="section-title text-[1.2rem] md:text-[1.6rem]">Produk Baru</h2>
                    <p className="section-subtitle">Koleksi terbaru EGLUX</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('produkbaru'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 md:gap-4">
                  {newArrivals.map((product) => (
                    <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact hideBadge />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: ALL PRODUCTS — with sticky filter bar
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={productsSectionRef} className="section-overlay bg-white py-6 md:pt-8 md:pb-16" id="products-section">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">

          <div className="text-center mb-4 md:mb-8 pb-1 md:pb-2">
            <h2 className="section-title text-eglux-secondary text-[1.6rem] md:text-[2rem]">Semua Produk</h2>
            <p className="section-subtitle text-eglux-primary mt-2">Temukan produk rumah tangga berkualitas untuk Anda</p>
          </div>

          {/* ⭐ Sticky filter wrapper — detects scroll position */}
          <div ref={filterWrapperRef} className="min-h-[48px]">
            <div
              className={`transition-all duration-300 ${filterStuck
                ? 'fixed left-0 right-0 z-[999] bg-transparent text-eglux-primary shadow-md backdrop-blur-sm'
                : 'relative bg-transparent'
              }`}
              style={filterStuck ? { top: `${headerH}px` } : undefined}
            >
              <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                <div className="flex justify-center gap-1 md:gap-3 flex-wrap py-3">
                  {filterButtons.map((btn) => (
                    <button
                      key={btn.value}
                      onClick={() => handleFilterChange(btn.value)}
                      className={`filter-btn ${activeFilter === btn.value ? 'filter-btn--active' : ''} `}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {loading && <p className="text-center text-gray-400 py-20 text-sm">Memuat produk...</p>}
          {error && <p className="text-center text-red-500 py-20 text-sm">Gagal memuat produk.</p>}

          {!loading && !error && (
            paginatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:gap-6 mt-4 md:mt-8">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} formatPrice={formatPrice} />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-20 text-sm">Tidak ada produk untuk kategori ini.</p>
            )
          )}

          {/* Pagination */}
          {!loading && !error && filteredProducts.length > ITEMS_PER_PAGE && (
            <div className="flex flex-col items-center gap-4 mt-12 pt-8">
              <div className="flex items-center gap-3">
                <button onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  disabled={currentPage <= 1} className="pagination-btn flex items-center justify-center">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="text-xs font-light text-gray-500 px-4 tracking-wide">{currentPage} / {totalPages}</span>
                <button onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  disabled={currentPage >= totalPages} className="pagination-btn flex items-center justify-center">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              <p className="text-[0.7rem] text-gray-400 tracking-wide">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} dari {filteredProducts.length} produk
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />

      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={closeModal} onAddToCart={handleAddToCart} />
      )}
    </>
  );
};

// ============================================================================
// HeroSwiper — Transform-based (arrows work, smooth, touch-friendly)
// ============================================================================
const HeroSwiper = ({ banners, onBannerClick }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const autoAdvanceRef = useRef(null);

  const next = useCallback(() => {
    setActiveIdx((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const prev = useCallback(() => {
    setActiveIdx((p) => (p - 1 + banners.length) % banners.length);
  }, [banners.length]);

  const goTo = useCallback((idx) => {
    setActiveIdx(idx);
  }, []);

  // ⭐ No auto-advance — manual swipe only
  const resetAutoAdvance = () => {};

  // Touch handlers (mobile swipe)
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 40) {
      if (delta > 0) next();
      else prev();
    }
  };

  // Mouse handlers (desktop drag)
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX;
    e.preventDefault(); // prevent text selection
  };
  const handleMouseUp = (e) => {
    touchEndX.current = e.clientX;
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 40) {
      if (delta > 0) next();
      else prev();
    }
  };

  return (
    <section
      className="hero-parallax overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {/* Slides container — transform translateX */}
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${activeIdx * 100}%)` }}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="w-full h-full flex-shrink-0 relative cursor-pointer"
            onClick={() => onBannerClick(banner)}
          >
            <img src={banner.image_url} alt={banner.title || 'EGLUX'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
            <div className="hero-overlay" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="max-w-container mx-auto text-center">
                {banner.subtitle && (
                  <p className="text-white/80 text-[0.7rem] md:text-[0.85rem] font-light uppercase tracking-[0.25em] mb-4">
                    {banner.subtitle}
                  </p>
                )}
                {banner.title && (
                  <h2 className="hero-overlay__title text-[2rem] md:text-[4rem] text-center">{banner.title}</h2>
                )}
                {banner.cta_text && (
                  <button className="hero-overlay__cta mt-8 hover:bg-white hover:text-eglux-primary hover:border-white">{banner.cta_text}</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {banners.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { goTo(idx); resetAutoAdvance(); }}
              className={`rounded-full transition-all duration-300 cursor-pointer border-none ${
                idx === activeIdx ? 'w-6 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* Arrows (desktop + mobile) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => { prev(); resetAutoAdvance(); }}
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center cursor-pointer border-none z-10 transition-all flex"
            aria-label="Previous"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            onClick={() => { next(); resetAutoAdvance(); }}
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center cursor-pointer border-none z-10 transition-all flex"
            aria-label="Next"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </>
      )}
    </section>
  );
};

// ============================================================================
// ProductCard — Borderless Clean
// ============================================================================
const ProductCard = ({ product, onClick, formatPrice, compact, hideBadge }) => {
  const minVariantPrice = product?.minVariantPrice ?? null;
  const minOriginalPrice = product?.minOriginalPrice ?? null;
  const hasActiveDiscount = product?.hasActiveDiscount ?? false;
  const maxDiscountPercent = product?.maxDiscountPercent ?? 0;
  const hasDiscount = hasActiveDiscount && maxDiscountPercent > 0;

  return (
    <article className="product-card group" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className={`product-card__image relative w-full overflow-hidden bg-[var(--eglux-accent)] rounded-xl md:rounded-2xl ${compact ? 'aspect-square' : 'aspect-[4/5]'}`}>
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        {product.badge && !hideBadge && (
          <span className="absolute top-2 left-2 md:top-3 md:left-3 bg-eglux-primary text-white text-[0.55rem] md:text-[0.7rem] font-medium uppercase tracking-[0.1em] px-2 py-0.5 md:px-2.5 md:py-1 rounded-full">{product.badge}</span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 md:top-3 md:right-3 bg-red-500 text-white text-[0.65rem] md:text-[1.1rem] font-bold px-2 py-0.5 md:px-3 md:py-1.5 rounded-full">-{maxDiscountPercent}%</span>
        )}
      </div>
      <div className="pt-1.5 md:pt-4">
        <div className="min-w-0 flex-1">
          <p className="product-card__name line-clamp-2 text-left text-[0.7rem] md:text-[0.85rem]">{product.name}</p>
          <div className="mt-1 md:mt-1.5">
            {minVariantPrice ? (
              <div className="flex flex-col gap-0.5">
                {hasDiscount && minOriginalPrice && minOriginalPrice > minVariantPrice && (
                  <span className="text-gray-400 line-through text-[0.6rem] md:text-[0.75rem] leading-tight">{formatPrice(minOriginalPrice)}</span>
                )}
                <span className="text-eglux-secondary font-medium text-[0.7rem] md:text-[0.85rem] leading-tight">{formatPrice(minVariantPrice)}</span>
              </div>
            ) : (
              <span className="text-[0.7rem] md:text-[0.8rem] text-gray-400">Hubungi CS</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default HomePage;
