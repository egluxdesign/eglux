// src/pages/TrackOrderPage.jsx
// ============================================================================
// Lacak Pesanan — Simple version (no Tracking API call)
// ============================================================================
// Behavior:
//   - Default view: list orders (hanya yang status 'processing' / 'shipping' /
//     'completed' — yaitu yang sudah dibayar, Biteship order sudah dibuat).
//   - Klik order → masuk DETAIL view: hanya 1 order itu yang tampil +
//     ShippingInfoCard dengan info dari DB + tombol "Lacak Paket di Biteship"
//     yang direct ke biteship_waybill_url dari DB.
//   - Tombol "← Kembali" di detail view untuk balik ke list.
//
// ⭐ GAK ADA Tracking API call (yang berbayar)!
//    Semua info diambil dari DB: biteship_status, biteship_waybill_url,
//    tracking_number, courier_code, dst. — yang sudah di-update via webhook.
//
// Deep link:
//   /track?order=<id> → auto-buka detail view untuk order tersebut
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

// ⭐ Hanya order dengan status ini yang ditampilkan (sudah dibayar → punya tracking)
const TRACKABLE_STATUSES = ['processing', 'shipping', 'completed'];

// ── Biteship status labels (Indonesian) — snake_case + camelCase ──
const SHIPPING_STATUS_LABEL = {
  // Pre-pickup
  confirmed: { label: 'Pesanan Dikonfirmasi', color: 'text-blue-600', dot: 'bg-blue-500' },
  allocated: { label: 'Kurir Dialokasikan', color: 'text-blue-600', dot: 'bg-blue-500' },
  picking_up: { label: 'Kurir Menuju Lokasi', color: 'text-amber-600', dot: 'bg-amber-500' },
  pickingUp: { label: 'Kurir Menuju Lokasi', color: 'text-amber-600', dot: 'bg-amber-500' },
  // In transit
  picked: { label: 'Paket Diambil', color: 'text-amber-600', dot: 'bg-amber-500' },
  in_transit: { label: 'Dalam Perjalanan', color: 'text-purple-600', dot: 'bg-purple-500' },
  inTransit: { label: 'Dalam Perjalanan', color: 'text-purple-600', dot: 'bg-purple-500' },
  dropping_off: { label: 'Menuju Penerima', color: 'text-purple-600', dot: 'bg-purple-500' },
  droppingOff: { label: 'Menuju Penerima', color: 'text-purple-600', dot: 'bg-purple-500' },
  on_hold: { label: 'Ditahan', color: 'text-gray-600', dot: 'bg-gray-500' },
  onHold: { label: 'Ditahan', color: 'text-gray-600', dot: 'bg-gray-500' },
  // Delivered
  delivered: { label: 'Tiba di Tujuan', color: 'text-green-600', dot: 'bg-green-500' },
  // Cancelled-like
  cancelled: { label: 'Dibatalkan', color: 'text-red-500', dot: 'bg-red-400' },
  returned: { label: 'Dikembalikan', color: 'text-orange-600', dot: 'bg-orange-500' },
  rejected: { label: 'Ditolak', color: 'text-red-500', dot: 'bg-red-400' },
  courier_not_found: { label: 'Kurir Tidak Tersedia', color: 'text-red-500', dot: 'bg-red-400' },
  courierNotFound: { label: 'Kurir Tidak Tersedia', color: 'text-red-500', dot: 'bg-red-400' },
  disposed: { label: 'Disposal', color: 'text-gray-600', dot: 'bg-gray-500' },
  return_in_transit: { label: 'Dikembalikan ke Pengirim', color: 'text-orange-600', dot: 'bg-orange-500' },
  returnInTransit: { label: 'Dikembalikan ke Pengirim', color: 'text-orange-600', dot: 'bg-orange-500' },
};

