// src/pages/OrderHistoryPage.jsx
// ============================================================================
// OrderHistoryPage — Riwayat Order (Archive Selesai + Dibatalkan)
// ============================================================================
// Differentiation dengan OrdersPage (/orders):
//   - /orders (Pesanan Saya)     = active orders (pending/processing/shipping)
//   - /order-history (Riwayat)   = archive (completed + cancelled)
//
// Card content (per user spec):
//   - Foto + nama produk (1-2 item preview)
//   - Status badge (Selesai / Dibatalkan)
//   - Tanggal selesai (updated_at = last status change)
//   - "Ajukan Pengembalian" button (untuk completed — refund flow)
//   - "Lihat Rincian" button → buka detail panel
//
// Tab filter (2 tabs only):
//   - Semua Riwayat (default) = completed + cancelled
//   - Selesai                 = completed only
//   - Dibatalkan              = cancelled only
//
// (3 tabs actually — "Semua Riwayat" + 2 status tabs)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

// ── Tab filter ──
const STATUS_TABS = [
  { key: 'all', label: 'Semua Riwayat' },
  { key: 'completed', label: 'Selesai' },
  { key: 'cancelled', label: 'Dibatalkan' },
];

const STATUS_BADGE = {
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-600', banner: 'bg-green-500' },
  cancelled: { text: 'Dibatalkan', cls: 'bg-red-50 text-red-600', banner: 'bg-red-500' },
};

const PAYMENT_LABEL = {
  unpaid: 'Belum Dibayar',
  paid: 'Lunas',
  failed: 'Gagal',
  expired: 'Kedaluwarsa',
};

const PAYMENT_METHOD_LABEL = {
  qris: 'QRIS',
  credit_card: 'Kartu Kredit',
  gopay: 'GoPay',
  shopeepay: 'ShopeePay',
  bca_va: 'BCA Virtual Account',
  bni_va: 'BNI Virtual Account',
  bri_va: 'BRI Virtual Account',
  permata_va: 'Permata Virtual Account',
  mandiri_ecash: 'Mandiri eCash',
  indomaret: 'Indomaret',
  alfamart: 'Alfamart',
  midtrans_snap: 'Midtrans Snap',
};

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' WIB';
}

function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

// ⭐ Helper: get "tanggal selesai" untuk order
// Priority:
//   1. completed → midtrans_settlement_time (kalau ada) atau created_at
//   2. cancelled → created_at (waktu order dibuat, karna kita gak track cancel_at)
//   (orders table gak punya updated_at column)
function getSelesaiDate(order) {
  if (!order) return null;
  if (order.status === 'completed') {
    return order.midtrans_settlement_time || order.created_at;
  }
  return order.created_at;
}

// ⭐ Helper: extract product image dari nested join (sama dengan OrdersList)
function getProductImage(item) {
  const imgs = item?.product?.product_images || [];
  if (!imgs.length) return null;
  if (item.variant_id) {
    const variantImg = imgs.find(img => img.variant_id === item.variant_id);
    if (variantImg?.url) return variantImg.url;
  }
  const nonVariant = imgs.filter(img => !img.variant_id);
  const primary = nonVariant.find(img => img.is_primary) || nonVariant[0];
  if (primary?.url) return primary.url;
  return imgs[0]?.url || null;
}

