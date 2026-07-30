// src/pages/TrackOrderPage.jsx
// ============================================================================
// Lacak Pesanan — List orders yang punya biteship_waybill_url di DB
// ============================================================================
// Behavior:
//   - Hanya tampilkan orders yang:
//     a) Punya biteship_waybill_url (Biteship webhook sudah fire courier_link)
//     b) Status BUKAN delivered/cancelled/expired (mereka pindah ke Riwayat)
//     c) ⭐ MILIK USER YANG LOGIN — filter via customer_id IN (user's customer_ids)
//   - Setiap card = rincian pesanan + tombol "Lacak Paket" → buka tab baru ke Biteship
//   - Klik card → expand rincian (items, alamat, kurir, resi)
//   - Auto-refresh via Realtime subscription (saat Biteship webhook update DB)
//
// Status flow:
//   - paid → processing → shipped → delivered (auto pindah ke Riwayat)
//   - cancelled → auto pindah ke Riwayat
//
// Deep link:
//   /track?order=<id> → auto-expand card untuk order tersebut
//
// ⭐ SECURITY FIX: sebelumnya fetchOrders gak filter by user → user bisa lihat
//   pesanan orang lain. Sekarang:
//   1. fetchCustomerIds() — ambil customer_ids milik user dari customers table
//   2. fetchOrders() — filter orders by customer_id IN (ids)
//   3. Realtime subscription — filter by customer_id IN (ids) + defensive check
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';
import { friendlyErrorMessage } from '../lib/errorMessage';

import '/src/assets/styles/orderpage.css'

// ⭐ Hanya orders dengan status ini yang ditampilkan di /track
// (delivered + cancelled pindah ke /order-history)
// ⭐ Backward compat: include 'shipping' dan 'completed' untuk data lama (sebelum SQL 032e)
const TRACKABLE_STATUSES = ['processing', 'shipped', 'paid', 'shipping', 'completed'];

// ── Biteship status labels (Indonesian) ──
const SHIPPING_STATUS_LABEL = {
  confirmed: { label: 'Pesanan Dikonfirmasi', color: 'text-blue-600', dot: 'bg-blue-500' },
  allocated: { label: 'Kurir Dialokasikan', color: 'text-blue-600', dot: 'bg-blue-500' },
  picking_up: { label: 'Kurir Menuju Lokasi', color: 'text-amber-600', dot: 'bg-amber-500' },
  pickingUp: { label: 'Kurir Menuju Lokasi', color: 'text-amber-600', dot: 'bg-amber-500' },
  picked: { label: 'Paket Diambil', color: 'text-amber-600', dot: 'bg-amber-500' },
  in_transit: { label: 'Dalam Perjalanan', color: 'text-purple-600', dot: 'bg-purple-500' },
  inTransit: { label: 'Dalam Perjalanan', color: 'text-purple-600', dot: 'bg-purple-500' },
  dropping_off: { label: 'Menuju Penerima', color: 'text-purple-600', dot: 'bg-purple-500' },
  droppingOff: { label: 'Menuju Penerima', color: 'text-purple-600', dot: 'bg-purple-500' },
  on_hold: { label: 'Ditahan', color: 'text-gray-600', dot: 'bg-gray-500' },
  onHold: { label: 'Ditahan', color: 'text-gray-600', dot: 'bg-gray-500' },
  delivered: { label: 'Tiba di Tujuan', color: 'text-green-600', dot: 'bg-green-500' },
  processing: { label: 'Sedang Diproses', color: 'text-blue-600', dot: 'bg-blue-500' },
  shipping: { label: 'Sedang Dikirim', color: 'text-purple-600', dot: 'bg-purple-500' },
  cancelled: { label: 'Dibatalkan', color: 'text-red-600', dot: 'bg-red-500' },
};

// ── EGLUX status badge ──
// ⭐ Backward compat: include 'shipping' dan 'completed' untuk data lama
const ORDER_BADGE = {
  processing: { text: 'Diproses', cls: 'bg-blue-50 text-blue-600' },
  shipped: { text: 'Dikirim', cls: 'bg-purple-50 text-purple-600' },
  shipping: { text: 'Dikirim', cls: 'bg-purple-50 text-purple-600' }, // legacy
  paid: { text: 'Dibayar', cls: 'bg-green-50 text-green-600' },
  delivered: { text: 'Selesai', cls: 'bg-green-50 text-green-600' },
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-600' }, // legacy
  cancelled: { text: 'Dibatalkan', cls: 'bg-red-50 text-red-600' },
};

