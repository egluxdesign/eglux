// src/pages/AdminOrdersPage.jsx
// ============================================================================
// AdminOrdersPage — Daftar semua active orders untuk admin
// ============================================================================
// Behavior:
//   - Fetch SEMUA orders (semua user) dengan status aktif:
//     pending, paid, processing, shipped (BUKAN delivered/cancelled/expired)
//   - Pagination 50 orders per page (server-side via Supabase range)
//   - Filter by status (tab: Semua, Pending, Paid, Processing, Shipped)
//   - Search by order ID (short) atau customer name/email/phone
//   - Klik row → expand rincian (items, alamat, kurir, rincian pembayaran)
//   - Realtime update (saat Biteship webhook / Midtrans webhook update DB)
//
// Auth: admin only (ProtectedRoute di App.jsx)
// DB access: pakai user JWT — RLS policies di SQL 026 (admin_read_all_orders)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';
import { friendlyErrorMessage } from '../lib/errorMessage';

// ── Constants ──
const ORDERS_PER_PAGE = 50;

// Active statuses (exclude delivered, cancelled, expired — itu di Riwayat)
const ACTIVE_STATUSES = ['pending', 'paid', 'processing', 'shipped'];

// Tab filter
// ⭐ Logic dengan processed_at column:
//   - "Menunggu Bayar": status='pending' (customer belum bayar)
//   - "Dibayar":         status='processing' AND processed_at IS NULL (sudah bayar, BELUM diproses admin)
//   - "Diproses":         status='processing' AND processed_at IS NOT NULL (sudah diproses admin, siap dikirim)
//   - "Dikirim":          status='shipped' (sudah diambil kurir, dalam perjalanan)
//
// Flow: pending → Dibayar → Diproses → Dikirim → delivered
//   1. Customer bayar (Midtrans settlement) → status='processing', processed_at=NULL → tab "Dibayar"
//   2. Admin klik "Tandai Sudah Diproses" → processed_at=NOW() → pindah ke tab "Diproses"
//   3. Biteship pickup → status='shipped' → pindah ke tab "Dikirim"
const STATUS_TABS = [
  { key: 'all',         label: 'Semua Aktif' },
  { key: 'pending',     label: 'Menunggu Bayar' },
  { key: 'paid',        label: 'Dibayar'           },  // status='processing' AND processed_at IS NULL
  { key: 'processing',  label: 'Diproses'          },  // status='processing' AND processed_at IS NOT NULL
  { key: 'shipped',     label: 'Dikirim'           },  // status='shipped'
];

