// src/pages/HomePage.jsx
// ============================================================================
// HomePage v3 — Beranda + Product page merged (Everyday/Shopee style)
// ============================================================================
//
// Structure (4 sections):
//   1. Hero Swiper — banner dari DB (admin upload). Klik → filter produk.
//   2. Best Seller — 4 produk preview (badge='Best Seller'). Klik → filter + open modal.
//   3. Category Carousel — horizontal scroll. Klik → filter by kategori.
//   4. All Products — full catalog + filter bar + pagination.
//
// Dynamic content from DB:
//   - homepage_banners (hero swiper images)
//   - homepage_categories (category carousel images)
//   - products (best seller + all products)
//
// Deep links:
//   /?filter=kitchen     → scroll to products + filter kitchen
//   /?filter=bestseller  → scroll to products + filter best seller
//   /?filter=produkbaru  → scroll to products + filter produk baru
//   /?open=<product_id>  → scroll to products + open ProductModal
// ============================================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ProductModal from '../components/ui/ProductModal';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

// ── Reuse useProducts hook ──
import useProducts from '../hooks/useProducts';

// ── Constants ──
const ITEMS_PER_PAGE = 12;

// ── Filter function (same as ProductsSection) ──
const KEYWORD_FILTERS = ['produkbaru', 'bestseller'];
function filterProducts(products, filterValue) {
  if (filterValue === 'all') return products;
  if (filterValue === 'produkbaru') return products.filter((p) => p.badge === 'Baru');
  if (filterValue === 'bestseller') return products.filter((p) => p.badge === 'Best Seller');
  return products.filter((p) => p.category === filterValue);
}

