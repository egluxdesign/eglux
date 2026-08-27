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
import { useSearchParams, useLocation } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ProductModal from '../components/ui/ProductModal';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import useToast from '../hooks/useToast';
import Toast from '../components/ui/Toast';
import '/src/assets/styles/eglux-design-system.css';
import useProducts from '../hooks/useProducts';

const ITEMS_PER_PAGE = 20;
const HEADER_HEIGHT_DESKTOP = 72;
const HEADER_HEIGHT_MOBILE = 60;

function filterProducts(products, filterValue, subValue = null) {
  if (!filterValue || filterValue === 'all') {
    // ⭐ Kalau no filter tapi ada sub (e.g., dari sidebar submenu dengan parent 'all'),
    // filter by name contains saja (cross-category)
    if (subValue) {
      const subLower = subValue.toLowerCase();
      return products.filter((p) => (p.name || '').toLowerCase().includes(subLower));
    }
    return products;
  }

  // ⭐ Special filters (badge-based)
  let categoryFiltered;
  if (filterValue === 'produkbaru') {
    categoryFiltered = products.filter((p) => p.badge === 'Baru');
  } else if (filterValue === 'bestseller') {
    categoryFiltered = products.filter((p) => p.badge === 'Best Seller');
  } else {
    // ⭐ Category filter (kitchen/storage/homedecor/bathroom)
    categoryFiltered = products.filter((p) => p.category === filterValue);
  }

  // ⭐ Sub-category filter: filter by product name contains sub (case-insensitive)
  // Dengan FALLBACK: kalau produk dengan nama "sub" gak ada di category tsb,
  // cari cross-category (mungkin category di DB salah/null)
  if (subValue) {
    const subLower = subValue.toLowerCase();
    const nameMatches = (p) => (p.name || '').toLowerCase().includes(subLower);

    // Step 1: Ideal case — category match + name match
    const idealMatches = categoryFiltered.filter(nameMatches);
    if (idealMatches.length > 0) {
      return idealMatches;
    }

    // Step 2: Fallback — name match saja (cross-category)
    // Triggered kalau produk ada tapi category-nya bukan kitchen (data inconsistency)
    const fallbackMatches = products.filter(nameMatches);
    if (fallbackMatches.length > 0) {
      console.warn(
        `[filterProducts] Sub "${subValue}" tidak ditemukan di category "${filterValue}". ` +
        `Fallback ke name-based search cross-category. ` +
        `Produk yang match:`, fallbackMatches.map(p => ({ id: p.id, name: p.name, category: p.category }))
      );
    }
    return fallbackMatches;
  }

  return categoryFiltered;
}

const WA_GROUP_LINK = 'https://chat.whatsapp.com/JjbuZvAkRSA4yPL0E3aDRQ?s=qs&p=i&ilr=2';