// ── Order status badge ──
const ORDER_BADGE = {
  pending: { text: 'Menunggu Bayar', cls: 'bg-gray-100 text-gray-600' },
  paid: { text: 'Lunas', cls: 'bg-green-50 text-green-600' },
  processing: { text: 'Diproses', cls: 'bg-blue-50 text-blue-600' },
  shipping: { text: 'Dikirim', cls: 'bg-purple-50 text-purple-600' },
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-600' },
  cancelled: { text: 'Dibatalkan', cls: 'bg-red-50 text-red-500' },
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

const TrackOrderPage = () => {
  const { user } = useAuth();
  const { openCart } = useCartActions();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Fetch list orders milik user (filter: hanya trackable statuses) ──
  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const selectFields = `
        id, status, payment_status, total_amount, created_at,
        tracking_number, biteship_order_id, biteship_status,
        biteship_waybill_url, biteship_pickup_code,
        courier_code, courier_service, courier_duration,
        customer:customers!inner(email, name, phone),
        items:order_items(product_name_snapshot, variant_name_snapshot, quantity, unit_price_snapshot, subtotal)
      `;
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(selectFields)
        .eq('customer.email', user.email)
        .in('status', TRACKABLE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchErr) {
        // Fallback: client-side filter
        const { data: allData } = await supabase
          .from('orders')
          .select(selectFields)
          .order('created_at', { ascending: false })
          .limit(100);
        setOrders(
          (allData || []).filter(o =>
            o.customer?.email === user.email &&
            TRACKABLE_STATUSES.includes(o.status)
          )
        );
      } else {
        setOrders(data || []);
      }
    } catch (e) {
      console.error('[TrackOrder] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ⭐ Realtime subscription: auto-update list orders saat DB berubah
  // (Biteship webhook update orders.status → list di track order juga update)
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('track-order-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new;
          setOrders((prev) => {
            const existing = prev.find(o => o.id === updated.id);
            if (!existing) return prev;
            const patched = { ...existing, ...updated };
            return prev.map(o => o.id === updated.id ? patched : o);
          });

          // Kalau order yang sedang di-detail view berubah → update activeOrder
          if (activeOrder && activeOrder.id === updated.id) {
            setActiveOrder((prev) => prev ? { ...prev, ...updated } : prev);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        () => { fetchOrders(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeOrder]);

  // ── Klik order di list → buka detail view ──
  const handleOpenDetail = (order) => {
    setActiveOrder(order);
  };

  // ── Kembali ke list view ──
  const handleBackToList = () => {
    setActiveOrder(null);
    if (searchParams.get('order')) {
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
  };

  // ⭐ Auto-open detail dari query param ?order=<id>
  useEffect(() => {
    if (!orders.length || activeOrder) return;
    const orderId = searchParams.get('order');
    if (!orderId) return;
    const match = orders.find(o => o.id === orderId);
    if (match) {
      handleOpenDetail(match);
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, searchParams, activeOrder, setSearchParams]);

  // ── Login required ──
  if (!user) {
    return (
      <>
        <HeaderProducts onCartOpen={openCart} />
        <section className="max-w-2xl mx-auto px-4 md:px-6 py-16 text-center">
          <p className="text-gray-500 mb-4">Kamu perlu masuk dulu untuk melacak pesanan.</p>
          <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">
            Masuk ke akun
          </Link>
        </section>
        <Footer />
      </>
    );
  }

  // ========================================================================
  // DETAIL VIEW: hanya 1 order yang di-klik + ShippingInfoCard
  // ========================================================================
  if (activeOrder) {
    const order = activeOrder;
    const items = order.items || [];
    const badge = ORDER_BADGE[order.status] || { text: order.status, cls: 'bg-gray-100 text-gray-600' };

    return (
      <>
        <HeaderProducts onCartOpen={openCart} />

        <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
          {/* Header with back button */}
          <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
            <button
              onClick={handleBackToList}
              className="flex items-center gap-1.5 text-sm text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Kembali
            </button>
            <Link to="/orders" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
              ← Lihat Rincian Pesanan
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-eglux-primary mb-1">Lacak Pesanan</h1>
          <p className="text-sm text-gray-500 mb-6">Status pengiriman order #{shortId(order.id)}</p>

          {/* Order header card */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Order #{shortId(order.id)}</p>
                <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
              </div>
              <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${badge.cls}`}>
                {badge.text}
              </span>
            </div>

            {/* Items preview */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              {items.slice(0, 2).map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate">{item.product_name_snapshot}</p>
                    {item.variant_name_snapshot && <p className="text-gray-400 text-[0.65rem]">{item.variant_name_snapshot}</p>}
                  </div>
                  <span className="text-gray-500 ml-2 whitespace-nowrap">{item.quantity}x · {rupiah(item.subtotal)}</span>
                </div>
              ))}
              {items.length > 2 && <p className="text-[0.7rem] text-gray-400">+ {items.length - 2} produk lainnya</p>}
            </div>
          </div>

          {/* ⭐ Shipping info card dari DB (gratis, pakai biteship_waybill_url + biteship_status) */}
          <ShippingInfoCard order={order} />
        </div>

        <Footer />
      </>
    );
  }

  // ========================================================================
  // LIST VIEW: daftar orders (hanya trackable statuses)
  // ========================================================================
  return (
    <>
      <HeaderProducts onCartOpen={openCart} />

      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-eglux-primary">Lacak Pesanan</h1>
          <Link to="/orders" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            ← Lihat Rincian Pesanan
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">Pilih pesanan untuk melihat status pengiriman</p>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && orders.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">🚚</div>
            <p className="text-gray-700 font-medium mb-1">Belum ada pesanan untuk dilacak</p>
            <p className="text-sm text-gray-400 mb-5">
              Pesanan yang sudah dibayar akan muncul di sini
            </p>
            <Link to="/products" className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
              Mulai Belanja
            </Link>
          </div>
        )}

        {/* Orders list (clickable → detail view) */}
        {!loading && orders.length > 0 && (
          <div className="space-y-3">
            {orders.map((order) => {
              const badge = ORDER_BADGE[order.status] || { text: order.status, cls: 'bg-gray-100 text-gray-600' };
              const items = order.items || [];
              const previewItems = items.slice(0, 2);

              return (
                <button
                  key={order.id}
                  onClick={() => handleOpenDetail(order)}
                  className="w-full bg-white border border-gray-200 rounded-xl p-4 text-left hover:shadow-md hover:border-eglux-secondary/30 transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">#{shortId(order.id)}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(order.created_at)}</p>
                    </div>
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>

                  {/* Items preview */}
                  <div className="space-y-1 mb-3">
                    {previewItems.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <p className="text-gray-600 truncate flex-1">{item.product_name_snapshot}</p>
                        <span className="text-gray-400 ml-2">{item.quantity}x</span>
                      </div>
                    ))}
                    {items.length > 2 && (
                      <p className="text-[0.7rem] text-gray-400">+ {items.length - 2} produk lainnya</p>
                    )}
                  </div>

                  {/* Footer: total + courier + chevron */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className="min-w-0">
                      {order.courier_code && (
                        <p className="text-[0.7rem] text-gray-400 uppercase">
                          {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
                        </p>
                      )}
                      {order.tracking_number && (
                        <p className="text-[0.7rem] text-eglux-secondary font-mono truncate">Resi: {order.tracking_number}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-eglux-primary">{rupiah(order.total_amount)}</span>
                      <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </>
  );
};

// ============================================================================
// ShippingInfoCard — Info pengiriman dari DB (gratis, no Tracking API call)
// ============================================================================
// Pakai:
//   - biteship_status (raw Biteship status, snake_case)
//   - biteship_waybill_url (URL tracking Biteship, dari webhook courier_link)
//   - tracking_number (nomor resi kurir asli, dari courier_waybill_id)
//   - courier_code, courier_service, courier_duration
//
// Card ini SELALU tampil (selama order punya courier info), bahkan kalau
// Tracking API gak available/berbayar. User bisa klik link untuk lacak
// paket langsung di Biteship tracking page.
// ============================================================================
const ShippingInfoCard = ({ order }) => {
  const statusInfo = SHIPPING_STATUS_LABEL[order?.biteship_status] || {
    label: order?.biteship_status || 'Menunggu',
    color: 'text-gray-600',
    dot: 'bg-gray-400',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Info Pengiriman</p>

      {/* Current status banner */}
      <div className="flex items-center gap-3 bg-eglux-accent rounded-lg p-3">
        <div className={`w-3 h-3 rounded-full ${statusInfo.dot} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-eglux-primary">{statusInfo.label}</p>
          <p className="text-[0.7rem] text-gray-500">
            Status: <code className="font-mono">{order?.biteship_status || '—'}</code>
          </p>
        </div>
      </div>

      {/* Info grid */}
      <div className="space-y-2 text-xs">
        {order?.courier_code && (
          <div className="flex justify-between">
            <span className="text-gray-500">Kurir</span>
            <span className="font-medium text-gray-900 uppercase">
              {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
            </span>
          </div>
        )}
        {order?.courier_duration && (
          <div className="flex justify-between">
            <span className="text-gray-500">Estimasi</span>
            <span className="font-medium text-gray-900">{order.courier_duration}</span>
          </div>
        )}
        {order?.tracking_number && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-gray-500">No. Resi</span>
            <span className="font-mono font-medium text-eglux-secondary text-xs break-all">
              {order.tracking_number}
            </span>
          </div>
        )}
        {order?.biteship_pickup_code && (
          <div className="flex justify-between items-center gap-2">
            <span className="text-gray-500">Kode Pickup</span>
            <span className="font-mono font-medium text-gray-900">{order.biteship_pickup_code}</span>
          </div>
        )}
      </div>

      {/* Tracking link button (pakai biteship_waybill_url dari DB - gratis!) */}
      {order?.biteship_waybill_url ? (
        <a
          href={order.biteship_waybill_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity text-center no-underline mt-2 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Lacak Paket →
        </a>
      ) : (
        <p className="text-[0.7rem] text-gray-400 text-center pt-1">
          Link tracking akan tersedia setelah kurir confirmed pickup
        </p>
      )}
    </div>
  );
};

export default TrackOrderPage;