const HomePage = () => {
  const { openCart, handleAddToCart } = useCartActions();
  const { products, filterButtons, loading, error, refreshProducts } = useProducts();

  // ── State ──
  const [banners, setBanners] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Refs untuk scroll ──
  const productsSectionRef = useRef(null);
  const bestSellerRef = useRef(null);

  // ── Fetch banners + categories dari DB ──
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

  // ── Deep link: ?filter=xxx → scroll to products + set filter ──
  useEffect(() => {
    const filter = searchParams.get('filter');
    if (filter) {
      setActiveFilter(filter);
      // Scroll to products section
      setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [searchParams]);

  // ── Deep link: ?open=<product_id> → open ProductModal ──
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

  // ── Filtered + paginated products ──
  const filteredProducts = useMemo(() => {
    return filterProducts(products, activeFilter);
  }, [products, activeFilter]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // ── Best Seller products (top 4) ──
  const bestSellers = useMemo(() => {
    return products.filter((p) => p.badge === 'Best Seller').slice(0, 4);
  }, [products]);

  // ── New Arrival products (top 4) ──
  const newArrivals = useMemo(() => {
    return products.filter((p) => p.badge === 'Baru').slice(0, 4);
  }, [products]);

  // ── Handlers ──
  const handleFilterChange = (value) => {
    setActiveFilter(value);
    setCurrentPage(1);
  };

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

  // ⭐ Highlight product: klik di Best Seller/New Arrival → filter + open modal
  const handleHighlightProduct = (product) => {
    // Set filter berdasarkan badge product
    if (product.badge === 'Best Seller') {
      setActiveFilter('bestseller');
    } else if (product.badge === 'Baru') {
      setActiveFilter('produkbaru');
    }
    setCurrentPage(1);
    // Scroll to products section
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Open ProductModal (delay supaya scroll smooth dulu)
    setTimeout(() => setSelectedProduct(product), 500);
  };

  const handleOpenModal = (product) => {
    setSelectedProduct(product);
  };

  const closeModal = () => setSelectedProduct(null);

  // ── Format price helper ──
  const formatPrice = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value ?? 0);

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      {/* ================================================================
          SECTION 1: HERO SWIPER (banners from DB)
          ================================================================ */}
      {banners.length > 0 && (
        <section className="relative w-full overflow-hidden">
          <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
            {banners.map((banner) => (
              <div
                key={banner.id}
                className="w-full flex-shrink-0 snap-center relative cursor-pointer"
                onClick={() => handleBannerClick(banner)}
              >
                <div className="relative w-full h-[300px] md:h-[450px] lg:h-[550px]">
                  <img
                    src={banner.image_url}
                    alt={banner.title || 'EGLUX Banner'}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  {/* Content overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
                    <div className="max-w-container mx-auto">
                      {banner.subtitle && (
                        <p className="text-eglux-secondary text-[0.8rem] md:text-[1rem] font-semibold uppercase tracking-wide mb-2">
                          {banner.subtitle}
                        </p>
                      )}
                      {banner.title && (
                        <h2 className="text-white text-[1.5rem] md:text-[2.5rem] lg:text-[3rem] font-bold leading-tight mb-4 max-w-[600px]">
                          {banner.title}
                        </h2>
                      )}
                      {banner.cta_text && (
                        <button className="inline-block bg-eglux-secondary text-white px-6 py-3 rounded-lg text-[0.85rem] md:text-[0.95rem] font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none">
                          {banner.cta_text}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Swiper dots */}
          {banners.length > 1 && (
            <div className="absolute bottom-4 right-6 flex gap-2">
              {banners.map((_, idx) => (
                <span key={idx} className="w-2 h-2 rounded-full bg-white/50" />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================================================================
          SECTION 2: BEST SELLER (4 produk preview)
          ================================================================ */}
      {bestSellers.length > 0 && (
        <section ref={bestSellerRef} className="bg-white py-12 md:py-16">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <div>
                <h2 className="text-[1.3rem] md:text-[1.8rem] font-bold text-eglux-primary">Best Seller</h2>
                <p className="text-[0.8rem] text-gray-400 mt-1">Produk terlaris paling dicari</p>
              </div>
              <button
                onClick={() => {
                  setActiveFilter('bestseller');
                  setCurrentPage(1);
                  productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-[0.8rem] text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
              >
                Lihat Semua →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
              {bestSellers.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => handleHighlightProduct(product)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          SECTION 3: CATEGORY CAROUSEL (horizontal scroll from DB)
          ================================================================ */}
      {categories.length > 0 && (
        <section className="bg-[#faf6ef] py-12 md:py-16">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <h2 className="text-[1.3rem] md:text-[1.8rem] font-bold text-eglux-primary mb-6 md:mb-8">Kategori</h2>
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryClick(category)}
                  className="flex-shrink-0 w-[160px] md:w-[220px] group cursor-pointer border-none bg-transparent p-0"
                >
                  <div className="relative w-full h-[200px] md:h-[280px] rounded-xl overflow-hidden">
                    <img
                      src={category.image_url}
                      alt={category.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white text-[0.9rem] md:text-[1.1rem] font-bold capitalize">{category.name}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          SECTION 3.5: NEW ARRIVAL (4 produk preview) — jika ada
          ================================================================ */}
      {newArrivals.length > 0 && (
        <section className="bg-white py-12 md:py-16">
          <div className="max-w-container mx-auto px-4 md:px-8">
            <div className="flex items-center justify-between mb-6 md:mb-8">
              <div>
                <h2 className="text-[1.3rem] md:text-[1.8rem] font-bold text-eglux-primary">Produk Baru</h2>
                <p className="text-[0.8rem] text-gray-400 mt-1">Koleksi terbaru EGLUX</p>
              </div>
              <button
                onClick={() => {
                  setActiveFilter('produkbaru');
                  setCurrentPage(1);
                  productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="text-[0.8rem] text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
              >
                Lihat Semua →
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
              {newArrivals.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => handleHighlightProduct(product)}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================
          SECTION 4: ALL PRODUCTS (full catalog + filter + pagination)
          ================================================================ */}
      <section ref={productsSectionRef} className="bg-white py-12 pb-20" id="products-section">
        <div className="max-w-container mx-auto px-4 md:px-8">

          {/* Section header */}
          <div className="text-center mb-8">
            <h2 className="text-[1.5rem] md:text-[2rem] font-bold text-eglux-primary">Semua Produk</h2>
            <p className="text-[0.85rem] text-gray-400 mt-1">Temukan produk rumah tangga berkualitas untuk Anda</p>
          </div>

          {/* Filter Bar */}
          {!loading && !error && (
            <div className="flex justify-center gap-2 md:gap-3 flex-wrap mb-8">
              {filterButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => handleFilterChange(btn.value)}
                  className={`py-2.5 px-4 md:px-5 rounded-full border-2 cursor-pointer font-medium transition-all duration-300 text-[0.82rem] md:text-sm
                    ${activeFilter === btn.value
                      ? 'bg-eglux-primary text-white border-eglux-primary'
                      : 'bg-white text-eglux-primary border-eglux-primary/30 hover:bg-eglux-primary hover:text-white hover:border-eglux-primary'}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <p className="text-center text-gray-400 py-16 text-base">Memuat produk...</p>
          )}

          {/* Error */}
          {error && (
            <p className="text-center text-red-500 py-16 text-base">Gagal memuat produk. Coba refresh halaman.</p>
          )}

          {/* Product Grid */}
          {!loading && !error && (
            paginatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
                {paginatedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => handleOpenModal(product)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-16 text-base">
                Tidak ada produk untuk kategori ini.
              </p>
            )
          )}

          {/* Pagination */}
          {!loading && !error && filteredProducts.length > ITEMS_PER_PAGE && (
            <div className="flex flex-col items-center gap-4 mt-12 pt-8 border-t border-[#eee]">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  disabled={currentPage <= 1}
                  className="w-10 h-10 border-2 border-eglux-primary bg-white rounded-full flex items-center justify-center text-eglux-primary cursor-pointer transition-all hover:bg-eglux-primary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <span className="text-sm font-medium text-gray-600">
                  Halaman {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  disabled={currentPage >= totalPages}
                  className="w-10 h-10 border-2 border-eglux-primary bg-white rounded-full flex items-center justify-center text-eglux-primary cursor-pointer transition-all hover:bg-eglux-primary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
              <p className="text-[0.8rem] text-gray-400">
                Menampilkan {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} dari {filteredProducts.length} produk
              </p>
            </div>
          )}
        </div>
      </section>

      <Footer />

      {/* Product Modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={closeModal}
          onAddToCart={handleAddToCart}
        />
      )}
    </>
  );
};

// ============================================================================
// ProductCard — Reusable card component (discount-aware)
// ============================================================================
const ProductCard = ({ product, onClick }) => {
  const minVariantPrice = product?.minVariantPrice ?? null;
  const minOriginalPrice = product?.minOriginalPrice ?? null;
  const hasActiveDiscount = product?.hasActiveDiscount ?? false;
  const maxDiscountPercent = product?.maxDiscountPercent ?? 0;
  const hasDiscount = hasActiveDiscount && maxDiscountPercent > 0;

  return (
    <article
      className="group bg-white rounded-[16px] md:rounded-[20px] overflow-hidden cursor-pointer border border-[#eee]
                 transition-all duration-300 hover:-translate-y-2 hover:shadow-lg hover:border-transparent"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <div className="relative overflow-hidden h-[200px] md:h-[250px]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        {product.badge && (
          <span className="absolute top-3 left-3 bg-eglux-secondary text-white text-[0.65rem] md:text-[0.75rem] font-semibold py-1 px-2.5 md:px-3 rounded-full">
            {product.badge}
          </span>
        )}
        {hasDiscount && (
          <span className="absolute top-3 right-3 bg-red-500 text-white text-[0.65rem] md:text-[0.72rem] font-bold py-1 px-2 rounded-full shadow-sm">
            -{maxDiscountPercent}%
          </span>
        )}
      </div>
      <div className="p-3 md:p-6">
        <h4 className="text-[0.82rem] md:text-base font-semibold text-eglux-primary mb-1 leading-snug line-clamp-2">
          {product.name}
        </h4>
        <p className="text-[0.7rem] md:text-[0.85rem] text-gray-400 mb-2 md:mb-3 capitalize">{product.category}</p>
        <div>
          {minVariantPrice ? (
            <>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                {hasDiscount && minOriginalPrice && minOriginalPrice > minVariantPrice && (
                  <span className="text-[0.65rem] md:text-[0.78rem] text-gray-400 line-through">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(minOriginalPrice)}
                  </span>
                )}
                <span className="text-[0.9rem] md:text-[1.15rem] font-bold text-eglux-secondary">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(minVariantPrice)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[0.82rem] md:text-[0.95rem] font-semibold text-gray-400">Hubungi CS</p>
          )}
        </div>
      </div>
    </article>
  );
};

export default HomePage;