// ── Helpers ──
function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Jakarta',
    }).format(d) + ' WIB';
  } catch { return iso; }
}

function getProductImage(item) {
  const imgs = item?.product?.product_images || [];
  if (!imgs.length) return null;
  if (item.variant_id) {
    const variantImg = imgs.find(img => img.variant_id === item.variant_id);
    if (variantImg?.url) return variantImg.url;
  }
  const nonVariant = imgs.filter(img => !img.variant_id);
  const primary = nonVariant.find(img => img.is_primary) || nonVariant[0];
  return primary?.url || imgs[0]?.url || null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const TrackOrderPage = () => {
  const { user } = useAuth();
  const { openCart } = useCartActions();
  const [searchParams, setSearchParams] = useSearchParams();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);

    // ⭐ SECURITY: customer_ids milik user — dipakai untuk filter orders supaya
    // user gak bisa lihat pesanan orang lain. Di-fetch dari customers table
    // (customers.user_id di-set oleh create-order edge function + SQL 025 backfill).
    const [customerIds, setCustomerIds] = useState([]);

  // ── Fetch user's customer_ids ──
  // Bulletproof ownership check — gak tergantung RLS di orders table.
  // Customers table punya user_id yang di-backfill, jadi kita bisa query langsung.
  const fetchCustomerIds = useCallback(async () => {
    if (!user) return [];
    try {
      const { data, error: custErr } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id);
      if (custErr) throw custErr;
      const ids = (data || []).map(c => c.id);
      setCustomerIds(ids);
      return ids;
    } catch (e) {
      console.error('[TrackOrder] fetch customer_ids error:', e?.message);
      setCustomerIds([]);
      return [];
    }
  }, [user]);

  // ── Fetch orders yang punya biteship_waybill_url + status trackable ──
  // ⭐ SECURITY: HANYA orders milik user yang di-fetch.
  // Filter via customer_id IN (user's customer_ids) — bukan rely on RLS saja.
  const fetchOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // ⭐ Step 1: fetch user's customer_ids dulu (bulletproof ownership check)
      const ids = await fetchCustomerIds();
      if (ids.length === 0) {
        // User belum punya customer record → gak punya orders
        setOrders([]);
        return;
      }

      const selectFields = `
        id, status, payment_status, total_amount, subtotal, shipping_cost,
        courier_code, courier_service, courier_duration, courier_rate,
        shipping_address, shipping_city, shipping_postal_code,
        shipping_area_id, shipping_area_name,
        biteship_order_id, biteship_status, biteship_waybill_url, biteship_pickup_code,
        tracking_number,
        created_at, updated_at, notes,
        customer_id,
        order_items (
          id, product_id, variant_id, product_name_snapshot, variant_name_snapshot,
          unit_price_snapshot, quantity, subtotal, weight_gram,
          product:products (
            id, name,
            product_images ( id, url, is_primary, variant_id )
          )
        )
      `;

      // ⭐ Step 2: query orders dengan filter customer_id IN (user's ids)
      // + biteship_waybill_url IS NOT NULL + status trackable
      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(selectFields)
        .filter('biteship_waybill_url', 'not.is', 'null')
        .in('status', TRACKABLE_STATUSES)
        .in('customer_id', ids)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchErr) {
        console.warn('[TrackOrder] Query failed:', fetchErr.message);
        throw fetchErr;
      }

      // ⭐ Defense-in-depth: client-side filter — pastikan hanya order milik user
      // yang masuk (kalau DB aneh / RLS broken, tetap aman)
      const validOrders = (data || []).filter(o =>
        o.biteship_waybill_url &&
        o.biteship_waybill_url.trim() !== '' &&
        o.biteship_waybill_url !== 'null' &&
        ids.includes(o.customer_id)
      );

      setOrders(validOrders);
    } catch (e) {
      console.error('[TrackOrder] fetch error:', e?.message);
      setError(friendlyErrorMessage(e, 'Memuat pesanan untuk dilacak'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Realtime: auto-refresh saat DB berubah (Biteship webhook update) ──
  // ⭐ SECURITY: filter subscription by customer_id IN (user's ids) supaya
  // user gak receive events untuk orders orang lain.
  useEffect(() => {
    if (!user || customerIds.length === 0) return;

    // ⭐ Format filter untuk IN clause: customer_id=in.(uuid1,uuid2,...)
    // Supabase realtime pakai PostgREST filter syntax.
    const customerFilter = `customer_id=in.(${customerIds.join(',')})`;

    const channel = supabase
      .channel('track-order-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updated = payload.new;

          // ⭐ Defense-in-depth: skip kalau customer_id gak match (rare, tapi just in case)
          if (!customerIds.includes(updated.customer_id)) return;

          setOrders((prev) => {
            const existing = prev.find(o => o.id === updated.id);
            if (!existing) {
              // Order baru milik user yang masuk trackable range — refetch
              fetchOrders();
              return prev;
            }
            // Patch order yang sudah ada
            const patched = { ...existing, ...updated };
            // Kalau status berubah ke delivered/cancelled → remove dari list (pindah ke Riwayat)
            if (updated.status === 'delivered' || updated.status === 'cancelled' || updated.status === 'expired') {
              return prev.filter(o => o.id !== updated.id);
            }
            // Kalau biteship_waybill_url dihapus (rare) → remove
            if (!updated.biteship_waybill_url) {
              return prev.filter(o => o.id !== updated.id);
            }
            return prev.map(o => o.id === updated.id ? patched : o);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Auto-expand dari query param ?order=<id> ──
  useEffect(() => {
    if (!orders.length) return;
    const orderId = searchParams.get('order');
    if (!orderId) return;
    const match = orders.find(o => o.id === orderId);
    if (match) {
      setExpandedOrderId(match.id);
      searchParams.delete('order');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, searchParams]);

  const handleToggleExpand = (orderId) => {
    setExpandedOrderId(prev => prev === orderId ? null : orderId);
  };

    // ── Login required ──
  {/* Import CSS ini sekali di file terkait, atau taruh isinya di globals.css:
import '../assets/styles/track-layout.css'; */}
  if (!user) {
    return (

<div className="section-full-mobile w-full">
  {/* Wrapper ini yang bikin behavior beda mobile vs desktop.
      Mobile: dikunci 100dvh (Header+Section = 1 layar penuh, Footer discroll).
      Desktop: jadi display:contents (transparan), Header+Section+Footer
      sejajar langsung di dalam .section-full-mobile yang 100dvh. */}
  <div className="mobile-viewport-group">
    {/* ⭐ forceScrolled — header selalu putih (gak ada hero section di page ini) */}
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

      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-eglux-primary">Lacak Pesanan</h1>
          <Link to="/orders" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            ← Lihat Semua Pesanan
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Pesanan yang sedang dalam pengiriman. Klik untuk lihat rincian.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={fetchOrders}
              className="mt-2 text-xs text-red-700 font-semibold hover:underline"
            >
              Coba lagi
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && orders.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">🚚</div>
            <p className="text-gray-700 font-medium mb-1">Belum ada pesanan untuk dilacak</p>
            <p className="text-sm text-gray-400 mb-5">
              Pesanan yang sudah dibayar dan dikirim akan muncul di sini.
              Pesanan yang sudah sampai tujuan pindah ke Riwayat Order.
            </p>
            <Link to="/orders" className="inline-block px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
              Lihat Pesanan Saya
            </Link>
          </div>
        )}

        {/* Orders list — setiap card = rincian + tombol Lacak Paket */}
        {!loading && !error && orders.length > 0 && (
          <div className="space-y-4">
            {orders.map((order) => {
              const isExpanded = expandedOrderId === order.id;
              const items = order.order_items || [];
              const badge = ORDER_BADGE[order.status] || { text: order.status, cls: 'bg-gray-100 text-gray-600' };
              const statusInfo = SHIPPING_STATUS_LABEL[order.biteship_status] || {
                label: order.biteship_status || 'Menunggu',
                color: 'text-gray-600',
                dot: 'bg-gray-400',
              };

              return (
                <div
                  key={order.id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* ── Card header (clickable → expand) ── */}
                  {/* ⭐ Pakai div role="button" (bukan <button>) supaya pasti clickable —
                      avoid potential conflict dengan global button CSS / form submit behavior */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleToggleExpand(order.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggleExpand(order.id);
                      }
                    }}
                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors outline-none focus:bg-gray-50"
                    style={{ cursor: 'pointer' }}
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">Order #{shortId(order.id)}</p>
                        <p className="text-xs text-gray-400">{formatDateTime(order.updated_at || order.created_at)}</p>
                      </div>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[0.7rem] font-semibold ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>

                    {/* Items preview (always visible) */}
                    <div className="space-y-1 mb-3">
                      {items.slice(0, 2).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <p className="text-gray-600 truncate flex-1">{item.product_name_snapshot}</p>
                          <span className="text-gray-400 ml-2">{item.quantity}x</span>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <p className="text-[0.7rem] text-gray-400">+ {items.length - 2} produk lainnya</p>
                      )}
                    </div>

                    {/* Expand hint — button-style supaya jelas clickable */}
                    <div className="flex items-center justify-center gap-1.5 text-xs text-eglux-secondary font-semibold mt-2 pt-2 border-t border-gray-100 bg-eglux-accent/30 rounded-lg py-2 -mx-1">
                      <span>{isExpanded ? 'Sembunyikan rincian' : 'Lihat rincian pesanan'}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>

                  {/* ── Lacak Paket button (always visible — direct ke Biteship) ── */}
                  <div className="px-4 pb-3">
                    <a
                      href={order.biteship_waybill_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-4 py-2.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none no-underline flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Lacak Pesanan
                    </a>
                  </div>

                  {/* ── Expanded rincian (collapsible) ── */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                      {/* Status pengiriman */}
                      <div className="bg-eglux-accent rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${statusInfo.dot} flex-shrink-0 animate-pulse`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-eglux-primary">{statusInfo.label}</p>
                            <p className="text-[0.7rem] text-gray-500">
                              Status: <code className="font-mono">{order.biteship_status || '—'}</code>
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Info kurir + resi */}
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {order.courier_code && (
                          <div>
                            <p className="text-gray-500">Kurir</p>
                            <p className="font-medium text-gray-900 uppercase">
                              {order.courier_code}{order.courier_service ? ` · ${order.courier_service}` : ''}
                            </p>
                          </div>
                        )}
                        {order.courier_duration && (
                          <div>
                            <p className="text-gray-500">Estimasi</p>
                            <p className="font-medium text-gray-900">{order.courier_duration}</p>
                          </div>
                        )}
                        {order.tracking_number && (
                          <div className="col-span-2">
                            <p className="text-gray-500">No. Resi</p>
                            <p className="font-mono font-medium text-eglux-secondary text-xs break-all">{order.tracking_number}</p>
                          </div>
                        )}
                        {order.biteship_pickup_code && (
                          <div className="col-span-2">
                            <p className="text-gray-500">Kode Pickup</p>
                            <p className="font-mono font-medium text-gray-900">{order.biteship_pickup_code}</p>
                          </div>
                        )}
                      </div>

                      {/* Items detail */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Detail Pesanan</p>
                        <div className="space-y-2">
                          {items.map((item, idx) => {
                            const img = getProductImage(item);
                            return (
                              <div key={idx} className="flex gap-3 items-start">
                                {img && (
                                  <img src={img} alt={item.product_name_snapshot} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900">{item.product_name_snapshot}</p>
                                  {item.variant_name_snapshot && (
                                    <p className="text-[0.7rem] text-gray-500">{item.variant_name_snapshot}</p>
                                  )}
                                  <p className="text-[0.7rem] text-gray-400 mt-0.5">
                                    {item.quantity}x · {rupiah(item.subtotal)}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Alamat pengiriman */}
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Alamat Pengiriman</p>
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{order.shipping_address || '—'}</p>
                        <p className="text-[0.7rem] text-gray-500 mt-1">
                          {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(', ')}
                        </p>
                      </div>

                      {/* Rincian pembayaran */}
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subtotal</span>
                          <span className="font-medium text-gray-900">{rupiah(order.subtotal)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Ongkir</span>
                          <span className="font-medium text-gray-900">{rupiah(order.shipping_cost)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-200">
                          <span className="font-semibold text-gray-700">Total</span>
                          <span className="font-bold text-eglux-secondary">{rupiah(order.total_amount)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </>
  );
};

export default TrackOrderPage;
