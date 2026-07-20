// src/pages/TrackOrderPage.jsx
// ============================================================================
// Lacak Pesanan — Shopee/Biteship style
// ============================================================================
// Behavior:
//   - Default view: list orders (hanya yang status 'processing' / 'shipping' /
//     'completed' — yaitu yang sudah dibayar, Biteship order sudah dibuat).
//     Pending (belum bayar) dan cancelled gak ditampilkan (gak ada tracking).
//   - Klik order → masuk DETAIL view: hanya 1 order itu yang tampil + Biteship
//     tracking detail (timeline, courier/driver, origin→destination).
//   - Tombol "← Kembali" di detail view untuk balik ke list.
//
// Deep link:
//   /track?order=<id> → auto-buka detail view untuk order tersebut
//   (dipakai dari OrdersList "Lacak Pesanan" button)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ⭐ Hanya order dengan status ini yang ditampilkan (sudah dibayar → punya tracking)
const TRACKABLE_STATUSES = ['processing', 'shipping', 'completed'];

// ── Biteship status labels (Indonesian) ──
const TRACKING_STATUS = {
  confirmed: { label: 'Pesanan Dikonfirmasi', color: 'text-blue-600', dot: 'bg-blue-500' },
  allocated: { label: 'Kurir Dialokasikan', color: 'text-blue-600', dot: 'bg-blue-500' },
  picking_up: { label: 'Kurir Menuju Lokasi', color: 'text-amber-600', dot: 'bg-amber-500' },
  picked: { label: 'Paket Diambil', color: 'text-amber-600', dot: 'bg-amber-500' },
  dropping_off: { label: 'Sedang Dikirim', color: 'text-purple-600', dot: 'bg-purple-500' },
  delivered: { label: 'Tiba di Tujuan', color: 'text-green-600', dot: 'bg-green-500' },
  cancelled: { label: 'Dibatalkan', color: 'text-red-500', dot: 'bg-red-400' },
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

  // ⭐ activeOrder: kalau ada → render DETAIL view (hanya 1 order ini)
  //   null → render LIST view
  const [activeOrder, setActiveOrder] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();

  // ── Fetch list orders milik user (filter: hanya trackable statuses) ──
  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const selectFields = `
        id, status, payment_status, total_amount, created_at,
        tracking_number, biteship_order_id, biteship_status,
        courier_code, courier_service,
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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const updated = payload.new;

          // Update list orders
          setOrders((prev) => {
            const existing = prev.find(o => o.id === updated.id);
            if (!existing) return prev;
            const patched = { ...existing, ...updated };
            return prev.map(o => o.id === updated.id ? patched : o);
          });

          // Kalau order yang sedang di-detail view berubah → refresh tracking
          if (activeOrder && activeOrder.id === updated.id) {
            setActiveOrder((prev) => prev ? { ...prev, ...updated } : prev);
            // Refetch tracking untuk dapat timeline terbaru dari Biteship
            fetchTracking(updated.id);
          }
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
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeOrder]);

  // ── Fetch Biteship tracking detail (dipanggil saat user klik 1 order) ──
  const fetchTracking = async (orderId) => {
    setTrackingLoading(true);
    setTrackingError(null);
    setTrackingData(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'get-biteship-tracking',
        { body: { order_id: orderId } }
      );

      if (invokeError) {
        throw new Error(invokeError.message || 'Gagal menghubungi server');
      }
      if (!data) {
        throw new Error('Response kosong dari server');
      }
      setTrackingData(data);
    } catch (e) {
      console.error('[TrackOrder] tracking error:', e);
      const msg = e.message?.includes('Failed to fetch') || e.message?.includes('CORS')
        ? 'Gagal terhubung ke server. Coba lagi beberapa saat.'
        : e.message;
      setTrackingError(msg);
    } finally {
      setTrackingLoading(false);
    }
  };

  // ── Klik order di list → buka detail view + fetch tracking ──
  const handleOpenDetail = (order) => {
    setActiveOrder(order);
    setTrackingData(null);
    setTrackingError(null);
    fetchTracking(order.id);
  };

  // ── Kembali ke list view ──
  const handleBackToList = () => {
    setActiveOrder(null);
    setTrackingData(null);
    setTrackingError(null);
    // Clean up URL query param
    if (searchParams.get('order')) {
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
  };

  // ⭐ Auto-open detail dari query param ?order=<id> (deep link dari OrdersPage)
  useEffect(() => {
    if (!orders.length || activeOrder) return;
    const orderId = searchParams.get('order');
    if (!orderId) return;
    const match = orders.find(o => o.id === orderId);
    if (match) {
      handleOpenDetail(match);
      // Clean up URL biar gak trigger lagi pas refresh
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
  // DETAIL VIEW: hanya 1 order yang di-klik + tracking detail
  // ========================================================================
  if (activeOrder) {
    const order = activeOrder;
    const items = order.items || [];
    const badge = ORDER_BADGE[order.status] || { text: order.status, cls: 'bg-gray-100 text-gray-600' };
    const tracking = trackingData?.tracking;
    const orderInfo = trackingData?.order;

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

          {/* Tracking detail */}
          {trackingLoading && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 flex justify-center">
              <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {trackingError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 text-center">
              ⚠ {trackingError}
              <button
                onClick={() => fetchTracking(order.id)}
                className="block mx-auto mt-3 px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 cursor-pointer border-none"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {trackingData && !tracking && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="text-sm text-amber-700">{trackingData.message || 'Tracking belum tersedia'}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Status Pesanan</span><span className="font-medium text-gray-700">{orderInfo?.status || order.status}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pembayaran</span><span className="font-medium text-gray-700">{orderInfo?.payment_status || order.payment_status}</span></div>
                {orderInfo?.courier_code && (
                  <div className="flex justify-between"><span className="text-gray-500">Kurir</span><span className="font-medium text-gray-700 uppercase">{orderInfo.courier_code} {orderInfo.courier_service || ''}</span></div>
                )}
                {orderInfo?.tracking_number && (
                  <div className="flex justify-between items-center gap-2"><span className="text-gray-500">No. Resi</span><span className="font-mono font-medium text-eglux-secondary">{orderInfo.tracking_number}</span></div>
                )}
              </div>
            </div>
          )}

          {tracking && (
            <TrackingDetail tracking={tracking} order={order} orderInfo={orderInfo} />
          )}
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
// TrackingDetail — render Biteship tracking info (timeline, courier, route)
// ============================================================================
const TrackingDetail = ({ tracking, order, orderInfo }) => {
  const history = tracking.history || [];
  const courier = tracking.courier || {};
  const origin = tracking.origin || {};
  const destination = tracking.destination || {};
  const currentStatus = TRACKING_STATUS[tracking.status] || {
    label: tracking.status, color: 'text-gray-600', dot: 'bg-gray-400',
  };

  return (
    <div className="space-y-4">
      {/* Current status banner */}
      <div className="flex items-center gap-3 bg-eglux-accent rounded-xl p-4">
        <div className={`w-3 h-3 rounded-full ${currentStatus.dot}`} />
        <div className="flex-1">
          <p className="text-sm font-bold text-eglux-primary">{currentStatus.label}</p>
          {tracking.waybill_id && (
            <p className="text-xs text-gray-500 font-mono">Resi: {tracking.waybill_id}</p>
          )}
        </div>
        {tracking.link && (
          <a
            href={tracking.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-eglux-secondary font-medium hover:underline"
          >
            Lacak di Kurir →
          </a>
        )}
      </div>

      {/* Courier / Driver info (Biteship style) */}
      {courier.company && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Info Kurir</p>
          <div className="flex items-center gap-3">
            {courier.driver_photo_url ? (
              <img src={courier.driver_photo_url} alt="Driver" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-eglux-accent flex items-center justify-center text-lg font-bold text-eglux-secondary uppercase">
                {courier.company.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900 uppercase">{courier.company}</p>
              {courier.driver_name && <p className="text-xs text-gray-500">{courier.driver_name}</p>}
              {courier.driver_plate_number && <p className="text-xs text-gray-400">Plat: {courier.driver_plate_number}</p>}
            </div>
            {courier.driver_phone && (
              <a
                href={`tel:${courier.driver_phone}`}
                className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center text-green-600 hover:bg-green-100"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Origin → Destination */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <div className="w-3 h-3 rounded-full bg-gray-300 border-2 border-white shadow" />
            <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]" />
          </div>
          <div className="flex-1 pb-2">
            <p className="text-[0.65rem] text-gray-400 uppercase tracking-wide">Pengirim</p>
            <p className="text-xs font-medium text-gray-700">{origin.contact_name || 'EGLUX'}</p>
            <p className="text-xs text-gray-400">{origin.address || 'Gudang EGLUX'}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <div className="w-3 h-3 rounded-full bg-eglux-secondary border-2 border-white shadow" />
          </div>
          <div className="flex-1">
            <p className="text-[0.65rem] text-gray-400 uppercase tracking-wide">Penerima</p>
            <p className="text-xs font-medium text-gray-700">
              {destination.contact_name || orderInfo?.customer?.name || order?.customer?.name || '—'}
            </p>
            <p className="text-xs text-gray-400">
              {destination.address || orderInfo?.shipping_address || '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Tracking History Timeline (Biteship dashboard style) */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Riwayat Pengiriman</p>
        {history.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">Belum ada riwayat pengiriman</p>
        ) : (
          <div className="space-y-0">
            {history.slice().reverse().map((event, idx) => {
              const statusInfo = TRACKING_STATUS[event.status] || {
                label: event.status, color: 'text-gray-600', dot: 'bg-gray-400',
              };
              const isLast = idx === history.length - 1;
              return (
                <div key={idx} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${isLast ? statusInfo.dot : 'bg-gray-300'} ${isLast ? 'ring-4 ring-eglux-secondary/20' : ''} flex-shrink-0 mt-1`} />
                    {!isLast && <div className="w-0.5 flex-1 bg-gray-200 min-h-[32px]" />}
                  </div>
                  <div className={`flex-1 ${isLast ? '' : 'pb-4'}`}>
                    <p className={`text-xs font-semibold ${isLast ? statusInfo.color : 'text-gray-600'}`}>
                      {statusInfo.label}
                    </p>
                    {event.note && (
                      <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{event.note}</p>
                    )}
                    <p className="text-[0.65rem] text-gray-300 mt-1">{formatDateTime(event.updated_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackOrderPage;
