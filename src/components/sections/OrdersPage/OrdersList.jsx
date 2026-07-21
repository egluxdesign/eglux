// src/components/sections/OrdersPage/OrdersList.jsx
// ============================================================================
// OrdersList — "Pesanan Saya" (Shopee-style)
// ============================================================================
// UX flow:
//   1. List pesanan dengan tab filter (Semua/Menunggu/Diproses/Dikirim/Selesai/Dibatalkan)
//   2. Klik order card → buka detail panel (slide-in dari kanan, full screen di mobile)
//   3. Detail panel berisi:
//      - Status banner (warna sesuai status)
//      - Info pengiriman (kurir, layanan, estimasi, resi)
//      - Alamat pengiriman
//      - Produk dibeli (item卡片, klik → /products?open=<product_id>)
//      - Rincian pembayaran (Subtotal + Ongkir + Total — TRANSPARAN)
//      - Tombol "Lacak Pesanan" → /track?order=<order_id>
//
// Filter: customer.email = user.email (BUKAN customer_id = user.id)
//   karena customers.id ≠ auth.users.id. customers.user_id baru di-set
//   di create-order edge function (SQL 025 backfill yang lama).
//
// Differentiation dengan TrackOrderPage:
//   - OrdersPage = Rincian pesanan (items, harga, payment, shipping address)
//   - TrackOrderPage = Biteship tracking timeline (driver, origin→destination, history)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabaseClient';
import { rupiah } from '../../../context/CartContext';
import { ensureSnapLoaded } from '../../../hooks/useMidtransSnap';
import ChangeCourierModal from '../../ui/ChangeCourierModal';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Status tabs (ACTIVE ONLY — completed/cancelled pindah ke /order-history) ──
const STATUS_TABS = [
  { key: 'all_active', label: 'Semua Active' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'processing', label: 'Diproses' },
  { key: 'shipping', label: 'Dikirim' },
];

// Active statuses (yang ditampilkan di /orders)
const ACTIVE_STATUSES = ['pending', 'processing', 'shipping'];

