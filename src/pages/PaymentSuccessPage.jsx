// src/pages/PaymentSuccessPage.jsx
// ============================================================================
// PaymentSuccessPage — ditampilkan setelah payment Midtrans sukses
// ============================================================================
// URL: /payment-success?order_id=xxx&status=settlement
// atau dari Snap callback onSuccess → navigate('/payment-success', { state: { orderId } })
// ============================================================================

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';

const PaymentSuccessPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const orderId = searchParams.get('order_id') || searchParams.get('order_id_ws') || '';
  const status = searchParams.get('transaction_status') || searchParams.get('status') || 'settlement';

  useEffect(() => {
    // Clear cart (payment sukses — cart gak perlu lagi)
    clearCart();

    // Fetch order details kalau ada order_id
    if (orderId) {
      fetchOrderDetails(orderId);
    } else {
      setLoading(false);
    }
  }, [orderId]);

  const fetchOrderDetails = async (id) => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, status, shipping_address, shipping_city, courier_name, courier_service')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        setOrder(data);
      }
    } catch (e) {
      console.warn('[PaymentSuccess] Failed to fetch order:', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const formatRupiah = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount || 0);
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%)' }}>
      <div className="bg-white rounded-[20px] max-w-[480px] w-full shadow-2xl overflow-hidden">
        {/* Header — success icon */}
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-[1.5rem] font-bold text-eglux-primary mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Pembayaran Berhasil!
          </h1>
          <p className="text-[0.85rem] text-gray-500">
            Terima kasih, pembayaran Anda telah kami terima.
            Pesanan sedang diproses dan akan dikirim segera.
          </p>
        </div>

        {/* Order details */}
        {loading ? (
          <div className="px-6 py-4 text-center">
            <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-[0.78rem] text-gray-500 mt-2">Memuat detail pesanan...</p>
          </div>
        ) : order ? (
          <div className="px-6 py-4 mx-6 mb-4 bg-eglux-accent rounded-xl">
            <div className="space-y-2 text-[0.82rem]">
              <div className="flex justify-between">
                <span className="text-gray-500">Nomor Pesanan</span>
                <span className="font-semibold text-eglux-primary">{order.order_number || order.id?.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Pembayaran</span>
                <span className="font-bold text-eglux-primary">{formatRupiah(order.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-semibold text-green-600 capitalize">{order.status || 'paid'}</span>
              </div>
              {order.courier_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Kurir</span>
                  <span className="font-medium text-eglux-primary">{order.courier_name} {order.courier_service || ''}</span>
                </div>
              )}
              {order.shipping_city && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Tujuan</span>
                  <span className="font-medium text-eglux-primary">{order.shipping_city}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 mx-6 mb-4 bg-eglux-accent rounded-xl text-center">
            <p className="text-[0.82rem] text-gray-500">
              {orderId ? `Order ID: ${orderId.slice(0, 8)}...` : 'Pesanan Anda sedang diproses'}
            </p>
          </div>
        )}

        {/* CTA buttons */}
        <div className="px-6 pb-8 space-y-3">
          <button
            onClick={() => navigate('/order-history')}
            className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90"
          >
            Lacak Pesanan
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-transparent text-eglux-primary border-[1.5px] border-eglux-primary rounded-xl text-[0.9rem] font-semibold cursor-pointer transition-all hover:bg-eglux-accent"
          >
            Kembali ke Beranda
          </button>
        </div>

        {/* Info */}
        <div className="px-6 pb-6 text-center">
          <p className="text-[0.72rem] text-gray-400">
            Konfirmasi pembayaran telah dikirim ke email dan WhatsApp Anda.
            Hubungi kami di WhatsApp jika ada pertanyaan.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