const HomePage = () => {
  const { openCart, handleAddToCart } = useCartActions();
  const { products, filterButtons, loading, error } = useProducts();
    const { toast, showToast, closeToast } = useToast();
  const location = useLocation();

  // ⭐ NEW: Detect register redirect — tampilkan membership card
  const [showMembershipCard, setShowMembershipCard] = useState(false);
  const [regWaOptIn, setRegWaOptIn] = useState(false);
  const [regPhone, setRegPhone] = useState('');

  useEffect(() => {
    if (location.state?.justRegistered) {
      setShowMembershipCard(true);
      setRegWaOptIn(location.state?.waOptIn || false);
      setRegPhone(location.state?.phone || '');
      // Clear state supaya gak muncul lagi saat refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [banners, setBanners] = useState([]);
  const [overlayTimedOut, setOverlayTimedOut] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeSub, setActiveSub] = useState(null);  // ⭐ sub-category untuk sidebar submenu
  const [searchQuery, setSearchQuery] = useState('');  // ⭐ name-based search di All Products section
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

    // ⭐ Safety: kalau banners gak load dalam 6s (network error / DB down),
    // hide overlay & show fallback hero. Cegah infinite loader.
    const timeout = setTimeout(() => setOverlayTimedOut(true), 6000);
    return () => clearTimeout(timeout);
  }, []);

  // ⭐ Helper: cek apakah nilai filter valid (ada di filterButtons atau badge/special values)
  // Dipindah ke ATAS sebelum deep link effect supaya gak ReferenceError (const gak hoisted)
  const isValidFilterValue = useCallback((value) => {
    if (!value) return false;
    const knownValues = ['all', 'produkbaru', 'bestseller', ...filterButtons.map((b) => b.value)];
    return knownValues.includes(value);
  }, [filterButtons]);

  // Deep link: ?filter=xxx&sub=yyy
  // ⭐ v2: validate filter + handle sub + toast feedback
  useEffect(() => {
    const filter = searchParams.get('filter');
    const sub = searchParams.get('sub');

    if (!filter) return;

    // ⭐ Validate filter value
    if (!isValidFilterValue(filter)) {
      console.warn('[HomePage] invalid filter from URL:', filter);
      showToast(`Filter "${filter}" tidak ditemukan. Menampilkan semua produk.`, 'error');
      setActiveFilter('all');
      setActiveSub(null);
      setCurrentPage(1);
      // Clean URL (hapus invalid filter)
      searchParams.delete('filter');
      searchParams.delete('sub');
      setSearchParams(searchParams, { replace: true });
      setTimeout(() => productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      return;
    }

    // ⭐ Valid filter — apply
    setActiveFilter(filter);
    setActiveSub(sub);
    setCurrentPage(1);

    // ⭐ Toast feedback (kasih tau user filter apa yang aktif)
    const filterLabel = filter === 'all' ? 'Semua Produk'
      : filter === 'produkbaru' ? 'Produk Baru'
      : filter === 'bestseller' ? 'Best Seller'
      : filter.charAt(0).toUpperCase() + filter.slice(1);
    const subLabel = sub ? `: ${sub.charAt(0).toUpperCase() + sub.slice(1)}` : '';
    showToast(`Menampilkan: ${filterLabel}${subLabel}`, 'info');

    // ⭐ Scroll ke products section
    setTimeout(() => productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [searchParams, isValidFilterValue, showToast, setSearchParams]);

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

  // ⭐ filteredProducts: filter by category (activeFilter) + sub (activeSub) + search query (searchQuery)
  // Search query = name-based, case-insensitive, contains match
  const filteredProducts = useMemo(() => {
    let result = filterProducts(products, activeFilter, activeSub);

    // ⭐ Name-based search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) =>
        (p.name || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, activeFilter, activeSub, searchQuery]);
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const bestSellers = useMemo(() => products.filter((p) => p.badge === 'Best Seller').slice(0, 10), [products]);
  const newArrivals = useMemo(() => products.filter((p) => p.badge === 'Baru').slice(0, 10), [products]);

  const handleFilterChange = (value) => {
    setActiveFilter(value);
    setActiveSub(null);  // ⭐ Reset sub saat user klik filter button manual
    setCurrentPage(1);
  };

  // ⭐ Search handler — update query + reset ke page 1
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // ⭐ Clear search — reset query + reset page
  const handleClearSearch = () => {
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handleBannerClick = (banner) => {
    // Defensive: pastikan banner object ada & punya cta_link_type
    if (!banner) return;
    const ctaType = banner.cta_link_type || 'none';
    const ctaValue = banner.cta_link_value || '';

    if (ctaType === 'none' || !ctaValue) {
      return;
    }

    if (ctaType === 'filter') {
      // ⭐ Filter produk — value bisa: kitchen/storage/homedecor/bathroom/bestseller/produkbaru
      if (isValidFilterValue(ctaValue)) {
        setActiveFilter(ctaValue);
        setActiveSub(null);  // ⭐ Reset sub (banner CTA gak support sub)
        setCurrentPage(1);
      } else {
        setActiveFilter('all');
        setActiveSub(null);
        setCurrentPage(1);
        showToast(`Filter "${ctaValue}" tidak ditemukan. Menampilkan semua produk.`, 'error');
      }
      setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return;
    }

    if (ctaType === 'product') {
      const match = products.find((p) => p.id === ctaValue) ||
                    products.find((p) => p.slug === ctaValue);
      if (match) {
        setSelectedProduct(match);
        searchParams.set('open', match.id);
        setSearchParams(searchParams, { replace: true });
      } else {
        showToast('Produk tidak ditemukan atau sudah tidak aktif.', 'error');
      }
      return;
    }

    if (ctaType === 'url') {
      let url = ctaValue;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      window.location.href = url;
      return;
    }
  };

  const handleHighlightProduct = (product) => {
    if (product.badge === 'Best Seller') { setActiveFilter('bestseller'); setActiveSub(null); }
    else if (product.badge === 'Baru') { setActiveFilter('produkbaru'); setActiveSub(null); }
    setCurrentPage(1);
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setSelectedProduct(product), 500);
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
    // ⭐ Update URL supaya bisa di-share/bookmark
    searchParams.set('open', product.id);
    setSearchParams(searchParams, { replace: true });
  };

  const closeModal = () => {
    setSelectedProduct(null);
    // ⭐ Hapus ?open dari URL saat modal close
    if (searchParams.get('open')) {
      searchParams.delete('open');
      setSearchParams(searchParams, { replace: true });
    }
  };
  const formatPrice = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v ?? 0);

  // Sticky filter header height
  const headerH = typeof window !== 'undefined' && window.innerWidth >= 768 ? HEADER_HEIGHT_DESKTOP : HEADER_HEIGHT_MOBILE;

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      {/* ═══════════════════════════════════════════════════════════════
          LOADING OVERLAY — Full viewport, covers EVERYTHING (header, footer)
          ──────────────────────────────────────────────────────────────
          Identical to pre-hydration loader (index.html) supaya seamless:
            T+0     → Pre-hydration loader (white bg + SVG logo)
            T+400ms → React mount → pre-hydration fades out
            T+400ms → This overlay takes over (white bg + SVG logo, same animation)
            T+1s    → Banners load → overlay disappears → HeroSwiper visible
          
          User sees: continuous SVG logo on white bg, no flash, no header visible.
          
          Safety: kalau 6s banners belum load (network error), overlay timeout
          & fallback hero muncul. Cegah infinite loader.
          ═══════════════════════════════════════════════════════════════ */}
      {banners.length === 0 && !overlayTimedOut && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-white"
          aria-hidden="true"
        >
          <img
            src="https://mbuwpjxpxvnsxjusrnlk.supabase.co/storage/v1/object/public/logo/Logo-Loading.svg"
            alt=""
            className="w-[min(280px,70vw)] h-auto"
            style={{
              animation: 'eglux-logo-reveal 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
              WebkitUserDrag: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO — Parallax + Transform Swiper (full viewport)
          ═══════════════════════════════════════════════════════════════ */}
      {banners.length > 0 ? (
        <HeroSwiper banners={banners} onBannerClick={handleBannerClick} />
      ) : (
        // Fallback hero — hanya muncul kalau overlay timeout (banners gagal load)
        <section className="hero-parallax flex items-center justify-center" aria-hidden="true">
          <img
            src="https://mbuwpjxpxvnsxjusrnlk.supabase.co/storage/v1/object/public/logo/Logo-Loading.svg"
            alt=""
            className="w-[min(280px,70vw)] h-auto"
            style={{
              animation: 'eglux-logo-reveal 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
              WebkitUserDrag: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: PRODUK BARU + BEST SELLER (horizontal scroll + Lihat Lainnya)
          ──────────────────────────────────────────────────────────────
          Urutan: Produk Baru dulu, baru Best Seller.
          "Lihat Lainnya" card hanya muncul kalau section punya >5 produk.
          ═══════════════════════════════════════════════════════════════ */}
      {(bestSellers.length > 0 || newArrivals.length > 0) && (
        <section className="section-overlay bg-white py-4 md:py-12 pt-8 ">
          <div className="max-w-[1600px] mx-auto px-4 md:px-8 w-full">

            {newArrivals.length > 0 && (
              <div className="mb-4 md:mb-8">
                <div className="flex items-end justify-between mb-2 md:mb-5">
                  <div>
                    <h2 className="section-title text-[1.2rem] md:text-[1.6rem]">Produk Baru</h2>
                    <p className="section-subtitle">Koleksi terbaru EGLUX</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('produkbaru'); setActiveSub(null); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                {/* ⭐ Horizontal scroll container — mobile & desktop both scroll sideways */}
                <div className="eglux-hscroll -mx-4 md:mx-0 px-4 md:px-0">
                  <div className="eglux-hscroll__track">
                    {newArrivals.map((product) => (
                      <div key={product.id} className="eglux-hscroll__item">
                        <ProductCard product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact hideBadge />
                      </div>
                    ))}
                    {/* ⭐ "Lihat Lainnya" card — hanya muncul kalau >5 produk */}
                    {newArrivals.length > 5 && (
                      <button
                        type="button"
                        onClick={() => { setActiveFilter('produkbaru'); setActiveSub(null); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                        className="eglux-hscroll__item eglux-hscroll__more"
                        aria-label="Lihat lainnya"
                      >
                        <svg className="w-6 h-6 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
                        <span className="text-[0.7rem] md:text-[0.85rem] font-medium tracking-wide">Lihat Lainnya</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bestSellers.length > 0 && (
              <div>
                <div className="flex items-end justify-between mb-2 md:mb-5">
                  <div>
                    <h2 className="section-title text-[1.2rem] md:text-[1.6rem]">Best Seller</h2>
                    <p className="section-subtitle">Produk terlaris paling dicari</p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter('bestseller'); setActiveSub(null); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="see-all-link"
                  >
                    Lihat Semua
                  </button>
                </div>
                {/* ⭐ Horizontal scroll container — same pattern as Produk Baru */}
                <div className="eglux-hscroll -mx-4 md:mx-0 px-4 md:px-0">
                  <div className="eglux-hscroll__track">
                    {bestSellers.map((product) => (
                      <div key={product.id} className="eglux-hscroll__item">
                        <ProductCard product={product} onClick={() => handleHighlightProduct(product)} formatPrice={formatPrice} compact hideBadge />
                      </div>
                    ))}
                    {/* ⭐ "Lihat Lainnya" card — hanya muncul kalau >5 produk */}
                    {bestSellers.length > 5 && (
                      <button
                        type="button"
                        onClick={() => { setActiveFilter('bestseller'); setActiveSub(null); setCurrentPage(1); productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                        className="eglux-hscroll__item eglux-hscroll__more"
                        aria-label="Lihat lainnya"
                      >
                        <svg className="w-6 h-6 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
                        <span className="text-[0.7rem] md:text-[0.85rem] font-medium tracking-wide">Lihat Lainnya</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: ALL PRODUCTS — with sticky filter bar
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={productsSectionRef} className="section-overlay w-full bg-white py-6 md:pt-8 md:pb-32" id="products-section">
        <div className="w-full mx-auto">

          <div className="text-center mb-4 md:mb-8 pb-1 md:pb-2">
            <h2 className="section-title text-eglux-secondary text-[1.6rem] md:text-[2rem]">Semua Produk</h2>
            <p className="section-subtitle text-eglux-primary mt-2">Temukan produk rumah tangga berkualitas untuk Anda</p>
          </div>

          {/* ⭐ Sticky filter wrapper — detects scroll position */}
          {/* Hanya berisi filter buttons (sticky), search input dipisah supaya ngikut section */}
          <div ref={filterWrapperRef} className="min-h-[48px]">
            <div
              className={`transition-all duration-300 ${filterStuck
                ? 'fixed left-0 right-0 z-[999] bg-transparent text-eglux-primary shadow-md backdrop-blur-sm'
                : 'relative bg-transparent'
              }`}
              style={filterStuck ? { top: `${headerH}px` } : undefined}
            >
              <div className="max-w-[1600px] mx-auto px-4 md:px-8">
                {/* Filter buttons */}
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

          {/* ⭐ Search input — DIPISAH dari sticky wrapper, ngikut section All Products */}
          <div className="max-w-[1600px] mx-auto px-4 md:px-8 mt-4 md:mt-6">
            <div className="flex justify-center">
              <div className="relative w-full max-w-md">
                {/* Search icon */}
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Cari produk berdasarkan nama..."
                  className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-full focus:border-eglux-secondary focus:outline-none focus:ring-1 focus:ring-eglux-secondary/30 transition-colors bg-white"
                />
                {/* Clear button (X) — muncul kalau ada query */}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="Hapus pencarian"
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors cursor-pointer border-none bg-transparent"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* ⭐ Search results count — muncul kalau ada query aktif */}
            {searchQuery.trim() && !loading && !error && (
              <div className="text-center mt-3">
                <p className="text-xs text-gray-500">
                  {filteredProducts.length > 0 ? (
                    <>
                      Menampilkan <span className="font-semibold text-eglux-secondary">{filteredProducts.length}</span> produk untuk "<span className="font-medium text-gray-700">{searchQuery.trim()}</span>"
                    </>
                  ) : (
                    <>
                      Tidak ada produk yang cocok dengan "<span className="font-medium text-gray-700">{searchQuery.trim()}</span>"
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {loading && <p className="text-center text-gray-400 py-20 text-sm">Memuat produk...</p>}
          {error && <p className="text-center text-red-500 py-20 text-sm">Gagal memuat produk.</p>}

          {!loading && !error && (
            paginatedProducts.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 px-4 gap-4 md:gap-6 mt-4 md:mt-8 pt-20">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} formatPrice={formatPrice} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-gray-400 text-sm mb-2">
                  {searchQuery.trim()
                    ? `Tidak ada produk yang cocok dengan "${searchQuery.trim()}".`
                    : 'Tidak ada produk untuk kategori ini.'}
                </p>
                {searchQuery.trim() && (
                  <button
                    onClick={handleClearSearch}
                    className="text-xs text-eglux-secondary font-semibold hover:underline cursor-pointer border-none bg-transparent"
                  >
                    Hapus pencarian
                  </button>
                )}
              </div>
            )
          )}

          {/* Pagination */}
          {!loading && !error && filteredProducts.length > ITEMS_PER_PAGE && (
            <div className="flex flex-col items-center gap-4 mt-12 pt-8">
              <div className="flex border border-eglux-primary/25 rounded-[30px] px-0 items-center gap-3">
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
              <p className="text-[0.7rem] text-eglux-primary tracking-wide">
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

      {/* ⭐ Toast notifications — untuk feedback CTA banner (filter invalid, product not found, dll) */}
      <Toast toast={toast} onClose={closeToast} />

      {/* ⭐ NEW: Membership Card Modal — muncul setelah register redirect */}
      {showMembershipCard && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[5000] flex items-center justify-center p-4"
          onClick={() => setShowMembershipCard(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 md:p-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Success Icon */}
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900 text-center mb-1">Registrasi Berhasil! 🎉</h2>
            <p className="text-sm text-gray-500 text-center mb-6">Akun EGLUX Anda telah dibuat.</p>

            {/* WA Group Card */}
            {regWaOptIn && (
              <div className="bg-eglux-accent rounded-xl p-4 mb-4 border border-eglux-secondary/20">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-eglux-secondary rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-eglux-primary">Anda terdaftar untuk promo WhatsApp!</p>
                    {regPhone && <p className="text-xs text-gray-500">Nomor: {regPhone}</p>}
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-3">
                  Join grup eksklusif EGLUX untuk menerima promo real-time langsung ke WhatsApp.
                </p>
                <a
                  href={WA_GROUP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-eglux-secondary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer border-none no-underline"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                  </svg>
                  Join Grup WhatsApp
                </a>
              </div>
            )}

            {/* ⭐ NEW: Lihat Poin Saya */}
            <button
              onClick={() => {
                setShowMembershipCard(false);
                window.location.href = '/rewards';
              }}
              className="w-full px-4 py-3 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer border-none mb-2"
            >
              🏆 Lihat Poin Saya (Bonus +20 Poin!)
            </button>

            <button
              onClick={() => setShowMembershipCard(false)}
              className="w-full px-4 py-3 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 cursor-pointer"
            >
              Lanjut Belanja →
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// HeroSwiper — Transform-based (arrows work, smooth, touch-friendly)
// ============================================================================
// ⭐ Swipe-vs-Click suppression (v4.4):
//   - Track pointer movement di touchStart/mouseDown & touchEnd/mouseUp
//   - Kalau delta > 40px → dianggap swipe → set didSwipeRef = true
//   - Slide onClick dipakai biasa, TAPI cek didSwipeRef di onClickCapture
//   - Kalau didSwipeRef true → stopPropagation + preventDefault, klik diabaikan
//   - Reset didSwipeRef setelah 300ms (siap untuk gesture berikutnya)
//   Fix issue: sebelumnya, setelah swipe, click event juga fire di slide baru →
//   banner CTA (filter/product/url) ikut ke-trigger secara nggak sengaja.
// ============================================================================
const HeroSwiper = ({ banners, onBannerClick }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const didSwipeRef = useRef(false);  // ⭐ true jika gesture terakhir adalah swipe
  const swipeResetTimer = useRef(null);
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

    // ⭐ Helper: mark bahwa user baru saja swipe. Click event berikutnya (dalam 300ms)
  //   akan di-suppress via onClickCapture di slide.
  const markSwiped = () => {
    didSwipeRef.current = true;
    if (swipeResetTimer.current) clearTimeout(swipeResetTimer.current);
    swipeResetTimer.current = setTimeout(() => {
      didSwipeRef.current = false;
    }, 300);
  };

  // ⭐ Click capture — intercept SEMUA click di dalam <section> BEFORE reach slide onClick.
  //   Kalau user baru saja swipe (didSwipeRef true), cancel click.
  //   Ini mencegah banner CTA ke-trigger setelah gesture swipe.
  const handleClickCapture = (e) => {
    if (didSwipeRef.current) {
      e.stopPropagation();
      e.preventDefault();
      didSwipeRef.current = false; // reset supaya click intentional berikutnya jalan
      if (swipeResetTimer.current) clearTimeout(swipeResetTimer.current);
      return false;
    }
  };

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
      markSwiped(); // ⭐ suppress click berikutnya
    }
  };

  // Mouse handlers (desktop drag)
  const handleMouseDown = (e) => {
    touchStartX.current = e.clientX;
    // ⛔ Removed: e.preventDefault() — ini bisa suppress click event di beberapa browser
    //   dan bikin CTA filter/product tidak respond. CSS user-select:none sudah handle
    //   text selection issue.
  };
  const handleMouseUp = (e) => {
    touchEndX.current = e.clientX;
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 40) {
      if (delta > 0) next();
      else prev();
      markSwiped(); // ⭐ suppress click berikutnya
    }
  };

  // ⭐ Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (swipeResetTimer.current) clearTimeout(swipeResetTimer.current);
    };
  }, []);

  // ⭐ DEBUG: log computed height untuk diagnose
  useEffect(() => {
    if (banners.length === 0) return;
    const hero = document.querySelector('.hero-parallax');
    if (!hero) return;
    const computed = window.getComputedStyle(hero);
    console.log('[HeroSwiper] DEBUG height info:', {
      computedHeight: computed.height,
      inlineHeight: hero.style.height,
      viewportInnerHeight: window.innerHeight,
      viewportOuterHeight: window.outerHeight,
      dvhSupported: CSS.supports('height: 100dvh'),
      position: computed.position,
      overflow: computed.overflow,
      parentTag: hero.parentElement?.tagName,
      parentHeight: hero.parentElement ? window.getComputedStyle(hero.parentElement).height : 'N/A',
    });
  }, [banners]);

  return (
    <>
      {/* ⭐ NUCLEAR FIX: inline <style> dengan !important supaya gak ada CSS manapun yang override */}
      <style>{`
        .hero-parallax {
          position: relative !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100vh !important;
          height: 100dvh !important;
          min-height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 0 !important;
          overflow: hidden !important;
          background: var(--eglux-accent, #f7f3ed) !important;
        }
        .hero-parallax > div {
          height: 100% !important;
        }
        .hero-parallax img {
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    <section
      className="hero-parallax overflow-hidden select-none"
      // ⭐ Inline style sebagai backup (kombinasi dengan <style> tag di atas = NUCLEAR)
      style={{
        height: '100dvh',
        minHeight: '100vh',
        width: '100%',
        margin: 0,
        padding: 0,
        position: 'relative',  // ⭐ Ganti dari sticky ke relative — sticky bisa break kalau parent ada overflow
        top: 0,
        left: 0,
        zIndex: 0,
        overflow: 'hidden',
        touchAction: 'pan-y',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClickCapture={handleClickCapture}
    >
      {/* Slides container — transform translateX */}
      <div
        className="flex h-full transition-transform duration-700 ease-out"
        // ⭐ Explicit height supaya children (img) bisa fill
        style={{
          transform: `translateX(-${activeIdx * 100}%)`,
          height: '100%',
        }}
      >
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="w-full h-full flex-shrink-0 relative cursor-pointer"
            style={{ height: '100%' }}
            onClick={() => onBannerClick(banner)}
          >
            <img src={banner.image_url} alt={banner.title || 'EGLUX'} className="w-full h-full object-cover" draggable={false} style={{ WebkitUserDrag: 'none', userSelect: 'none', height: '100%' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />
            <div className="hero-overlay" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div className="max-w-container mx-auto text-center">
                {banner.subtitle && (
                  <p className="hero-overlay__sub text-white text-[0.7rem] md:text-[0.85rem] font-light uppercase tracking-[0.25em] mb-4">
                    {banner.subtitle}
                  </p>
                )}
                {banner.title && (
                  <h2 className="hero-overlay__title text-[2rem] md:text-[4rem] text-center">{banner.title}</h2>
                )}
                {banner.cta_text && (
                  <button className="hero-overlay__cta mt-8 rounded-3xl hover:bg-eglux-secondary hover:text-white hover:border-eglux-secondary">{banner.cta_text}</button>
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
    </>
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
          <span className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-eglux-primary text-white text-[0.55rem] md:text-[0.7rem] font-medium uppercase tracking-[0.1em] px-2 py-0.5 md:px-2.5 md:py-1 rounded-full">{product.badge}</span>
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
