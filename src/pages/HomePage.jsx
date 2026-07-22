// src/pages/HomePage.jsx
// ============================================================================
// HomePage v3.1 — Ruadh-inspired luxury editorial aesthetic
// ============================================================================
// Design changes from v3:
//   - Playfair Display serif for section titles + hero title
//   - Inter sans-serif for body + product names + prices
//   - Product cards: borderless, no shadow, no border-radius
//   - Section spacing: more generous (80px+)
//   - Hero overlay: minimal text, outline CTA button
//   - Filter buttons: underline style (not pill)
//   - "Lihat Semua": text link with underline (not button)
//   - Pagination: minimal square buttons
// ============================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ProductModal from '../components/ui/ProductModal';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import '../styles/eglux-design-system.css';

import useProducts from '../hooks/useProducts';

const ITEMS_PER_PAGE = 12;

const KEYWORD_FILTERS = ['produkbaru', 'bestseller'];
function filterProducts(products, filterValue) {
  if (filterValue === 'all') return products;
  if (filterValue === 'produkbaru') return products.filter((p) => p.badge === 'Baru');
  if (filterValue === 'bestseller') return products.filter((p) => p.badge === 'Best Seller');
  if (KEYWORD_FILTERS.includes(filterValue)) {
    return products.filter((p) => p.name.toLowerCase().includes(filterValue));
  }
  return products.filter((p) => p.category === filterValue);
}

