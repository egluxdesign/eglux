// src/components/sections/ProductPage/ProductsSection.jsx
// ============================================================================
// [v2] Updated: inline ProductCardFull sekarang pakai Shopee/Tokopedia pattern
//   - Strike through base price
//   - Show minVariantPrice (harga termurah variant)
//   - Discount % badge di image
//   - "Mulai dari" label
//   - Defensive: compute minVariantPrice dari product.variants kalau field undefined
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import { KEYWORD_FILTERS, ITEMS_PER_PAGE } from '../../../data/products';
import useProducts from '../../../hooks/useProducts';
import CartIcon from '../../ui/CartIcon';

const formatPrice = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value ?? 0);

const toWIB = (isoString) =>
  new Date(isoString).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

// ── Helper: filter products ───────────────────────────────────
const filterProducts = (products, filterValue) => {
  if (filterValue === 'all') return products;
  if (filterValue === 'produkbaru')  return products.filter((p) => p.badge === 'Baru');
  if (filterValue === 'bestseller')  return products.filter((p) => p.badge === 'Best Seller');
  if (KEYWORD_FILTERS.includes(filterValue)) {
    return products.filter((p) => p.name.toLowerCase().includes(filterValue));
  }
  return products.filter((p) => p.category === filterValue);
};

// ── Product Card (Shopee/Tokopedia pattern) ───────────────────
const ProductCardFull = ({ product, onOpenModal }) => {
  // ⭐ v3: Pakai pre-computed fields dari useProducts (discount-aware)
  const minVariantPrice = product?.minVariantPrice ?? null;
  const minOriginalPrice = product?.minOriginalPrice ?? null;
  const hasActiveVariant = product?.hasActiveVariant ?? false;
  const hasActiveDiscount = product?.hasActiveDiscount ?? false;
  const maxDiscountPercent = product?.maxDiscountPercent ?? 0;

  // Discount aktif kalau ada variant dengan discount > 0%
  const hasDiscount = hasActiveDiscount && maxDiscountPercent > 0;

  return (
    <article
      className="group bg-white rounded-[20px] overflow-hidden cursor-pointer border border-[#eee]
                 transition-all duration-300 hover:-translate-y-2 hover:shadow-card-hover hover:border-transparent"
      onClick={() => onOpenModal(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenModal(product)}
      aria-label={product.name}
    >
      {/* === IMAGE === */}
      <div className="relative overflow-hidden h-[250px]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />

        {/* Badge (Best Seller / Baru) — top left */}
        {product.badge && (
          <span className="absolute top-4 left-4 bg-eglux-secondary text-white text-[0.75rem]
                           font-semibold py-1 px-3 rounded-full">
            {product.badge}
          </span>
        )}

        {/* Discount % badge — top right (only if ada diskon aktif) */}
        {hasDiscount && (
          <span className="absolute top-4 right-4 bg-red-500 text-white
                           text-[0.72rem] font-bold py-1 px-2 rounded-full shadow-sm">
            -{maxDiscountPercent}%
          </span>
        )}
      </div>

      {/* === INFO === */}
      <div className="p-6">
        <h4 className="text-base font-semibold text-eglux-primary mb-1 leading-snug line-clamp-2">
          {product.name}
        </h4>
        <p className="text-[0.85rem] text-[#666] mb-3 capitalize">{product.category}</p>

        {/* === PRICE BLOCK (v3: discount-aware) === */}
        <div className="mb-2">
          {hasActiveVariant && minVariantPrice ? (
            <>
              {/* "Mulai dari" label */}
              <p className="text-[0.65rem] text-[#999] uppercase tracking-[0.5px] mb-1">
                Mulai dari
              </p>

              {/* Strike original price + discounted price inline */}
              <div className="flex items-baseline gap-2 flex-wrap">
                {hasDiscount && minOriginalPrice && minOriginalPrice > minVariantPrice && (
                  <span className="text-[0.78rem] text-[#999] line-through">
                    {formatPrice(minOriginalPrice)}
                  </span>
                )}
                <span className="text-[1.15rem] font-bold text-eglux-secondary">
                  {formatPrice(minVariantPrice)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-[0.95rem] font-semibold text-[#999]">
              Hubungi CS
            </p>
          )}
        </div>

        {product.desc && (
          <p className="text-[0.9rem] text-[#666] leading-relaxed line-clamp-2">{product.desc}</p>
        )}
      </div>
    </article>
  );
};

// ── Pagination ────────────────────────────────────────────────
const Pagination = ({ currentPage, totalPages, totalCount, onPrev, onNext, onGoTo }) => {
  const [inputVal, setInputVal] = useState(String(currentPage));
  useEffect(() => setInputVal(String(currentPage)), [currentPage]);

  const handleChange  = (e) => setInputVal(e.target.value);
  const handleBlur    = () => {
    const num = parseInt(inputVal, 10);
    if (num >= 1 && num <= totalPages) onGoTo(num);
    else setInputVal(String(currentPage));
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter') e.target.blur(); };

  const start = totalCount > 0 ? (currentPage - 1) * ITEMS_PER_PAGE + 1 : 0;
  const end   = Math.min(currentPage * ITEMS_PER_PAGE, totalCount);

  return (
    <div className="flex flex-col items-center gap-4 mt-12 pt-8 border-t border-[#eee]">
      <div className="flex items-center gap-4">
        <button onClick={onPrev} disabled={currentPage <= 1} aria-label="Halaman sebelumnya"
          className="w-11 h-11 border-2 border-eglux-primary bg-white rounded-full flex items-center
                     justify-center text-eglux-primary cursor-pointer transition-all duration-300
                     hover:not(:disabled):bg-eglux-primary hover:not(:disabled):text-white
                     hover:not(:disabled):scale-110
                     disabled:opacity-30 disabled:cursor-not-allowed disabled:border-[#ccc] disabled:text-[#ccc]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className="flex items-center bg-white border-2 border-eglux-primary rounded-full px-5 py-2">
          <input type="number" value={inputVal} onChange={handleChange}
            onBlur={handleBlur} onKeyDown={handleKeyDown} min={1} max={totalPages}
            aria-label="Nomor halaman"
            className="w-[50px] h-8 border-none bg-transparent text-center text-base font-bold
                       text-eglux-primary outline-none [appearance:textfield]
                       [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[0.9rem] text-[#666] font-medium pl-1">/ {totalPages}</span>
        </div>

        <button onClick={onNext} disabled={currentPage >= totalPages} aria-label="Halaman berikutnya"
          className="w-11 h-11 border-2 border-eglux-primary bg-white rounded-full flex items-center
                     justify-center text-eglux-primary cursor-pointer transition-all duration-300
                     hover:not(:disabled):bg-eglux-primary hover:not(:disabled):text-white
                     hover:not(:disabled):scale-110
                     disabled:opacity-30 disabled:cursor-not-allowed disabled:border-[#ccc] disabled:text-[#ccc]">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
      <p className="text-[0.85rem] text-[#666]">
        Menampilkan {start}–{end} dari {totalCount} produk
      </p>
    </div>
  );
};

// ── Products Section ──────────────────────────────────────────
const ProductsSection = ({ onOpenModal, initialFilter = 'all' }) => {
  const { products, filterButtons, loading, error } = useProducts();
  const [activeFilter, setActiveFilter] = useState(initialFilter);
  const [currentPage,  setCurrentPage]  = useState(1);
  const sectionRef = useRef(null);

  // Baca URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get('data-filter') || params.get('filter') || 'all';
    setActiveFilter(f);
  }, []);

  // ⭐ Auto-open product modal dari deep link ?open=<product_id>
  // (link dari OrdersList "Klik produk" → buka modal produk terkait)
  useEffect(() => {
    if (!products.length || !onOpenModal) return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('open');
    if (!openId) return;
    const match = products.find(p => p.id === openId);
    if (match) {
      onOpenModal(match);
      // Clean up URL biar gak trigger lagi pas refresh
      params.delete('open');
      const newSearch = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (newSearch ? `?${newSearch}` : '')
      );
    }
  }, [products, onOpenModal]);

  const filtered = useMemo(
    () => filterProducts(products, activeFilter),
    [activeFilter, products]
  );
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginated  = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const handleFilter = (value) => { setActiveFilter(value); setCurrentPage(1); };
  const scrollToSection = () => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const handlePrev  = () => { setCurrentPage((p) => Math.max(1, p - 1)); scrollToSection(); };
  const handleNext  = () => { setCurrentPage((p) => Math.min(totalPages, p + 1)); scrollToSection(); };
  const handleGoTo  = (num) => { setCurrentPage(num); scrollToSection(); };

  return (
    <section ref={sectionRef} className="bg-white py-12 pb-20" id="products-section">
      <div className="max-w-container mx-auto px-4 md:px-8">

        {/* Filter Bar — dinamis dari Supabase */}
        {!loading && !error && (
          <div className="flex justify-center gap-3 flex-wrap mb-8">
            {filterButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => handleFilter(btn.value)}
                className={`py-3 px-5 rounded-full border-2 cursor-pointer font-medium
                            transition-all duration-300 text-sm
                            ${activeFilter === btn.value
                              ? 'bg-eglux-primary text-white border-eglux-primary'
                              : 'bg-white text-eglux-primary border-eglux-primary/30 hover:bg-eglux-primary hover:text-white hover:border-eglux-primary'}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading / Error */}
        {loading && (
          <p className="text-center text-[#666] py-16 text-base">Memuat produk...</p>
        )}
        {!loading && error && (
          <p className="text-center text-red-500 py-16 text-base">
            Gagal memuat produk. Coba refresh halaman.
          </p>
        )}

        {/* Products Grid */}
        {!loading && !error && (
          paginated.length > 0
            ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                {paginated.map((product) => (
                  <ProductCardFull key={product.id} product={product} onOpenModal={onOpenModal} />
                ))}
              </div>
            ) : (
              <p className="text-center text-[#666] py-16 text-base">
                Tidak ada produk untuk kategori ini.
              </p>
            )
        )}

        {/* Pagination */}
        {!loading && !error && filtered.length > ITEMS_PER_PAGE && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={filtered.length}
            onPrev={handlePrev}
            onNext={handleNext}
            onGoTo={handleGoTo}
          />
        )}
      </div>
    </section>
  );
};

export default ProductsSection;
