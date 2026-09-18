// src/pages/OrderHistoryPage.jsx
// ============================================================================
// OrderHistoryPage v3 FINAL — Riwayat Order + Return/Refund Integration
// ============================================================================
// Differentiation dengan OrdersPage (/orders):
//   - /orders (Pesanan Saya)     = active orders (pending/processing/shipping)
//   - /order-history (Riwayat)   = archive (delivered + cancelled + refund)
//
// ⭐ v3 UPDATE (Refund Integration — sesuai Flow Return v3):
//   1. Status badge 'refund' di-add ( Pesanan yang pernah di-refund )
//   2. Tab 'refund' baru di STATUS_TABS
//   3. Return status badge ( per-order_return ) tampil di HistoryCard
//   4. Button "Konfirmasi Nominal Refund" muncul kalau
//      order_return.status = 'awaiting_customer_confirmation'
//   5. Detail panel tampilkan info Return lengkap (refund_amount, alasan, status flow)
//   6. ReturnModal integration ( Mode Konfirmasi nominal )
//
// v2 features (tetap dipertahankan):
//   - Rincian Pembayaran LENGKAP (Harga Asli → Diskon Variant → Subtotal Setelah Diskon →
//     Ongkir → Biaya Admin & Tax → Voucher → Total + Hint hemat)
//   - Button "Tiket Bantuan" untuk semua status (buka modal langsung)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import ReturnModal from '../components/ui/ReturnModal';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';
import { friendlyErrorMessage } from '../lib/errorMessage';

import '/src/assets/styles/orderpage.css'

// ── Tab filter ──
// ⭐ v3: tambah 'refund' tab (Pengembalian Dana)
const STATUS_TABS = [
  { key: 'all', label: 'Semua Riwayat' },
  { key: 'delivered', label: 'Selesai' },
  { key: 'cancelled', label: 'Dibatalkan' },
  { key: 'refund', label: 'Pengembalian Dana' },
];

// ⭐ STATUS_BADGE: key utama 'delivered', plus 'completed' untuk backward compat
// v3: tambah 'refund' badge
const STATUS_BADGE = {
  delivered: { text: 'Selesai', cls: 'bg-green-50 text-green-600', banner: 'bg-green-500' },
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-600', banner: 'bg-green-500' }, // legacy fallback
  cancelled: { text: 'Dibatalkan', cls: 'bg-red-50 text-red-600', banner: 'bg-red-500' },
  refund:    { text: 'Pengembalian Dana', cls: 'bg-purple-50 text-purple-700', banner: 'bg-purple-600' },
};