const HomePage = () => {
  const { openCart, handleAddToCart } = useCartActions();
  const { products, filterButtons, loading, error, refreshProducts } = useProducts();

  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const productsSectionRef = useRef(null);

  // ── Fetch banners + categories ──
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

  // ── Deep link: ?filter=xxx ──
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter) {
      setActiveFilter(filter);
      setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [searchParams]);

  // ── Deep link: ?open=<product_id> ──
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

  // ── Filtered + paginated ──
  const filteredProducts = useMemo(() => filterProducts(products, activeFilter), [products, activeFilter]);
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const bestSellers = useMemo(() => products.filter((p) => p.badge === 'Best Seller').slice(0, 4), [products]);
  const newArrivals = useMemo(() => products.filter((p) => p.badge === 'Baru').slice(0, 4), [products]);

  // ── Handlers ──
  const handleFilterChange = (value) => { setActiveFilter(value); setCurrentPage(1); };

  const handleBannerClick = (banner) => {
    if (banner.cta_link_type === 'filter' && banner.cta_link_value) {
      setActiveFilter(banner.cta_link_value);
      setCurrentPage(1);
      productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (banner.cta_link_type === 'product' && banner.cta_link_value) {
      const match = products.find((p) => p.id === banner.cta_link_value);
      if (match) setSelectedProduct(match);
    } else if (banner.cta_link_type === 'url' && banner.cta_link_value) {
      window.open(banner.cta_link_value, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCategoryClick = (category) => {
    setActiveFilter(category.filter_value);
    setCurrentPage(1);
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
          SECTION 1: HERO SWIPER (minimal overlay)
          ═══════════════════════════════════════════════════════════════ */}
      {banners.length > 0 && (
        <section className="relative w-full overflow-hidden">
          <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
            {banners.map((banner) => (
              <div key={banner.id} className="w-full flex-shrink-0 snap-center relative cursor-pointer" onClick={() => handleBannerClick(banner)}>
                <div className="relative w-full h-[320px] md:h-[500px] lg:h-[600px]">
                  <img src={banner.image_url} alt={banner.title || 'EGLUX'} className="w-full h-full object-cover" loading="eager" />
                  {/* Minimal gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  {/* Overlay content */}
                  <div className="hero-overlay">
                    <div className="max-w-container mx-auto">
                      {banner.subtitle && (
                        <p className="text-white/70 text-[0.7rem] md:text-[0.8rem] font-light uppercase tracking-[0.2em] mb-3">
                          {banner.subtitle}
                        </p>
                      )}
                      {banner.title && (
                        <h2 className="hero-overlay__title">{banner.title}</h2>
                      )}
                      {banner.cta_text && (
                        <button className="hero-overlay__cta">{banner.cta_text}</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: BEST SELLER
          ═══════════════════════════════════════════════════════════════ */}
      {bestSellers.length > 0 && (
        <section className="bg-white section-spacing">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <div className="flex items-end justify-between mb-8 md:mb-12">
              <div>
                <h2 className="section-title">Best Seller</h2>
                <p className="section-subtitle">Produk terlaris paling dicari</p>
              </div>
              <button
                onClick={() => { setActiveFilter('bestseller'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="see-all-link"
              >
                Lihat Semua
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {bestSellers.map((product) => (
                <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: CATEGORY CAROUSEL
          ═══════════════════════════════════════════════════════════════ */}
      {categories.length > 0 && (
        <section className="bg-[var(--eglux-accent)] section-spacing">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <h2 className="section-title mb-8 md:mb-12">Kategori</h2>
            <div className="flex gap-6 overflow-x-auto pb-4 no-scrollbar">
              {categories.map((category) => (
                <button key={category.id} onClick={() => handleCategoryClick(category)} className="flex-shrink-0 w-[180px] md:w-[240px] group cursor-pointer border-none bg-transparent p-0">
                  <div className="relative w-full h-[220px] md:h-[300px] overflow-hidden">
                    <img src={category.image_url} alt={category.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="text-white text-[0.95rem] md:text-[1.1rem] font-medium tracking-wide">{category.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3.5: NEW ARRIVAL
          ═══════════════════════════════════════════════════════════════ */}
      {newArrivals.length > 0 && (
        <section className="bg-white section-spacing">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <div className="flex items-end justify-between mb-8 md:mb-12">
              <div>
                <h2 className="section-title">Produk Baru</h2>
                <p className="section-subtitle">Koleksi terbaru EGLUX</p>
              </div>
              <button
                onClick={() => { setActiveFilter('produkbaru'); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="see-all-link"
              >
                Lihat Semua
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
              {newArrivals.map((product) => (
                <ProductCard key={product.id} product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: ALL PRODUCTS
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={productsSectionRef} className="bg-white section-spacing" id="products-section">
        <div className="max-w-container mx-auto px-4 md:px-8">

          {/* Section header */}
          <div className="text-center mb-10 md:mb-14">
            <h2 className="section-title text-[1.8rem] md:text-[2.2rem]">Semua Produk</h2>
            <p className="section-subtitle mt-2">Temukan produk rumah tangga berkualitas untuk Anda</p>
          </div>

          {/* Filter Bar — underline style */}
          {!loading && !error && (
            <div className="flex justify-center gap-1 md:gap-2 flex-wrap mb-10 md:mb-14">
              {filterButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => handleFilterChange(btn.value)}
                  className={`filter-btn ${activeFilter === btn.value ? 'filter-btn--active' : ''}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && <p className="text-center text-gray-400 py-20 text-sm">Memuat produk...</p>}

          {/* Error */}
          {error && <p className="text-center text-red-500 py-20 text-sm">Gagal memuat produk. Coba refresh halaman.</p>}

          {/* Product Grid */}
          {!loading && !error && (
            paginatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} formatPrice={formatPrice} />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-20 text-sm">Tidak ada produk untuk kategori ini.</p>
            )
          )}

          {/* Pagination — minimal */}
          {!loading && !error && filteredProducts.length > ITEMS_PER_PAGE && (
            <div className="flex flex-col items-center gap-4 mt-16 pt-8">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(1, p - 1)); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  disabled={currentPage <= 1}
                  className="pagination-btn flex items-center justify-center"
                >
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="text-xs font-light text-gray-500 px-4 tracking-wide">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => { setCurrentPage((p) => Math.min(totalPages, p + 1)); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  disabled={currentPage >= totalPages}
                  className="pagination-btn flex items-center justify-center"
                >
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
// ProductCard — Borderless Clean (Ruadh/IKEA style)
// ============================================================================
const ProductCard = ({ product, onClick, formatPrice }) => {
  const minVariantPrice = product?.minVariantPrice ?? null;
  const minOriginalPrice = product?.minOriginalPrice ?? null;
  const hasActiveDiscount = product?.hasActiveDiscount ?? false;
  const maxDiscountPercent = product?.maxDiscountPercent ?? 0;
  const hasDiscount = hasActiveDiscount && maxDiscountPercent > 0;

  return (
    <article className="product-card group" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick()}>
      {/* Image — borderless, no rounded */}
      <div className="product-card__image relative w-full aspect-square overflow-hidden bg-[var(--eglux-accent)]">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        {/* Badge — sharp corners, minimal */}
        {product.badge && (
          <span className="product-badge absolute top-3 left-3">{product.badge}</span>
        )}
        {hasDiscount && (
          <span className="product-badge product-badge--discount absolute top-3 right-3">-{maxDiscountPercent}%</span>
        )}
      </div>
      {/* Info — clean, generous spacing */}
      <div className="pt-3">
        <p className="product-card__name line-clamp-2">{product.name}</p>
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
    </article>
  );
};

export default HomePage;