// ⚠️ NOTE: orders.status vocab: pending, processing, shipping, completed, cancelled
// (di midtrans-webhook mapOrderStatus pakai 'shipping' bukan 'shipped')
const STATUS_BADGE = {
  pending:    { text: 'Menunggu Pembayaran', cls: 'bg-gray-100 text-gray-600', banner: 'bg-gray-500' },
  processing: { text: 'Diproses',             cls: 'bg-blue-50 text-blue-600',  banner: 'bg-blue-500' },
  shipping:   { text: 'Dikirim',              cls: 'bg-purple-50 text-purple-600', banner: 'bg-purple-500' },
  shipped:    { text: 'Dikirim',              cls: 'bg-purple-50 text-purple-600', banner: 'bg-purple-500' },
  completed:  { text: 'Selesai',              cls: 'bg-green-50 text-green-600', banner: 'bg-green-500' },
  cancelled:  { text: 'Dibatalkan',           cls: 'bg-red-50 text-red-600',   banner: 'bg-red-500' },
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

// ⭐ Helper: extract product image dari nested join
// Priority:
//   1. Variant image (kalau order_item punya variant_id)
//   2. Product cover image (variant_id IS NULL, prefer is_primary=true)
//   3. Fallback any image
//   4. null → UI akan render letter placeholder
function getProductImage(item) {
  const imgs = item?.product?.product_images || [];
  if (!imgs.length) return null;
  // 1. Variant image (paling spesifik)
  if (item.variant_id) {
    const variantImg = imgs.find(img => img.variant_id === item.variant_id);
    if (variantImg?.url) return variantImg.url;
  }
  // 2. Cover image (non-variant, prefer is_primary)
  const nonVariant = imgs.filter(img => !img.variant_id);
  const primary = nonVariant.find(img => img.is_primary) || nonVariant[0];
  if (primary?.url) return primary.url;
  // 3. Fallback first image apapun
  return imgs[0]?.url || null;
}

const StatusBadge = ({ status }) => {
  const cfg = STATUS_BADGE[status] || { text: status || '—', cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${cfg.cls}`}>
      {cfg.text}
    </span>
  );
};

// ============================================================================
// OrderCard — preview di list (clickable → open detail)
// ============================================================================
const OrderCard = ({ order, onOpen }) => {
  const items = order.order_items || [];
  const previewItems = items.slice(0, 2);
  const remainingCount = items.length - previewItems.length;
  const totalQty = items.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  return (
    <button
      onClick={() => onOpen(order)}
      className="w-full bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md hover:border-eglux-secondary/30 transition-all text-left cursor-pointer"
    >
      {/* Header: order id + status + tanggal */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">
          <p className="text-[0.7rem] text-gray-400">Order #{shortId(order.id)}</p>
          <p className="text-[0.7rem] text-gray-400">{formatDateTime(order.created_at)}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Items preview */}
      <div className="px-5 py-4 space-y-3">
        {previewItems.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3">
            {/* Thumbnail: real product image (fallback letter) */}
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
      </div>

      {/* Footer: total + hint */}
      <div className="px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-[0.7rem] text-gray-400">Total {totalQty} produk</p>
          {order.courier_code && (
            <p className="text-[0.7rem] text-gray-400 uppercase">
              {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[0.7rem] text-gray-400">Total Pesanan</p>
            <p className="text-base font-bold text-eglux-secondary">{rupiah(order.total_amount)}</p>
          </div>
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </button>
  );
};

// ============================================================================
// OrderDetailPanel — slide-in panel dengan rincian lengkap
// ============================================================================
const OrderDetailPanel = ({ order: orderProp, onClose, onOrderUpdated }) => {
  const navigate = useNavigate();
  // ⭐ Local state untuk order — supaya bisa di-update in-place saat courier change
  // (parent onOrderUpdated fetch list of orders, tapi gak replace selectedOrder ref)
  const [order, setOrder] = useState(orderProp);

  // Sync kalau parent ganti orderProp (mis. user klik order lain)
  useEffect(() => {
    setOrder(orderProp);
  }, [orderProp]);

  const items = order.order_items || [];
  const statusCfg = STATUS_BADGE[order.status] || { banner: 'bg-gray-500' };
  const canTrack = order.biteship_order_id || order.tracking_number || order.status === 'shipping' || order.status === 'shipped' || order.biteship_status;
  const isPending = order.status === 'pending' && order.payment_status !== 'paid';

  // ⭐ State untuk ChangeCourierModal + payment loading
  const [showCourierModal, setShowCourierModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState(null);

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

  // ⭐ Lanjutkan Pembayaran: ensure Snap.js loaded → mint fresh token → open popup
  const handleLanjutkanPembayaran = async () => {
    setPaying(true);
    setActionError(null);

    try {
      // ⭐ STEP 1: Pastikan Midtrans Snap.js sudah di-load
      // (di /orders page, snap.js belum di-load — beda dengan halaman checkout)
      try {
        await ensureSnapLoaded();
      } catch (loadErr) {
        setActionError(
          'Sistem pembayaran gagal dimuat. Cek koneksi internet atau refresh halaman, lalu coba lagi.'
        );
        setPaying(false);
        return;
      }

      // Verify snap API ready (defensive)
      if (!window.snap || typeof window.snap.pay !== 'function') {
        setActionError('Sistem pembayaran belum siap. Refresh halaman lalu coba lagi.');
        setPaying(false);
        return;
      }

      // ⭐ STEP 2: Mint fresh Snap token via edge function
      // (Order mungkin sudah ada snap_token lama, tapi kita minta baru karena
      // amount mungkin berubah setelah ubah kurir. Edge function akan overwrite.)
      const { data, error: fnError } = await supabase.functions.invoke(
        'create-midtrans-transaction',
        { body: { order_id: order.id } }
      );

      if (fnError || !data?.token) {
        // ⭐ Extract error message yang lebih informatif dari edge function response
        let errMsg = 'Gagal membuat transaksi pembayaran';
        if (data?.error) {
          errMsg = data.error;
          // Kalau ada debug info, tampilkan juga
          if (data.debug) {
            console.error('[OrdersList] Debug info:', data.debug);
            errMsg += ` (debug: ${JSON.stringify(data.debug)})`;
          }
        } else if (fnError?.message) {
          errMsg = fnError.message;
        }
        throw new Error(errMsg);
      }

      // Close detail panel dulu supaya popup Snap gak ketutup di belakang panel
      onClose();

      // ⭐ STEP 3: Open Midtrans Snap popup
      // Setelah popup close (success/pending/close), start polling payment status
      // untuk instant notification (gak nunggu webhook delay)
      const startPaymentPolling = (orderId) => {
        let pollCount = 0;
        const maxPolls = 60; // 60 polls × 3 detik = 3 menit max
        console.log('[OrdersList] Start polling payment status for', orderId);

        const poll = async () => {
          if (pollCount >= maxPolls) {
            console.log('[OrdersList] Polling stopped (timeout)');
            return;
          }
          pollCount++;

          try {
            const { data, error } = await supabase.functions.invoke(
              'check-payment-status',
              { body: { order_id: orderId } }
            );

            if (error) {
              console.warn('[OrdersList] Poll error:', error.message);
              return;
            }

            if (data?.payment_status === 'paid') {
              console.log('[OrdersList] ✓ Payment confirmed via polling');
              onOrderUpdated?.(); // refresh orders list
              // Stop polling
              return;
            }
            if (data?.payment_status === 'failed') {
              console.log('[OrdersList] Payment failed via polling');
              onOrderUpdated?.();
              return;
            }
            // Still pending → continue polling
            setTimeout(poll, 3000); // 3 detik
          } catch (e) {
            console.warn('[OrdersList] Poll exception:', e.message);
            setTimeout(poll, 5000); // retry 5 detik kalau error
          }
        };

        // Start pertama kali 3 detik setelah popup close
        setTimeout(poll, 3000);
      };

      window.snap.pay(data.token, {
        onSuccess: (result) => {
          // ⭐ Defensive: reset body scroll lock yang mungkin di-set oleh Snap popup
          document.body.style.overflow = '';
          setPaying(false);
          onOrderUpdated?.();
          // Polling tambahan untuk konfirmasi DB terupdate
          startPaymentPolling(order.id);
        },
        onPending: () => {
          document.body.style.overflow = '';
          setPaying(false);
          onOrderUpdated?.();
          // Polling untuk detect kalau user bayar nanti (QRIS async)
          startPaymentPolling(order.id);
        },
        onError: () => {
          document.body.style.overflow = '';
          setPaying(false);
        },
        onClose: () => {
          document.body.style.overflow = '';
          setPaying(false);
          onOrderUpdated?.();
          // Polling untuk detect kalau user close popup tapi sebenernya udah bayar
          // (QRIS bisa confirmed beberapa detik setelah user scan)
          startPaymentPolling(order.id);
        },
      });
    } catch (e) {
      console.error('[OrdersList] Lanjutkan Pembayaran error:', e);
      const msg = e.message?.includes('Failed to fetch') || e.message?.includes('CORS')
        ? 'Gagal terhubung ke server pembayaran. Coba lagi beberapa saat.'
        : e.message;
      setActionError(msg);
      setPaying(false);
    }
  };

  // ⭐ After courier change: patch local order state + close modal + refresh parent list
  // (Tanpa ini, rincian pembayaran di panel gak update sampai user tutup panel)
  const handleCourierUpdated = (updatedFields) => {
    setShowCourierModal(false);
    // Patch local order state dengan fields baru dari edge function
    if (updatedFields && typeof updatedFields === 'object') {
      setOrder((prev) => ({ ...prev, ...updatedFields }));
    }
    // Refresh parent list supaya list card juga update
    onOrderUpdated?.();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[3000] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — slide-in dari kanan */}
      <aside
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[500px] md:w-[560px] bg-white shadow-2xl z-[3001] overflow-y-auto animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-label="Rincian Pesanan"
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
          {/* Status banner */}
          <div className={`${statusCfg.banner} rounded-xl px-4 py-3 text-white`}>
            <p className="text-sm font-bold">{(STATUS_BADGE[order.status] || {}).text || order.status}</p>
            <p className="text-[0.7rem] opacity-90 mt-0.5">{formatDateTime(order.created_at)}</p>
          </div>

          {/* Info Pengiriman (kurir + resi) */}
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
                {order.courier_duration && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Estimasi</span>
                    <span className="font-medium text-gray-900">{order.courier_duration}</span>
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
            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
              {order.shipping_address}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(', ')}
            </p>
          </div>

          {/* Produk yang Dibeli */}
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

          {/* Rincian Pembayaran (TRANSPARAN) */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Rincian Pembayaran</p>
            <div className="space-y-2 text-sm">
              {/* Subtotal item */}
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal ({items.length} produk)</span>
                <span className="text-gray-900">{rupiah(order.subtotal)}</span>
              </div>

              {/* Ongkir (courier) — TRANSPARAN */}
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

              {/* Biaya lain kalau ada (courier_rate bisa beda dari shipping_cost kalau ada surcharge) */}
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

          {/* Info Pembayaran (Midtrans) */}
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
              {order.midtrans_payment_code && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-gray-500">Kode Bayar</span>
                  <span className="font-mono font-medium text-gray-900 text-xs">{order.midtrans_payment_code}</span>
                </div>
              )}
            </div>
          </div>

          {/* Catatan (jika ada) */}
          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Catatan</p>
              <p className="text-sm text-amber-900 leading-relaxed">{order.notes}</p>
            </div>
          )}

          {/* Action error (kalau ada saat klik tombol) */}
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
              ⚠ {actionError}
            </div>
          )}

          {/* Action footer */}
          <div className="pt-2 pb-4 space-y-2">
            {/* Pending-only actions: Lanjutkan Pembayaran + Ubah Kurir */}
            {isPending && (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCourierModal(true)}
                  disabled={paying}
                  className="flex-1 px-4 py-2.5 bg-white border border-eglux-secondary/30 text-eglux-secondary rounded-lg text-xs font-semibold hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                  Ubah Kurir
                </button>
                <button
                  onClick={handleLanjutkanPembayaran}
                  disabled={paying}
                  className="flex-1 px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {paying ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Memuat...
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                      Lanjutkan Pembayaran
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Default actions: Lacak Pesanan (kalau ada tracking) + Tutup */}
            <div className="flex gap-2">
              {canTrack && (
                <button
                  onClick={handleTrackOrder}
                  className="flex-1 px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none"
                >
                  Lacak Pesanan
                </button>
              )}
              <button
                onClick={onClose}
                disabled={paying}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors cursor-pointer border-none disabled:opacity-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ChangeCourierModal — only render kalau isPending */}
      {isPending && (
        <ChangeCourierModal
          isOpen={showCourierModal}
          onClose={() => setShowCourierModal(false)}
          order={order}
          onUpdated={handleCourierUpdated}
        />
      )}
    </>
  );
};

// ============================================================================
// OrdersList — main component
// ============================================================================
const OrdersList = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all_active');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // ⭐ Filter via customer.email (BUKAN customer_id = user.id)
      // customers.id = UUID customers table, auth.users.id = auth table
      // create-order edge function set customers.user_id = auth.users.id (lihat SQL 025)
      // ⭐ Include product + product_images untuk thumbnail foto produk
      const selectFields = `
        id, status, payment_status, total_amount, subtotal, shipping_cost,
        courier_code, courier_service, courier_duration, courier_rate,
        shipping_address, shipping_city, shipping_postal_code,
        shipping_area_id, shipping_area_name,
        biteship_order_id, biteship_status, biteship_waybill_url, biteship_pickup_code,
        tracking_number,
        created_at, notes,
        payment_method,
        midtrans_payment_type, midtrans_payment_code, midtrans_settlement_time,
        midtrans_transaction_status,
        customer:customers!inner(email, name, phone),
        order_items (
          id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
          unit_price_snapshot, quantity, subtotal, weight_gram,
          product:products (
            id, name,
            product_images ( id, url, is_primary, variant_id )
          )
        )
      `;
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(selectFields)
        .eq('customer.email', user.email)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchErr) {
        console.warn('[OrdersList] DB filter failed, fallback:', fetchErr.message);
        // Fallback: fetch + client-side filter (RLS fallback)
        const { data: allData, error: allErr } = await supabase
          .from('orders')
          .select(selectFields)
          .order('created_at', { ascending: false })
          .limit(50);

        if (allErr) throw allErr;
        setOrders((allData || []).filter(o => o.customer?.email === user.email));
      } else {
        setOrders(data || []);
      }
    } catch (e) {
      console.error('[OrdersList] fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ⭐ Realtime subscription: auto-update orders saat ada perubahan di DB
  // (Biteship webhook update orders.status/biteship_status → frontend auto-refresh)
  // Tanpa ini, user harus manual refresh untuk lihat status baru.
  useEffect(() => {
    if (!user) return;

    // Subscribe ke postgres_changes di table orders
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const updated = payload.new;
          const old = payload.old || {};

          // ⭐ Cek apakah order ini milik user (via customer email match di state lokal)
          // Realtime payload gak include join customer, jadi cek di state lokal
          setOrders((prevOrders) => {
            const existing = prevOrders.find(o => o.id === updated.id);
            if (!existing) return prevOrders; // bukan milik user, skip

            // Patch fields yang berubah (status, biteship_status, tracking_number, dst.)
            const patched = { ...existing, ...updated };
            return prevOrders.map(o => o.id === updated.id ? patched : o);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
        },
        () => {
          // Order baru dibuat → refetch semua untuk dapat join data lengkap
          fetchOrders();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[OrdersList] ✓ Realtime subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[OrdersList] Realtime subscription issue:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchOrders]);

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
    // Filter out completed + cancelled (mereka ada di /order-history)
    const activeOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    if (activeTab === 'all_active') return activeOrders;
    return activeOrders.filter(o => o.status === activeTab);
  }, [orders, activeTab]);

  const tabCounts = useMemo(() => {
    const activeOrders = orders.filter(o => ACTIVE_STATUSES.includes(o.status));
    const counts = { all_active: activeOrders.length };
    for (const tab of STATUS_TABS) {
      if (tab.key === 'all_active') continue;
      counts[tab.key] = activeOrders.filter(o => o.status === tab.key).length;
    }
    return counts;
  }, [orders]);

  if (!user) {
    return (
      <section className="max-w-container mx-auto px-4 md:px-8 py-16 text-center">
        <p className="text-gray-500 mb-4">Kamu perlu masuk dulu untuk melihat pesanan.</p>
        <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">
          Masuk ke akun
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-container mx-auto px-4 md:px-8 py-8 md:py-12">
      <h1 className="text-xl md:text-2xl font-bold text-eglux-primary mb-6">Pesanan Saya</h1>

      {/* Status tabs — Active only (Semua Active / Menunggu / Diproses / Dikirim) */}
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
        {/* Link ke /order-history untuk lihat Selesai + Dibatalkan */}
        <Link
          to="/order-history"
          className="ml-auto whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium text-eglux-secondary hover:bg-eglux-secondary/5 transition-colors cursor-pointer"
        >
          Riwayat →
        </Link>
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
          Gagal memuat pesanan: {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredOrders.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📦</div>
          <p className="text-gray-700 font-medium mb-1">
            {activeTab === 'all_active' ? 'Tidak ada pesanan aktif' : `Tidak ada pesanan "${STATUS_TABS.find(t => t.key === activeTab)?.label}"`}
          </p>
          <p className="text-sm text-gray-400 mb-5">Pesanan yang sedang berjalan akan muncul di sini</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/products" className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
              Mulai Belanja
            </Link>
            <Link to="/order-history" className="inline-block px-6 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors">
              Lihat Riwayat
            </Link>
          </div>
        </div>
      )}

      {/* Order list */}
      {!loading && !error && filteredOrders.length > 0 && (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} onOpen={setSelectedOrder} />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onOrderUpdated={fetchOrders}
        />
      )}

      {/* Inline CSS for animations (one-time inject) */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-fade-in { animation: fadeIn 0.2s ease-out; }
        .animate-slide-in-right { animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </section>
  );
};

export default OrdersList;
