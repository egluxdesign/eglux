// src/components/admin/layout/SearchBar.jsx
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Search, ShoppingBag, Package, Loader2, X } from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const SearchBar = ({ onNavigate, variant = 'desktop', autoFocus = false }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ orders: [], products: [] });
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ orders: [], products: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => runSearch(trimmed), 350);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const runSearch = async (term) => {
    // Cari customer yang namanya cocok dulu, lalu pakai id-nya buat filter orders.
    // (PostgREST gak bisa gabungin filter kolom sendiri + kolom tabel relasi dalam satu .or())
    const { data: matchedCustomers } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', `%${term}%`)
      .limit(10);

    const customerIds = (matchedCustomers || []).map((c) => c.id);

    let orderQuery = supabase
      .from('orders')
      .select('id, total_amount, status, customers(name)')
      .limit(5);

    if (customerIds.length > 0) {
      orderQuery = orderQuery.in('customer_id', customerIds);
    } else if (isUuidLike(term)) {
      orderQuery = orderQuery.eq('id', term);
    } else {
      // Gak ada customer yang cocok dan term bukan UUID -> gak ada order yang perlu dicari
      orderQuery = null;
    }

    const [ordersRes, productsRes] = await Promise.all([
      orderQuery ? orderQuery : Promise.resolve({ data: [] }),
      supabase
        .from('products')
        .select('id, name, base_price, is_active')
        .eq('is_active', true)
        .ilike('name', `%${term}%`)
        .limit(5),
    ]);

    const products = productsRes.data || [];

    // Stock ada di product_variants, bukan di products, jadi ambil terpisah lalu jumlahkan per produk
    let stockByProduct = {};
    if (products.length > 0) {
      const { data: variants } = await supabase
        .from('product_variants')
        .select('product_id, stock')
        .in('product_id', products.map((p) => p.id))
        .eq('is_active', true);

      stockByProduct = (variants || []).reduce((acc, v) => {
        acc[v.product_id] = (acc[v.product_id] || 0) + (v.stock || 0);
        return acc;
      }, {});
    }

    setResults({
      orders: ordersRes.data || [],
      products: products.map((p) => ({ ...p, totalStock: stockByProduct[p.id] ?? 0 })),
    });
    setLoading(false);
  };

  // Cek kasar apakah term mirip UUID, biar gak error saat dipakai di filter id.eq
  const isUuidLike = (val) =>
    /^[0-9a-f-]{8,}$/i.test(val);

  const clearSearch = () => {
    setQuery('');
    setResults({ orders: [], products: [] });
    setIsOpen(false);
  };

  const goTo = (page) => {
    onNavigate?.(page);
    clearSearch();
  };

  const hasResults = results.orders.length > 0 || results.products.length > 0;
  const showDropdown = isOpen && query.trim().length >= 2;
  const wrapperClass = variant === 'mobile'
    ? 'relative block w-full'
    : 'relative hidden md:block w-full lg:w-[320px]';

  return (
    <div className={wrapperClass} ref={wrapRef}>
      <div className="flex items-center bg-[#f8f9fc] rounded-xl px-4 py-2.5">
        {loading ? (
          <Loader2 className="w-4 h-4 text-[#9ca3af] mr-3 animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-4 h-4 text-[#9ca3af] mr-3 flex-shrink-0" />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder="Search orders, products..."
          className="bg-transparent text-[0.85rem] text-[#1a1d2b] placeholder-[#9ca3af] outline-none w-full"
        />
        {query && (
          <button onClick={clearSearch} className="text-[#9ca3af] hover:text-[#1a1d2b]">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 top-full mt-2 w-full bg-white rounded-2xl shadow-xl border border-[#e8ecf4] overflow-hidden z-50 max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-[0.8rem] text-[#9ca3af]">Searching...</div>
          ) : !hasResults ? (
            <div className="p-4 text-center text-[0.8rem] text-[#9ca3af]">No results for "{query}"</div>
          ) : (
            <>
              {results.orders.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[0.7rem] font-semibold text-[#9ca3af] uppercase tracking-wide">Orders</p>
                  {results.orders.map((order) => (
                    <button
                      key={order.id}
                      onClick={() => goTo('orders')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fc] transition-colors text-left"
                    >
                      <ShoppingBag className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.8rem] font-medium text-[#1a1d2b] truncate">
                          {order.customers?.name || 'Unknown Customer'}
                        </p>
                        <p className="text-[0.7rem] text-[#9ca3af] capitalize">{order.status}</p>
                      </div>
                      <span className="text-[0.75rem] font-semibold text-[#1a1d2b] whitespace-nowrap">
                        {rupiah(order.total_amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results.products.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[0.7rem] font-semibold text-[#9ca3af] uppercase tracking-wide">Products</p>
                  {results.products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => goTo('products')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fc] transition-colors text-left"
                    >
                      <Package className="w-4 h-4 text-[#c9a96e] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.8rem] font-medium text-[#1a1d2b] truncate">{product.name}</p>
                        <p className="text-[0.7rem] text-[#9ca3af]">{product.totalStock} in stock</p>
                      </div>
                      <span className="text-[0.75rem] font-semibold text-[#1a1d2b] whitespace-nowrap">
                        {rupiah(product.base_price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;