// ============================================================================
// HistoryCard — card dengan foto + nama + badge + tanggal selesai + 2 tombol
// ============================================================================
const HistoryCard = ({ order, onOpen, onRefund }) => {
  const items = order.order_items || [];
  const previewItems = items.slice(0, 2);
  const remainingCount = items.length - previewItems.length;
  const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  const cfg = STATUS_BADGE[order.status] || { cls: 'bg-gray-100 text-gray-600' };

  // Tanggal selesai = midtrans_settlement_time (untuk completed) atau created_at (fallback)
  const selesaiDate = getSelesaiDate(order);
  const selesaiLabel = order.status === 'completed' ? 'Selesai pada' : 'Dibatalkan pada';

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-eglux-secondary/30 transition-all">
      {/* Header: order id + status badge + tanggal selesai */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <p className="text-[0.7rem] text-gray-400">Order #{shortId(order.id)}</p>
          <p className="text-[0.7rem] text-gray-500 font-medium">
            {selesaiLabel} {formatDateTime(selesaiDate)}
          </p>
        </div>
        <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${cfg.cls}`}>
          {cfg.text}
        </span>
      </div>

      {/* Items preview — click area */}
      <button
        onClick={() => onOpen(order)}
        className="w-full px-5 py-4 space-y-3 text-left cursor-pointer bg-transparent border-none"
      >
        {previewItems.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-eglux-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
              {(() => {
                const img = getProductImage(item);
                return img
                  ? <img src={img} alt={item.product_name_snapshot} className="w-full h-full object-cover" loading="lazy" />
                  : <span className="text-base font-bold text-eglux-secondary uppercase">{(item.product_name_snapshot || '?').charAt(0)}</span>;
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-eglux-primary line-clamp-2">
                {item.product_name_snapshot}
              </p>
              {item.variant_name_snapshot && (
                <p className="text-[0.75rem] text-gray-400">{item.variant_name_snapshot}</p>
              )}
              <p className="text-[0.75rem] text-gray-500 mt-0.5">
                {item.quantity}x · {rupiah(item.unit_price_snapshot)}
              </p>
            </div>
            <p className="text-sm font-semibold text-eglux-primary whitespace-nowrap self-center">
              {rupiah(item.subtotal)}
            </p>
          </div>
        ))}
        {remainingCount > 0 && (
          <p className="text-[0.75rem] text-gray-400">+ {remainingCount} produk lainnya</p>
        )}
      </button>

      {/* Footer: total + 2 action buttons */}
      <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[0.7rem] text-gray-400">Total {totalQty} produk</p>
            {order.courier_code && (
              <p className="text-[0.7rem] text-gray-400 uppercase">
                {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-[0.7rem] text-gray-400">Total Pesanan</p>
            <p className="text-base font-bold text-eglux-secondary">{rupiah(order.total_amount)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Ajukan Pengembalian — only for completed orders (cancelled gak perlu refund) */}
          {order.status === 'completed' && (
            <button
              onClick={() => onRefund(order)}
              className="flex-1 px-3 py-2 bg-white border border-eglux-secondary/30 text-eglux-secondary rounded-lg text-xs font-semibold hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
              </svg>
              Ajukan Pengembalian
            </button>
          )}
          {/* Tiket Bantuan — for cancelled orders (atau sebagai alternatif) */}
          {order.status === 'cancelled' && (
            <button
              onClick={() => onRefund(order)}
              className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
              Tiket Bantuan
            </button>
          )}
          <button
            onClick={() => onOpen(order)}
            className="flex-1 px-3 py-2 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Lihat Rincian
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// HistoryDetailPanel — slide-in panel (mirip OrdersList tapi dengan refund action)
// ============================================================================
const HistoryDetailPanel = ({ order, onClose, onRefund }) => {
  const navigate = useNavigate();
  const items = order.order_items || [];
  const statusCfg = STATUS_BADGE[order.status] || { banner: 'bg-gray-500' };
  const canTrack = order.biteship_order_id || order.tracking_number || order.biteship_status;

  // ⭐ Lacak Pesanan: direct ke biteship_waybill_url (kalau ada), fallback ke /track page
  const handleTrackOrder = () => {
    if (order.biteship_waybill_url) {
      // Direct ke Biteship tracking page (gratis, no API call)
      window.open(order.biteship_waybill_url, '_blank', 'noopener,noreferrer');
    } else {
      // Fallback: buka track order page (untuk lihat status dari DB)
      onClose();
      navigate(`/track?order=${order.id}`);
    }
  };

  const handleProductClick = (e, productId) => {
    e.preventDefault();
    onClose();
    navigate(`/products?open=${productId}`);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[3000] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[500px] md:w-[560px] bg-white shadow-2xl z-[3001] overflow-y-auto animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Rincian Riwayat Pesanan"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-eglux-primary">Rincian Pesanan</h2>
            <p className="text-[0.7rem] text-gray-400">#{shortId(order.id)}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-eglux-primary transition-colors cursor-pointer border-none bg-transparent"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Status banner + tanggal selesai */}
          <div className={`${statusCfg.banner} rounded-xl px-4 py-3 text-white`}>
            <p className="text-sm font-bold">{(STATUS_BADGE[order.status] || {}).text || order.status}</p>
            <p className="text-[0.7rem] opacity-90 mt-0.5">
              {order.status === 'completed' ? 'Selesai pada' : 'Dibatalkan pada'} {formatDateTime(getSelesaiDate(order))}
            </p>
          </div>

          {/* Info Pengiriman */}
          {(order.courier_code || order.tracking_number) && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Info Pengiriman</p>
              <div className="space-y-1.5 text-sm">
                {order.courier_code && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kurir</span>
                    <span className="font-medium text-gray-900 uppercase">
                      {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
                    </span>
                  </div>
                )}
                {order.tracking_number && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-gray-500">No. Resi</span>
                    <span className="font-mono font-medium text-eglux-secondary text-xs">{order.tracking_number}</span>
                  </div>
                )}
                {order.biteship_status && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status Biteship</span>
                    <span className="font-medium text-gray-900 capitalize">{order.biteship_status}</span>
                  </div>
                )}
              </div>
              {canTrack && (
                <button
                  onClick={handleTrackOrder}
                  className="mt-3 w-full px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  Lacak Pesanan
                </button>
              )}
            </div>
          )}

          {/* Alamat Pengiriman */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Alamat Pengiriman</p>
            <p className="text-sm font-medium text-gray-900">{order.customer?.name || '—'}</p>
            {order.customer?.phone && (
              <p className="text-xs text-gray-500 mt-0.5">{order.customer.phone}</p>
            )}
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{order.shipping_address}</p>
            <p className="text-xs text-gray-500 mt-1">
              {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(', ')}
            </p>
          </div>

          {/* Produk Dibeli */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Produk Dibeli</p>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-lg bg-eglux-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(() => {
                      const img = getProductImage(item);
                      return img
                        ? <img src={img} alt={item.product_name_snapshot} className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-lg font-bold text-eglux-secondary uppercase">{(item.product_name_snapshot || '?').charAt(0)}</span>;
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/products?open=${item.product_id}`}
                      onClick={(e) => handleProductClick(e, item.product_id)}
                      className="text-sm font-medium text-eglux-primary hover:text-eglux-secondary hover:underline line-clamp-2 cursor-pointer"
                    >
                      {item.product_name_snapshot}
                    </a>
                    {item.variant_name_snapshot && (
                      <p className="text-[0.75rem] text-gray-400 mt-0.5">{item.variant_name_snapshot}</p>
                    )}
                    <p className="text-[0.75rem] text-gray-500 mt-0.5">
                      {item.quantity}x · {rupiah(item.unit_price_snapshot)}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-eglux-primary whitespace-nowrap self-center">
                    {rupiah(item.subtotal)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Rincian Pembayaran */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Rincian Pembayaran</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal ({items.length} produk)</span>
                <span className="text-gray-900">{rupiah(order.subtotal)}</span>
              </div>
              {Number(order.shipping_cost) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Ongkir
                    {order.courier_code && (
                      <span className="text-gray-400 ml-1 uppercase">
                        ({order.courier_code}{order.courier_service ? ` ${order.courier_service}` : ''})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-900">{rupiah(order.shipping_cost)}</span>
                </div>
              )}
              {Number(order.courier_rate) > 0 && Number(order.courier_rate) !== Number(order.shipping_cost) && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Biaya Kurir</span>
                  <span className="text-gray-900">{rupiah(order.courier_rate)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Pesanan</span>
                <span className="text-lg font-bold text-eglux-secondary">{rupiah(order.total_amount)}</span>
              </div>
            </div>
          </div>

          {/* Info Pembayaran */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Info Pembayaran</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Metode</span>
                <span className="font-medium text-gray-900">
                  {PAYMENT_METHOD_LABEL[order.midtrans_payment_type] || order.midtrans_payment_type || order.payment_method || '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`font-medium ${
                  order.payment_status === 'paid' ? 'text-green-600' :
                  order.payment_status === 'failed' || order.payment_status === 'expired' ? 'text-red-500' :
                  'text-gray-900'
                }`}>
                  {PAYMENT_LABEL[order.payment_status] || order.payment_status || '—'}
                </span>
              </div>
              {order.midtrans_settlement_time && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Waktu Bayar</span>
                  <span className="font-medium text-gray-900">{formatDateTime(order.midtrans_settlement_time)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Catatan */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Catatan</p>
              <p className="text-sm text-amber-900 leading-relaxed">{order.notes}</p>
            </div>
          )}

          {/* Action footer — Refund / Ticket + Tutup */}
          <div className="pt-2 pb-4 flex gap-2">
            <button
              onClick={() => onRefund(order)}
              className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer border flex items-center justify-center gap-1.5 ${
                order.status === 'completed'
                  ? 'bg-white border-eglux-secondary/30 text-eglux-secondary hover:bg-eglux-secondary hover:text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {order.status === 'completed' ? (
                  <>
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
                  </>
                ) : (
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
                )}
              </svg>
              {order.status === 'completed' ? 'Ajukan Pengembalian' : 'Tiket Bantuan'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors cursor-pointer border-none"
            >
              Tutup
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

// ============================================================================
// OrderHistoryPage — main page
// ============================================================================
const OrderHistoryPage = () => {
  const { user } = useAuth();
  const { openCart } = useCartActions();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const selectFields = `
        id, status, payment_status, total_amount, subtotal, shipping_cost,
        courier_code, courier_service, courier_duration, courier_rate,
        shipping_address, shipping_city, shipping_postal_code,
        created_at, notes,
        tracking_number, biteship_order_id, biteship_status,
        biteship_waybill_url, biteship_pickup_code,
        payment_method,
        midtrans_payment_type, midtrans_payment_code, midtrans_settlement_time,
        midtrans_transaction_status,
        customer:customers!inner(email, name, phone),
        order_items (
          id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
          unit_price_snapshot, quantity, subtotal,
          product:products (
            id, name,
            product_images ( id, url, is_primary, variant_id )
          )
        )
      `;
      // ⭐ Hanya fetch completed + cancelled (archive)
      // Order by created_at DESC (orders table gak punya updated_at column)
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(selectFields)
        .eq('customer.email', user.email)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchErr) {
        console.warn('[OrderHistory] DB filter failed, fallback:', fetchErr.message);
        const { data: allData, error: allErr } = await supabase
          .from('orders')
          .select(selectFields)
          .order('created_at', { ascending: false })
          .limit(100);

        if (allErr) throw allErr;
        setOrders((allData || []).filter(o =>
          o.customer?.email === user.email &&
          ['completed', 'cancelled'].includes(o.status)
        ));
      } else {
        setOrders(data || []);
      }
    } catch (e) {
      console.error('[OrderHistory] fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ⭐ Realtime subscription: auto-update orders saat ada perubahan di DB
  // (Biteship webhook update orders.status → frontend auto-refresh)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('order-history-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const updated = payload.new;
          setOrders((prev) => {
            const existing = prev.find(o => o.id === updated.id);
            if (!existing) return prev;
            const patched = { ...existing, ...updated };
            return prev.map(o => o.id === updated.id ? patched : o);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Lock scroll saat detail panel open
  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedOrder]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    return orders.filter(o => o.status === activeTab);
  }, [orders, activeTab]);

  const tabCounts = useMemo(() => {
    const counts = { all: orders.length };
    for (const tab of STATUS_TABS) {
      if (tab.key === 'all') continue;
      counts[tab.key] = orders.filter(o => o.status === tab.key).length;
    }
    return counts;
  }, [orders]);

  // Refund / Tiket action → navigate to /tickets?order=<id>
  const handleRefund = (order) => {
    setSelectedOrder(null);
    navigate(`/tickets?order=${order.id}`);
  };

  if (!user) {
    return (
      <>
        <HeaderProducts onCartOpen={openCart} />
        <section className="max-w-container mx-auto px-4 md:px-8 py-16 text-center">
          <p className="text-gray-500 mb-4">Kamu perlu masuk dulu untuk melihat riwayat pesanan.</p>
          <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">
            Masuk ke akun
          </Link>
        </section>
        <Footer />
      </>
    );
  }

  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      <section className="max-w-container mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Header dengan back link ke Pesanan Saya */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-eglux-primary">Riwayat Order</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pesanan yang sudah selesai atau dibatalkan</p>
          </div>
          <Link to="/orders" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            ← Lihat Pesanan Aktif
          </Link>
        </div>

        {/* Tab filter — 2 status tabs + Semua */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 -mx-1 px-1 no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer border
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

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 text-center">
            Gagal memuat riwayat: {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filteredOrders.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-700 font-medium mb-1">
              {activeTab === 'all' ? 'Belum ada riwayat' : `Tidak ada riwayat "${STATUS_TABS.find(t => t.key === activeTab)?.label}"`}
            </p>
            <p className="text-sm text-gray-400 mb-5">Pesanan yang selesai atau dibatalkan akan muncul di sini</p>
            <Link to="/products" className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              Mulai Belanja
            </Link>
          </div>
        )}

        {/* Order list */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <HistoryCard
                key={order.id}
                order={order}
                onOpen={setSelectedOrder}
                onRefund={handleRefund}
              />
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selectedOrder && (
          <HistoryDetailPanel
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onRefund={handleRefund}
          />
        )}

        {/* Inline CSS for animations */}
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .animate-fade-in { animation: fadeIn 0.2s ease-out; }
          .animate-slide-in-right { animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        `}</style>
      </section>

      <Footer />
    </>
  );
};

export default OrderHistoryPage;