// Status badge config
const STATUS_BADGE = {
  pending:    { text: 'Menunggu Bayar', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid:       { text: 'Dibayar',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  processing: { text: 'Diproses',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  shipped:    { text: 'Dikirim',        cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  delivered:  { text: 'Selesai',        cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled:  { text: 'Dibatalkan',     cls: 'bg-red-50 text-red-700 border-red-200' },
  expired:    { text: 'Kedaluwarsa',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const PAYMENT_LABEL = {
  unpaid: 'Belum Dibayar',
  paid: 'Lunas',
  failed: 'Gagal',
  expired: 'Kedaluwarsa',
};

// ── Helpers ──
function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
}

function getProductImage(item) {
  const imgs = item?.product?.product_images || [];
  if (!imgs.length) return null;
  if (item.variant_id) {
    const v = imgs.find(img => img.variant_id === item.variant_id);
    if (v?.url) return v.url;
  }
  const nonVariant = imgs.filter(img => !img.variant_id);
  const primary = nonVariant.find(img => img.is_primary) || nonVariant[0];
  return primary?.url || imgs[0]?.url || null;
}

// ============================================================================
// OrderRow — single order row dengan expand rincian + checkbox select
// ============================================================================
const OrderRow = ({ order, expanded, onToggle, onMarkProcessed, isSelected, onSelect, showCheckbox = false }) => {
  const items = order.order_items || [];
  const badge = STATUS_BADGE[order.status] || { text: order.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  const customer = order.customer || {};
  // ⭐ Bisa di-select hanya jika:
  //   - showCheckbox=true (hanya di tab "Dibayar")
  //   - status='processing' AND processed_at IS NULL
  const isSelectable = showCheckbox && order.status === 'processing' && !order.processed_at;

  // Compute breakdown untuk rincian pembayaran
  const originalSubtotal = items.reduce((s, it) => {
    const orig = Number(it.original_unit_price) || Number(it.unit_price_snapshot) || 0;
    return s + (orig * (Number(it.quantity) || 1));
  }, 0);
  const discountedSubtotal = items.reduce((s, it) => {
    const unit = Number(it.unit_price_snapshot) || 0;
    return s + (unit * (Number(it.quantity) || 1));
  }, 0);
  const variantDiscount = originalSubtotal - discountedSubtotal;
  const hasVariantDiscount = variantDiscount > 0;
  let taxAmount = Number(order.tax_amount) || 0;
  let taxPercent = Number(order.tax_percent) || 3;
  if (!taxAmount && originalSubtotal > 0) {
    taxAmount = Math.round(originalSubtotal * taxPercent / 100);
  }
  const voucherDiscount = Number(order.voucher_discount) || 0;
  const shippingCost = Number(order.shipping_cost) || 0;
  const totalSavings = variantDiscount + voucherDiscount;

  // ⭐ Show "Tandai Sudah Diproses" button hanya jika:
  //   - status='processing' (sudah bayar)
  //   - processed_at IS NULL (belum ditandai admin)
  const canMarkProcessed = order.status === 'processing' && !order.processed_at;

  return (
    <div className={`bg-white border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${isSelected ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
      {/* Row header — clickable */}
      <div
        className="w-full p-3 md:p-4 text-left hover:bg-gray-50 transition-colors flex items-center gap-3"
      >
        {/* ⭐ Checkbox — hanya muncul untuk order yang bisa di-proses (status='processing' + processed_at NULL) */}
        {isSelectable ? (
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={(e) => { e.stopPropagation(); onSelect?.(order.id, e.target.checked); }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 cursor-pointer flex-shrink-0 accent-eglux-secondary"
            aria-label="Pilih order"
          />
        ) : (
          <div className="w-4 flex-shrink-0" />  // Spacer supaya align
        )}

        {/* Click area untuk expand */}
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
          className="flex-1 min-w-0 cursor-pointer outline-none"
          aria-expanded={expanded}
        >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left: order info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-gray-900">#{shortId(order.id)}</p>
              <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border ${badge.cls}`}>
                {badge.text}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {customer.name || '—'} · {customer.phone || '—'}
            </p>
            <p className="text-[0.7rem] text-gray-400">{formatDateTime(order.created_at)}</p>
          </div>

          {/* Middle: items preview */}
          <div className="hidden md:block min-w-0 flex-1 text-xs text-gray-600">
            {items.slice(0, 2).map((it, i) => (
              <p key={i} className="truncate">{it.product_name_snapshot} × {it.quantity}</p>
            ))}
            {items.length > 2 && <p className="text-gray-400">+ {items.length - 2} item lainnya</p>}
          </div>

          {/* Right: total + expand icon */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-sm font-bold text-eglux-secondary">{rupiah(order.total_amount)}</p>
              <p className="text-[0.65rem] text-gray-400">{items.length} item</p>
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>
      </div>

      {/* Expanded rincian */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
          {/* Customer info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Customer</p>
              <p className="text-sm font-medium text-gray-900">{customer.name || '—'}</p>
              <p className="text-xs text-gray-500">{customer.phone || '—'}</p>
              {customer.email && <p className="text-xs text-gray-500">{customer.email}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pengiriman</p>
              <p className="text-sm text-gray-700">{order.shipping_address || '—'}</p>
              <p className="text-xs text-gray-500">
                {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(', ')}
              </p>
              {order.courier_code && (
                <p className="text-xs text-gray-500 mt-1 uppercase">
                  Kurir: {order.courier_code}{order.courier_service ? ` ${order.courier_service}` : ''}
                  {order.tracking_number && ` · Resi: ${order.tracking_number}`}
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Items</p>
            <div className="space-y-2">
              {items.map((it, i) => {
                const img = getProductImage(it);
                const unit = Number(it.unit_price_snapshot) || 0;
                const orig = Number(it.original_unit_price) || unit;
                const qty = Number(it.quantity) || 1;
                const hasDiscount = orig > unit;
                return (
                  <div key={i} className="flex gap-3 items-start bg-white rounded-lg p-2">
                    {img && <img src={img} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{it.product_name_snapshot}</p>
                      {it.variant_name_snapshot && <p className="text-[0.7rem] text-gray-500">{it.variant_name_snapshot}</p>}
                      <p className="text-[0.7rem] text-gray-500">
                        {qty}× · {rupiah(unit * qty)}
                        {hasDiscount && <span className="text-gray-400 line-through ml-1">{rupiah(orig * qty)}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment breakdown */}
          <div className="bg-white rounded-lg p-3 space-y-1 text-xs">
            <p className="text-[0.7rem] font-semibold text-gray-600 uppercase tracking-wide mb-2 pb-2 border-b border-gray-100">
              Rincian Pembayaran
            </p>
            <div className="flex justify-between"><span className="text-gray-500">Subtotal Produk ({items.length} item)</span><span className="font-medium text-gray-900">{rupiah(originalSubtotal)}</span></div>
            {hasVariantDiscount && <div className="flex justify-between"><span className="text-green-600">↓ Diskon Variant</span><span className="font-medium text-green-600">− {rupiah(variantDiscount)}</span></div>}
            {hasVariantDiscount && <div className="flex justify-between"><span className="text-gray-500">Subtotal Setelah Diskon</span><span className="font-medium text-gray-900">{rupiah(discountedSubtotal)}</span></div>}
            {shippingCost > 0 && <div className="flex justify-between"><span className="text-gray-500">Ongkir</span><span className="font-medium text-gray-900">{rupiah(shippingCost)}</span></div>}
            {taxAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">Biaya Admin & Tax ({taxPercent}%)</span><span className="font-medium text-gray-900">{rupiah(taxAmount)}</span></div>}
            {voucherDiscount > 0 && <div className="flex justify-between"><span className="text-green-600">🎟️ Voucher{order.voucher_code ? ` (${order.voucher_code})` : ''}</span><span className="font-medium text-green-600">− {rupiah(voucherDiscount)}</span></div>}
            <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Total Pembayaran</span>
              <span className="text-sm font-bold text-eglux-secondary">{rupiah(order.total_amount)}</span>
            </div>
            {totalSavings > 0 && <p className="text-[0.65rem] text-green-600 text-right">🎉 Customer hemat {rupiah(totalSavings)}!</p>}
            <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between">
              <span className="text-gray-500">Status Pembayaran</span>
              <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-amber-600'}`}>
                {PAYMENT_LABEL[order.payment_status] || order.payment_status || '—'}
              </span>
            </div>

            {/* ⭐ Processed timestamp (kalau sudah ditandai admin) */}
            {order.processed_at && (
              <div className="flex justify-between border-t border-gray-100 pt-2 mt-2">
                <span className="text-gray-500">Diproses pada</span>
                <span className="font-medium text-green-600">{formatDateTime(order.processed_at)}</span>
              </div>
            )}
          </div>

          {/* ⭐ Action: Tandai Sudah Diproses */}
          {/* Hanya muncul kalau status='processing' DAN processed_at NULL (belum diproses) */}
          {canMarkProcessed && (
            <div className="flex gap-2">
              <button
                onClick={() => onMarkProcessed?.(order.id)}
                className="flex-1 px-4 py-2.5 bg-eglux-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Tandai Sudah Diproses
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// AdminOrdersPage — main page
// ============================================================================
const AdminOrdersPage = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());  // ⭐ Bulk select untuk "Dibayar" tab
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const totalPages = Math.ceil(totalCount / ORDERS_PER_PAGE) || 1;

  // ── Fetch orders (server-side pagination + filter) ──
  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // Build query
      let query = supabase
        .from('orders')
        .select(`
          id, status, payment_status, total_amount, subtotal, shipping_cost,
          courier_code, courier_service, courier_duration, tracking_number,
          shipping_address, shipping_city, shipping_postal_code,
          created_at, processed_at, notes,
          voucher_code, voucher_discount,
          tax_percent, tax_base, tax_amount,
          customer:customers(name, phone, email),
          order_items (
            id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
            unit_price_snapshot, original_unit_price, quantity, subtotal,
            product:products ( id, name, product_images ( id, url, is_primary, variant_id ) )
          )
        `, { count: 'exact' });

      // Filter by tab
      // ⭐ Tab 'paid' = SUDAH dibayar TAPI BELUM diproses:
      //   status='processing' AND processed_at IS NULL
      // Tab 'processing' = SUDAH diproses admin:
      //   status='processing' AND processed_at IS NOT NULL
      if (activeTab === 'paid') {
        query = query.eq('status', 'processing').is('processed_at', null);
      } else if (activeTab === 'processing') {
        query = query.eq('status', 'processing').not('processed_at', 'is', null);
      } else if (activeTab !== 'all') {
        query = query.eq('status', activeTab);
      } else {
        // Tab "Semua Aktif" — exclude delivered, cancelled, expired
        query = query.in('status', ACTIVE_STATUSES);
      }

      // Search filter (client-side applied AFTER fetch — but for server-side,
      // kita filter by customer name via OR clause)
      // NOTE: Supabase PostgREST gak support JOIN filter langsung,
      // jadi kita apply search client-side setelah fetch

      // Pagination (server-side range)
      const from = (currentPage - 1) * ORDERS_PER_PAGE;
      const to = from + ORDERS_PER_PAGE - 1;
      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error: fetchErr, count } = await query;

      if (fetchErr) throw fetchErr;

      // Client-side search filter (since Supabase gak support JOIN search easily)
      let filtered = data || [];
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        filtered = filtered.filter((o) => {
          const c = o.customer || {};
          return (
            o.id.toLowerCase().includes(q) ||
            (c.name || '').toLowerCase().includes(q) ||
            (c.phone || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
          );
        });
      }

      setOrders(filtered);
      setTotalCount(count || 0);
    } catch (e) {
      console.error('[AdminOrders] fetch error:', e?.message);
      setError(friendlyErrorMessage(e, 'Memuat daftar pesanan'));
    } finally {
      setLoading(false);
    }
  }, [user, activeTab, currentPage, searchQuery]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Reset selection saat tab berubah
  useEffect(() => { setSelectedIds(new Set()); }, [activeTab]);

  // Reset page ke 1 saat tab atau search berubah
  useEffect(() => { setCurrentPage(1); }, [activeTab, searchQuery]);

  // ⭐ Compute selectable orders di current page (untuk select all checkbox)
  // Hanya order dengan status='processing' AND processed_at IS NULL yang bisa di-select
  const selectableOrdersInPage = orders.filter(o => o.status === 'processing' && !o.processed_at);
  const allSelectableSelected = selectableOrdersInPage.length > 0 &&
    selectableOrdersInPage.every(o => selectedIds.has(o.id));
  const someSelectableSelected = selectableOrdersInPage.some(o => selectedIds.has(o.id));

  // ── Realtime: auto-refresh saat ada perubahan di orders ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('admin-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => { fetchOrders(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchOrders]);

  // ── Tab counts (lazy — fetch count per status) ──
  const [tabCounts, setTabCounts] = useState({ all: 0, pending: 0, paid: 0, processing: 0, shipped: 0 });
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const counts = {};
        // All active
        const { count: allCount } = await supabase
          .from('orders').select('*', { count: 'exact', head: true })
          .in('status', ACTIVE_STATUSES);
        counts.all = allCount || 0;
        // Pending (belum bayar)
        const { count: pendingCount } = await supabase
          .from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        counts.pending = pendingCount || 0;
        // ⭐ Paid: SUDAH dibayar TAPI BELUM diproses
        // Filter: status='processing' AND processed_at IS NULL
        const { count: paidCount } = await supabase
          .from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'processing').is('processed_at', null);
        counts.paid = paidCount || 0;
        // ⭐ Processing: SUDAH diproses admin (processed_at IS NOT NULL)
        const { count: processingCount } = await supabase
          .from('orders').select('*', { count: 'exact', head: true })
          .eq('status', 'processing').not('processed_at', 'is', null);
        counts.processing = processingCount || 0;
        // Shipped
        for (const s of ['shipped']) {
          const { count: c } = await supabase
            .from('orders').select('*', { count: 'exact', head: true })
            .eq('status', s);
          counts[s] = c || 0;
        }
        setTabCounts(counts);
      } catch (e) {
        console.warn('[AdminOrders] tab counts error:', e?.message);
      }
    })();
  }, [user, orders.length]); // refresh counts saat orders count berubah (realtime)

  const handleToggleExpand = (orderId) => {
    setExpandedId(prev => prev === orderId ? null : orderId);
  };

  // ⭐ Mark order as processed — set processed_at=NOW()
  // Order akan pindah dari tab "Dibayar" ke tab "Diproses"
  const [markingId, setMarkingId] = useState(null);
  const handleMarkProcessed = useCallback(async (orderId) => {
    if (!orderId) return;
    setMarkingId(orderId);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('orders')
        .update({ processed_at: now })
        .eq('id', orderId);
      if (error) throw error;
      // ⭐ Re-fetch orders supaya list langsung re-apply filter (order hilang dari "Dibayar")
      // Jangan cuma update local state — filter gak akan re-apply otomatis
      await fetchOrders();
      setExpandedId(null);
    } catch (e) {
      console.error('[AdminOrders] mark processed error:', e?.message);
      alert('Gagal menandai order sebagai sudah diproses: ' + (e?.message || 'Unknown error'));
    } finally {
      setMarkingId(null);
    }
  }, [fetchOrders]);

  // ⭐ Bulk select handlers
  const handleSelectOrder = useCallback((orderId, checked) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      // Select semua order yang bisa di-proses (status='processing' + processed_at NULL)
      const allSelectable = orders
        .filter(o => o.status === 'processing' && !o.processed_at)
        .map(o => o.id);
      setSelectedIds(new Set(allSelectable));
    } else {
      setSelectedIds(new Set());
    }
  }, [orders]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ⭐ Bulk process: tandai semua selected orders sebagai sudah diproses
  const handleBulkProcess = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Tandai ${count} order sebagai sudah diproses? Order akan pindah ke tab "Diproses".`)) return;

    setBulkProcessing(true);
    try {
      const now = new Date().toISOString();
      const ids = Array.from(selectedIds);

      // Update semua selected orders sekaligus
      const { error } = await supabase
        .from('orders')
        .update({ processed_at: now })
        .in('id', ids);

      if (error) throw error;

      // Clear selection + close expanded
      setSelectedIds(new Set());
      setExpandedId(null);

      // ⭐ Re-fetch orders supaya list langsung re-apply filter (selected orders hilang dari "Dibayar")
      await fetchOrders();

      console.log(`[AdminOrders] Bulk processed ${count} orders`);
    } catch (e) {
      console.error('[AdminOrders] bulk process error:', e?.message);
      alert('Gagal memproses bulk: ' + (e?.message || 'Unknown error'));
    } finally {
      setBulkProcessing(false);
    }
  }, [selectedIds, fetchOrders]);

  const handleClearSearch = () => setSearchQuery('');

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(p => p - 1);
      setExpandedId(null);
    }
  };
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(p => p + 1);
      setExpandedId(null);
    }
  };

  return (
    <AdminLayout title="Pesanan Aktif" subtitle="Kelola semua pesanan yang sedang aktif dari seluruh customer">
      <div className="space-y-4">
        {/* Info banner: penjelasan flow status */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
          <p className="font-medium mb-1">ℹ️ Flow Status Order:</p>
          <p className="text-blue-700">
            <strong>pending</strong> → <strong>Dibayar</strong> (sudah bayar, belum diproses) → <strong>Diproses</strong> (sudah ditandai admin) → <strong>Dikirim</strong> → <strong>delivered</strong>
          </p>
          <p className="text-blue-600 mt-1">
            Klik order untuk expand rincian. Di tab <strong>"Dibayar"</strong>, ada tombol <strong>"Tandai Sudah Diproses"</strong> untuk pindahkan order ke tab "Diproses".
          </p>
        </div>

        {/* Tab filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border
                ${activeTab === tab.key
                  ? 'bg-eglux-primary text-white border-eglux-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-eglux-secondary'}`}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`ml-1.5 ${activeTab === tab.key ? 'text-white/80' : 'text-gray-400'}`}>
                  ({tabCounts[tab.key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-md">
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari: Order ID, nama, no. HP, email customer..."
              className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:border-eglux-secondary focus:outline-none focus:ring-1 focus:ring-eglux-secondary/30 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Hapus pencarian"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full cursor-pointer border-none bg-transparent"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span className="hidden md:inline">Refresh</span>
          </button>
        </div>

        {/* ⭐ Bulk action bar — muncul kalau ada order yang di-select */}
        {selectedIds.size > 0 && (
          <div className="sticky top-[100px] md:top-[112px] z-20 bg-eglux-secondary text-white rounded-lg p-3 shadow-lg flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{selectedIds.size} order terpilih</span>
              <button
                onClick={handleClearSelection}
                className="text-xs text-white/80 hover:text-white underline cursor-pointer border-none bg-transparent"
              >
                Batal
              </button>
            </div>
            <button
              onClick={handleBulkProcess}
              disabled={bulkProcessing}
              className="px-4 py-1.5 bg-white text-eglux-secondary rounded-md text-xs font-bold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none flex items-center gap-1.5"
            >
              {bulkProcessing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Memproses...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Proses Sekaligus ({selectedIds.size})
                </>
              )}
            </button>
          </div>
        )}

        {/* ⭐ Select All bar — muncul di tab "Dibayar" kalau ada order yang bisa di-select */}
        {activeTab === 'paid' && selectableOrdersInPage.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelectableSelected}
              ref={(el) => { if (el) el.indeterminate = someSelectableSelected && !allSelectableSelected; }}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="w-4 h-4 cursor-pointer accent-eglux-secondary"
              aria-label="Pilih semua"
            />
            <span className="text-sm text-gray-700">
              {allSelectableSelected ? 'Semua terpilih' : `Pilih semua (${selectableOrdersInPage.length} order)`}
            </span>
          </div>
        )}

        {/* Result count */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <p>
            Menampilkan <span className="font-semibold text-gray-700">{orders.length}</span> dari <span className="font-semibold text-gray-700">{totalCount}</span> pesanan
            {searchQuery.trim() && <span> untuk "<span className="font-medium text-gray-700">{searchQuery.trim()}</span>"</span>}
          </p>
          <p>Halaman {currentPage} dari {totalPages}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={fetchOrders} className="mt-2 text-xs text-red-700 font-semibold hover:underline cursor-pointer">
              Coba lagi
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && orders.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-gray-700 font-medium mb-1">
              {searchQuery.trim() ? 'Tidak ada pesanan yang cocok' : 'Belum ada pesanan aktif'}
            </p>
            <p className="text-sm text-gray-400">
              {searchQuery.trim()
                ? `Coba kata kunci lain atau hapus filter pencarian.`
                : `Pesanan baru dari customer akan muncul di sini.`}
            </p>
          </div>
        )}

        {/* Orders list */}
        {!loading && !error && orders.length > 0 && (
          <div className="space-y-2">
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() => handleToggleExpand(order.id)}
                onMarkProcessed={handleMarkProcessed}
                isSelected={selectedIds.has(order.id)}
                onSelect={handleSelectOrder}
                showCheckbox={activeTab === 'paid'}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <button
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Sebelumnya
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => { setCurrentPage(pageNum); setExpandedId(null); }}
                    className={`w-8 h-8 text-xs font-medium rounded-lg cursor-pointer border transition-colors ${
                      currentPage === pageNum
                        ? 'bg-eglux-primary text-white border-eglux-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="px-4 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
            >
              Berikutnya
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminOrdersPage;
