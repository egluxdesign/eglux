// src/pages/HomePage.jsx
// ============================================================================
// HomePage v4.2 — Parallax hero + combined sections + 2-col grid
// ============================================================================
//
// Changes from v4.1:
//   - Best Seller + Produk Baru combined into 1 section (both visible in 1 viewport)
//   - Other sections: natural flow (no forced min-height: 100vh)
//   - Only hero is full-page parallax; category carousel is full-page
// ============================================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ProductModal from '../components/ui/ProductModal';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import '/src/assets/styles/eglux-design-system.css';
import useProducts from '../hooks/useProducts';

const ITEMS_PER_PAGE = 20;

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
  const [categories, setCategories] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const productsSectionRef = useRef(null);

  useEffect(() => {
    const fetchContent = async () => {
      const [bannersRes, categoriesRes] = await Promise.all([
        supabase.from('homepage_banners').select('*').eq('is_active', true).order('position', { ascending: true }),
        supabase.from('homepage_categories').select('*').eq('is_active', true).order('position', { ascending: true }),
      ]);
      if (bannersRes.data) setBanners(bannersRes.data);
      if (categoriesRes.data) setCategories(categoriesRes.data);
    };
    fetchContent();
  }, []);

  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter) {
      setActiveFilter(filter);
      setTimeout(() => productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    }
  }, [searchParams]);

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

  const handleCategoryClick = (category) => {
    setActiveFilter(category.filter_value); setCurrentPage(1);
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO — Parallax sticky + swipeable banner
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
          SECTION 2: BEST SELLER + PRODUK BARU (combined, 1 viewport)
          ═══════════════════════════════════════════════════════════════ */}
      {(bestSellers.length > 0 || newArrivals.length > 0) && (
        <section className="section-overlay bg-white py-16 md:py-20">
          <div className="max-w-[1600px] mx-auto px-4 md:px-8">

            {/* Best Seller subsection */}
            {bestSellers.length > 0 && (
              <div className="mb-12 md:mb-16">
                <div className="flex items-end justify-between mb-6 md:mb-8">
                  <div>
                    <h2 className="section-title text-[1.4rem] md:text-[1.8rem]">Best Seller</h2>
                    <p className="section-subtitle">Produk terlaris paling dicari</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('bestseller'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                {/* ⭐ 4 columns for Best Seller (different from All Products 2-col) */}
                <div className="grid grid-cols-4 gap-2 md:gap-4">
                  {bestSellers.map((product) => (
                    <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact />
                  ))}
                </div>
              </div>
            )}

            {/* Produk Baru subsection (same section, no extra spacing) */}
            {newArrivals.length > 0 && (
              <div>
                <div className="flex items-end justify-between mb-6 md:mb-8">
                  <div>
                    <h2 className="section-title text-[1.4rem] md:text-[1.8rem]">Produk Baru</h2>
                    <p className="section-subtitle">Koleksi terbaru EGLUX</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('produkbaru'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                {/* ⭐ 4 columns for Produk Baru */}
                <div className="grid grid-cols-4 gap-2 md:gap-4">
                  {newArrivals.map((product) => (
                    <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: CATEGORY CAROUSEL
          ═══════════════════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="section-overlay bg-[var(--eglux-accent)] py-16 md:py-20">
          <div className="max-w-[1600px] mx-auto px-4 md:px-8">
            <h2 className="section-title mb-6 md:mb-8">Kategori</h2>
            <div className="flex gap-6 md:gap-8 overflow-x-auto pb-4 no-scrollbar">
              {categories.map((category) => (
                <button key={category.id} onClick={() => handleCategoryClick(category)} className="flex-shrink-0 w-[200px] md:w-[280px] group cursor-pointer border-none bg-transparent p-0">
                  <div className="relative w-full h-[260px] md:h-[360px] overflow-hidden">
                    <img src={category.image_url} alt={category.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                      <p className="text-white text-[1rem] md:text-[1.2rem] font-light tracking-wide font-heading">{category.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: ALL PRODUCTS (natural flow, 2-column grid)
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={productsSectionRef} className="section-overlay bg-white py-16 md:py-20" id="products-section">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8">

          <div className="text-center mb-8 md:mb-12">
            <h2 className="section-title text-[1.6rem] md:text-[2rem]">Semua Produk</h2>
            <p className="section-subtitle mt-2">Temukan produk rumah tangga berkualitas untuk Anda</p>
          </div>

          {/* Filter */}
          {!loading && !error && (
            <div className="flex justify-center gap-1 md:gap-3 flex-wrap mb-8 md:mb-12">
              {filterButtons.map((btn) => (
                <button key={btn.value} onClick={() => handleFilterChange(btn.value)}
                  className={`filter-btn ${activeFilter === btn.value ? 'filter-btn--active' : ''}`}>
                  {btn.label}
                </button>
              ))}
            </div>
          )}

          {loading && <p className="text-center text-gray-400 py-20 text-sm">Memuat produk...</p>}
          {error && <p className="text-center text-red-500 py-20 text-sm">Gagal memuat produk.</p>}

          {!loading && !error && (
            paginatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:gap-6">
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
// HeroSwiper — Functional swipeable hero with dots + auto-advance
// ============================================================================
const HeroSwiper = ({ banners, onBannerClick }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);

  // Auto-advance every 5s
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  // Scroll to active slide
  useEffect(() => {
    if (scrollRef.current && banners.length > 1) {
      const scrollLeft = activeIdx * scrollRef.current.offsetWidth;
      scrollRef.current.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activeIdx, banners.length]);

  // Detect active slide on manual scroll
  const handleScroll = () => {
    if (!scrollRef.current || isDragging.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const width = scrollRef.current.offsetWidth;
    const idx = Math.round(scrollLeft / width);
    if (idx !== activeIdx) setActiveIdx(idx);
  };

  // Mouse drag support (desktop)
  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX;
    scrollStart.current = scrollRef.current.scrollLeft;
  };
  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const delta = e.pageX - startX.current;
    scrollRef.current.scrollLeft = scrollStart.current - delta;
  };
  const handleMouseUp = () => {
    isDragging.current = false;
  };

  return (
    <section className="hero-parallax">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full h-full flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{ scrollBehavior: 'smooth' }}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="w-full h-full flex-shrink-0 snap-center relative"
            onClick={() => !isDragging.current && onBannerClick(banner)}
          >
            <img src={banner.image_url} alt={banner.title || 'EGLUX'} className="w-full h-full object-cover pointer-events-none" />
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
              onClick={() => setActiveIdx(idx)}
              className={`rounded-full transition-all duration-300 cursor-pointer border-none ${
                idx === activeIdx ? 'w-6 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* Arrow nav (desktop) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={() => setActiveIdx((prev) => (prev - 1 + banners.length) % banners.length)}
            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center cursor-pointer border-none z-10 transition-all"
            aria-label="Previous"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button
            onClick={() => setActiveIdx((prev) => (prev + 1) % banners.length)}
            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white items-center justify-center cursor-pointer border-none z-10 transition-all"
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
const ProductCard = ({ product, onClick, formatPrice, compact }) => {
  const minVariantPrice = product?.minVariantPrice ?? null;
  const minOriginalPrice = product?.minOriginalPrice ?? null;
  const hasActiveDiscount = product?.hasActiveDiscount ?? false;
  const maxDiscountPercent = product?.maxDiscountPercent ?? 0;
  const hasDiscount = hasActiveDiscount && maxDiscountPercent > 0;

  return (
    <article className="product-card group" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      <div className={`product-card__image relative w-full overflow-hidden bg-[var(--eglux-accent)] rounded-xl md:rounded-2xl ${compact ? 'aspect-square' : 'aspect-[4/5]'}`}>
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        {product.badge && (
          <span className="absolute top-2 left-2 md:top-3 md:left-3 bg-eglux-primary text-white text-[0.55rem] md:text-[0.7rem] font-medium uppercase tracking-[0.1em] px-2 py-0.5 md:px-2.5 md:py-1 rounded-full">{product.badge}</span>
        )}
        {hasDiscount && (
          <span className="absolute top-2 right-2 md:top-3 md:right-3 bg-red-500 text-white text-[0.65rem] md:text-[1.1rem] font-bold px-2 py-0.5 md:px-3 md:py-1.5 rounded-full">-{maxDiscountPercent}%</span>
        )}
      </div>
      <div className={`pt-2 md:pt-4`}>
        <div className="min-w-0 flex-1">
          <p className="product-card__name line-clamp-2 text-left">{product.name}</p>
          <div className="mt-1.5">
            {minVariantPrice ? (
              <div className="flex items-baseline gap-1.5">
                {hasDiscount && minOriginalPrice && minOriginalPrice > minVariantPrice && (
                  <span className="product-card__price-original">{formatPrice(minOriginalPrice)}</span>
                )}
                <span className="product-card__price">{formatPrice(minVariantPrice)}</span>
              </div>
            ) : (
              <span className="text-[0.8rem] text-gray-400">Hubungi CS</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default HomePage;