// ⭐ v3: Return status badge ( per order_return.status )
// Sesuai flow SQL 083 — 5 status refund utama + intermediate
const RETURN_BADGE = {
  pending:                       { text: 'Menunggu Proses', cls: 'bg-amber-50 text-amber-700' },
  processing:                    { text: 'Sedang Diproses', cls: 'bg-blue-50 text-blue-700' },
  awaiting_customer_confirmation:{ text: 'Menunggu Konfirmasi Nominal', cls: 'bg-orange-50 text-orange-700', highlight: true },
  customer_confirmed:            { text: 'Nominal Dikonfirmasi', cls: 'bg-teal-50 text-teal-700' },
  approved:                      { text: 'Disetujui', cls: 'bg-indigo-50 text-indigo-700' },
  shipping_back:                 { text: 'Paket Dikirim Balik', cls: 'bg-cyan-50 text-cyan-700' },
  received:                      { text: 'Paket Diterima', cls: 'bg-blue-50 text-blue-700' },
  completed:                     { text: 'Refund Selesai', cls: 'bg-green-50 text-green-700' },
  cancelled:                     { text: 'Dibatalkan', cls: 'bg-gray-100 text-gray-600' },
  rejected:                      { text: 'Ditolak', cls: 'bg-red-50 text-red-700' },
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
function getSelesaiDate(order) {
  if (!order) return null;
  if (order.status === 'delivered' || order.status === 'completed') {
    return order.midtrans_settlement_time || order.created_at;
  }
  if (order.status === 'refund' && order.refunded_at) {
    return order.refunded_at;
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

// ⭐ v3: Helper — check apakah return butuh konfirmasi nominal dari customer
function needsCustomerConfirmation(ret) {
  return ret?.status === 'awaiting_customer_confirmation';
}

// ============================================================================
// HistoryCard — card dengan foto + nama + badge + tanggal selesai + action buttons
// ⭐ v3: tambah Return badge + Confirm Nominal button
// ============================================================================
const HistoryCard = ({ order, onOpen, onTicket, onConfirmRefund }) => {
  const items = order.order_items || [];
  const previewItems = items.slice(0, 2);
  const remainingCount = items.length - previewItems.length;
  const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  const cfg = STATUS_BADGE[order.status] || { cls: 'bg-gray-100 text-gray-600' };

  // ⭐ v3: Return data (kalau ada)
  const ret = order.order_returns?.[0] || order.order_return;
  const retCfg = ret ? RETURN_BADGE[ret.status] : null;
  const needsConfirm = needsCustomerConfirmation(ret);

  // Tanggal selesai = midtrans_settlement_time (untuk delivered) atau refunded_at (untuk refund) atau created_at (fallback)
  const selesaiDate = getSelesaiDate(order);
  const selesaiLabel = (order.status === 'delivered' || order.status === 'completed')
    ? 'Selesai pada'
    : order.status === 'refund'
      ? 'Refund pada'
      : 'Dibatalkan pada';

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
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* ⭐ v3: Return badge (highlight kalau butuh konfirmasi) */}
          {retCfg && (
            <span className={`inline-block px-2.5 py-1 rounded-full text-[0.65rem] font-semibold ${retCfg.cls} ${needsConfirm ? 'ring-2 ring-orange-300 animate-pulse' : ''}`}>
              ↩ {retCfg.text}
            </span>
          )}
          <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${cfg.cls}`}>
            {cfg.text}
          </span>
        </div>
      </div>

      {/* ⭐ v3: Alert "Konfirmasi Nominal Refund" — kalau butuh konfirmasi customer */}
      {needsConfirm && ret?.refund_amount != null && (
        <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-orange-800">
            <p className="font-semibold">Admin menawarkan refund sebesar:</p>
            <p className="text-base font-bold text-orange-900">{rupiah(Number(ret.refund_amount) || 0)}</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onConfirmRefund(order, ret); }}
            className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors cursor-pointer border-none whitespace-nowrap"
          >
            Konfirmasi Nominal
          </button>
        </div>
      )}

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

      {/* Footer: total + action buttons */}
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
            {/* ⭐ v3: kalau sudah refund, tampilkan refund_amount */}
            {order.refund_amount > 0 && (
              <p className="text-[0.65rem] text-purple-600 font-medium mt-0.5">
                Refund: {rupiah(Number(order.refund_amount) || 0)}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onTicket(order)}
            className="flex-1 px-3 py-2 bg-white border border-eglux-secondary/30 text-eglux-secondary rounded-lg text-xs font-semibold hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
            </svg>
            Tiket Bantuan
          </button>
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
// HistoryDetailPanel — slide-in panel (mirip OrdersList tapi dengan ticket + return info)
// ⭐ v3: tambah section "Info Pengembalian Dana" + tombol Konfirmasi Nominal
// ============================================================================
const HistoryDetailPanel = ({ order, onClose, onTicket, onConfirmRefund }) => {
  const navigate = useNavigate();
  const items = order.order_items || [];
  const statusCfg = STATUS_BADGE[order.status] || { banner: 'bg-gray-500' };
  const canTrack = Boolean(order.biteship_waybill_url);

  // ⭐ v3: Return data
  const ret = order.order_returns?.[0] || order.order_return;
  const retCfg = ret ? RETURN_BADGE[ret.status] : null;
  const needsConfirm = needsCustomerConfirmation(ret);

  // ⭐ Lacak Pesanan: direct ke biteship_waybill_url (kalau ada), fallback ke /track page
  const handleTrackOrder = () => {
    if (order.biteship_waybill_url) {
      window.open(order.biteship_waybill_url, '_blank', 'noopener,noreferrer');
    } else {
      onClose();
      navigate(`/track?order=${order.id}`);
    }
  };

  const handleProductClick = (e, productId) => {
    e.preventDefault();
    onClose();
    navigate(`/products?open=${productId}`);
  };

  // ⭐ v2: Compute breakdown values untuk rincian pembayaran lengkap
  const originalSubtotal = items.reduce((s, item) => {
    const orig = Number(item.original_unit_price) || Number(item.unit_price_snapshot) || 0;
    return s + (orig * (Number(item.quantity) || 1));
  }, 0);
  const discountedSubtotal = items.reduce((s, item) => {
    const unit = Number(item.unit_price_snapshot) || 0;
    return s + (unit * (Number(item.quantity) || 1));
  }, 0);
  const variantDiscount = originalSubtotal - discountedSubtotal;
  const hasVariantDiscount = variantDiscount > 0;

  // Tax: pakai nilai persisten dari DB, fallback recalc kalau order lama
  let taxAmount = Number(order.tax_amount) || 0;
  let taxPercent = Number(order.tax_percent) || 3;
  if (!taxAmount && originalSubtotal > 0) {
    taxAmount = Math.round(originalSubtotal * taxPercent / 100);
  }

  const voucherDiscount = Number(order.voucher_discount) || 0;
  const shippingCost = Number(order.shipping_cost) || 0;
  const totalSavings = variantDiscount + voucherDiscount;

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
              {(order.status === 'delivered' || order.status === 'completed') ? 'Selesai pada' :
                order.status === 'refund' ? 'Refund pada' : 'Dibatalkan pada'} {formatDateTime(getSelesaiDate(order))}
            </p>
          </div>

          {/* ⭐ v3: Info Pengembalian Dana (hanya kalau ada return) */}
          {ret && retCfg && (
            <div className={`rounded-xl p-4 border ${needsConfirm ? 'bg-orange-50 border-orange-300' : 'bg-purple-50 border-purple-200'}`}>
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">↩ Info Pengembalian Dana</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${retCfg.cls}`}>
                  {retCfg.text}
                </span>
              </div>
              <div className="space-y-1.5 text-sm">
                {ret.refund_amount != null && Number(ret.refund_amount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nominal Refund</span>
                    <span className="font-bold text-purple-700">{rupiah(Number(ret.refund_amount) || 0)}</span>
                  </div>
                )}
                {ret.reason && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Alasan</span>
                    <span className="font-medium text-gray-900 capitalize">{ret.reason.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {ret.resolution && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Solusi</span>
                    <span className="font-medium text-gray-900 capitalize">{ret.resolution.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {ret.admin_notes && (
                  <div className="mt-2 pt-2 border-t border-purple-200">
                    <p className="text-[0.65rem] text-purple-700 font-semibold uppercase mb-1">Catatan Admin</p>
                    <p className="text-xs text-purple-900 leading-relaxed">{ret.admin_notes}</p>
                  </div>
                )}
                {ret.created_at && (
                  <div className="flex justify-between text-[0.7rem]">
                    <span className="text-gray-500">Diajukan</span>
                    <span className="text-gray-500">{formatDateTime(ret.created_at)}</span>
                  </div>
                )}
                {ret.updated_at && ret.updated_at !== ret.created_at && (
                  <div className="flex justify-between text-[0.7rem]">
                    <span className="text-gray-500">Update</span>
                    <span className="text-gray-500">{formatDateTime(ret.updated_at)}</span>
                  </div>
                )}
              </div>

              {/* ⭐ v3: Tombol Konfirmasi Nominal ( kalau butuh konfirmasi customer ) */}
              {needsConfirm && (
                <button
                  onClick={() => onConfirmRefund(order, ret)}
                  className="mt-3 w-full px-4 py-2.5 bg-orange-600 text-white rounded-lg text-xs font-semibold hover:bg-orange-700 transition-colors cursor-pointer border-none flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Konfirmasi Nominal Refund ({rupiah(Number(ret.refund_amount) || 0)})
                </button>
              )}
            </div>
          )}

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
                    <span className="text-gray-500">Status</span>
                    <span className="font-medium text-gray-900 capitalize">{order.biteship_status}</span>
                  </div>
                )}
              </div>
              {canTrack && (
                <a
                  href={order.biteship_waybill_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 w-full px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none flex items-center justify-center gap-2 no-underline"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  Lacak Pesanan
                </a>
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
              {items.map((item, idx) => {
                const img = getProductImage(item);
                const itemUnitPrice = Number(item.unit_price_snapshot) || 0;
                const itemOriginalPrice = Number(item.original_unit_price) || itemUnitPrice;
                const itemQty = Number(item.quantity) || 1;
                const itemHasDiscount = itemOriginalPrice > itemUnitPrice;
                return (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-14 h-14 rounded-lg bg-eglux-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {img
                        ? <img src={img} alt={item.product_name_snapshot} className="w-full h-full object-cover" loading="lazy" />
                        : <span className="text-lg font-bold text-eglux-secondary uppercase">{(item.product_name_snapshot || '?').charAt(0)}</span>}
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
                        {itemQty}x · {rupiah(itemUnitPrice)}
                      </p>
                      {/* ⭐ v2: Tampilkan harga asli strike-through kalau ada diskon */}
                      {itemHasDiscount && (
                        <p className="text-[0.65rem] text-gray-400 line-through mt-0.5">
                          Harga asli: {rupiah(itemOriginalPrice)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-eglux-primary whitespace-nowrap self-center">
                      {rupiah(Number(item.subtotal) || (itemUnitPrice * itemQty))}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ⭐ v2: Rincian Pembayaran LENGKAP — match OrdersList & TrackOrderPage v3 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Rincian Pembayaran</p>
            <div className="space-y-2 text-sm">
              {/* 1. Subtotal harga asli (sebelum diskon variant) */}
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal Produk ({items.length} item)</span>
                <span className="font-medium text-gray-900">{rupiah(originalSubtotal)}</span>
              </div>

              {/* 2. Diskon variant (potongan) — tampilkan kalau ada */}
              {hasVariantDiscount && (
                <div className="flex justify-between">
                  <span className="text-green-600">↓ Diskon Variant</span>
                  <span className="font-medium text-green-600">− {rupiah(variantDiscount)}</span>
                </div>
              )}

              {/* 3. Subtotal setelah diskon variant — tampilkan kalau ada diskon */}
              {hasVariantDiscount && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Subtotal Setelah Diskon</span>
                  <span className="font-medium text-gray-900">{rupiah(discountedSubtotal)}</span>
                </div>
              )}

              {/* 4. Ongkir */}
              {shippingCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    Ongkir
                    {order.courier_code && (
                      <span className="text-gray-400 ml-1 uppercase">
                        ({order.courier_code}{order.courier_service ? ` ${order.courier_service}` : ''})
                      </span>
                    )}
                  </span>
                  <span className="font-medium text-gray-900">{rupiah(shippingCost)}</span>
                </div>
              )}

              {/* 5. Biaya Admin & Tax (% dari base price) — pakai nilai persisten dari DB */}
              {taxAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Biaya Admin &amp; Tax ({taxPercent}%)</span>
                  <span className="font-medium text-gray-900">{rupiah(taxAmount)}</span>
                </div>
              )}

              {/* 6. Voucher Discount — tampilkan kalau ada */}
              {voucherDiscount > 0 && (
                <div className="flex justify-between">
                  <span className="text-green-600">
                    🎟️ Voucher
                    {order.voucher_code && (
                      <span className="text-gray-400 ml-1">({order.voucher_code})</span>
                    )}
                  </span>
                  <span className="text-green-600 font-medium">− {rupiah(voucherDiscount)}</span>
                </div>
              )}

              {/* 7. Grand Total */}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Pembayaran</span>
                <span className="text-lg font-bold text-eglux-secondary">{rupiah(order.total_amount)}</span>
              </div>

              {/* ⭐ v3: Refund info di rincian pembayaran ( kalau sudah refund ) */}
              {order.refund_amount > 0 && (
                <div className="border-t border-purple-200 pt-2 mt-2 flex justify-between items-center">
                  <span className="font-semibold text-purple-700">↓ Refund Diberikan</span>
                  <span className="text-lg font-bold text-purple-700">− {rupiah(Number(order.refund_amount) || 0)}</span>
                </div>
              )}

              {/* Hint hemat = total diskon (variant discount + voucher) */}
              {totalSavings > 0 && (
                <p className="text-[0.65rem] text-green-600 mt-1.5 text-right">
                  🎉 Kamu hemat {rupiah(totalSavings)}!
                </p>
              )}
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

          {/* ⭐ v2: Action footer — Tiket Bantuan (untuk semua status) + Tutup */}
          <div className="pt-2 pb-4 flex gap-2">
            <button
              onClick={() => onTicket(order)}
              className="flex-1 px-4 py-2.5 bg-white border border-eglux-secondary/30 text-eglux-secondary rounded-lg text-xs font-semibold hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
              </svg>
              Tiket Bantuan
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
// ⭐ v3: tambah ReturnModal integration + state untuk konfirmasi nominal
// ============================================================================
const OrderHistoryPage = () => {
  const { user } = useAuth();
  const { openCart, openTicket } = useCartActions();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ⭐ v3: State untuk ReturnModal (Mode Konfirmasi Nominal)
  const [returnModalOrder, setReturnModalOrder] = useState(null); // order
  const [returnModalData, setReturnModalData] = useState(null); // existingReturn

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // ⭐ v2: tambah original_unit_price di order_items (untuk rincian pembayaran lengkap)
      // ⭐ v3: tambah refund_amount + refunded_at dari orders (synced via SQL 090)
      //        + join order_returns untuk return status
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
        voucher_code, voucher_discount,
        tax_percent, tax_base, tax_amount,
        refund_amount, refunded_at,
        customer:customers!inner(email, name, phone),
        order_items (
          id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
          unit_price_snapshot, original_unit_price, quantity, subtotal,
          product:products (
            id, name,
            product_images ( id, url, is_primary, variant_id )
          )
        ),
        order_returns (
          id, status, reason, resolution, refund_amount,
          admin_notes, customer_notes,
          created_at, updated_at
        )
      `;
      // ⭐ v3: tambah 'refund' ke filter status
      // DB constraint (SQL 032e) hanya allow 'delivered' (BUKAN 'completed' lagi)
      // Tapi tetap include 'completed' di filter untuk backward compat dengan data lama
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(selectFields)
        .eq('customer.email', user.email)
        .in('status', ['delivered', 'completed', 'cancelled', 'refund'])
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
          ['delivered', 'completed', 'cancelled', 'refund'].includes(o.status)
        ));
      } else {
        setOrders(data || []);
      }
    } catch (e) {
      console.error('[OrderHistory] fetch error:', e?.message);
      setError(friendlyErrorMessage(e, 'Memuat riwayat order'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ⭐ Realtime subscription: auto-update orders + order_returns saat ada perubahan di DB
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('order-history-realtime-v3')
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_returns',
        },
        () => {
          // Refetch supaya dapat latest order_returns data ( nested join gak bisa di-patch partial )
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

  // Lock scroll saat detail panel open
  useEffect(() => {
    if (selectedOrder || returnModalOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [selectedOrder, returnModalOrder]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    // ⭐ Backward compat: tab "delivered" juga show "completed" (legacy data)
    if (activeTab === 'delivered') {
      return orders.filter(o => o.status === 'delivered' || o.status === 'completed');
    }
    return orders.filter(o => o.status === activeTab);
  }, [orders, activeTab]);

  const tabCounts = useMemo(() => {
    const counts = { all: orders.length };
    for (const tab of STATUS_TABS) {
      if (tab.key === 'all') continue;
      // ⭐ Backward compat: tab "delivered" juga count "completed" (legacy data)
      if (tab.key === 'delivered') {
        counts[tab.key] = orders.filter(o => o.status === 'delivered' || o.status === 'completed').length;
      } else {
        counts[tab.key] = orders.filter(o => o.status === tab.key).length;
      }
    }
    return counts;
  }, [orders]);

  // ⭐ v2: Tiket Bantuan handler → tutup detail panel + buka modal Tiket Bantuan
  const handleTicket = useCallback((order) => {
    setSelectedOrder(null);
    openTicket();
  }, [openTicket]);

  // ⭐ v3: Konfirmasi Nominal Refund handler → tutup detail panel + buka ReturnModal
  const handleConfirmRefund = useCallback((order, ret) => {
    setSelectedOrder(null);
    setReturnModalOrder(order);
    setReturnModalData(ret);
  }, []);

  // ⭐ v3: ReturnModal success handler → refetch + close
  const handleReturnSuccess = useCallback(() => {
    setReturnModalOrder(null);
    setReturnModalData(null);
    fetchOrders();
  }, [fetchOrders]);

  // ── Login required ──
  if (!user) {
    return (
      <div className="section-full-mobile w-full">
        <div className="mobile-viewport-group">
          <HeaderProducts onCartOpen={openCart} forceScrolled />

          <section className="section-mobile relative flex flex-col items-center justify-center text-center px-4">
            <p className="text-gray-500 mb-4">Sudah punya Akun?</p>
            <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">
              Masuk ke akun
            </Link>
          </section>
        </div>

        <Footer />
      </div>
    );
  }

  return (
    <>
      {/* ⭐ forceScrolled — header selalu putih, gak transparan menumpuk konten */}
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <section className="max-w-3xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-8">
        {/* Header dengan back link ke Pesanan Saya */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-eglux-primary">Riwayat Order</h1>
            <p className="text-sm text-gray-500 mt-0.5">Pesanan yang sudah selesai, dibatalkan, atau di-refund</p>
          </div>
          <Link to="/orders" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            ← Lihat Pesanan Aktif
          </Link>
        </div>

        {/* Tab filter — 3 status tabs + Semua */}
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
            <p className="text-sm text-gray-400 mb-5">Pesanan yang selesai, dibatalkan, atau di-refund akan muncul di sini</p>
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
                onTicket={handleTicket}
                onConfirmRefund={handleConfirmRefund}
              />
            ))}
          </div>
        )}

        {/* Detail panel */}
        {selectedOrder && (
          <HistoryDetailPanel
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onTicket={handleTicket}
            onConfirmRefund={handleConfirmRefund}
          />
        )}

        {/* ⭐ v3: ReturnModal ( Mode Konfirmasi Nominal ) */}
        {returnModalOrder && (
          <ReturnModal
            isOpen={true}
            onClose={() => {
              setReturnModalOrder(null);
              setReturnModalData(null);
            }}
            orderId={returnModalOrder.id}
            orderTotal={returnModalOrder.total_amount}
            existingReturn={returnModalData}
            onSuccess={handleReturnSuccess}
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
