// src/pages/PaymentFailedPage.jsx
// ============================================================================
// PaymentFailedPage — ditampilkan setelah payment Midtrans gagal/dibatalkan
// ============================================================================
// URL: /payment-failed?order_id=xxx&status=deny
// atau dari Snap callback onError → navigate('/payment-failed', { state: { orderId } })
// ============================================================================

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const PaymentFailedPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const orderId = searchParams.get('order_id') || '';
  const status = searchParams.get('transaction_status') || searchParams.get('status') || 'failed';

  useEffect(() => {
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
        .select('id, order_number, total_amount, status, payment_method')
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        setOrder(data);
      }
    } catch (e) {
      console.warn('[PaymentFailed] Failed to fetch order:', e?.message);
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

  // Determine failure reason based on status
  const getFailureReason = () => {
    switch (status) {
      case 'deny':
        return 'Pembayaran ditolak oleh bank/processor. Silakan coba metode pembayaran lain.';
      case 'expire':
        return 'Waktu pembayaran telah habis. Silakan bayar ulang sebelum waktu habis.';
      case 'cancel':
        return 'Pembayaran dibatalkan. Pesanan Anda tetap tersimpan dan bisa dibayar nanti.';
      case 'failure':
        return 'Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi.';
      default:
        return 'Pembayaran tidak berhasil. Jangan khawatir, pesanan Anda tetap tersimpan.';
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0e8 100%)' }}>
      <div className="bg-white rounded-[20px] max-w-[480px] w-full shadow-2xl overflow-hidden">
        {/* Header — error icon */}
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 className="text-[1.5rem] font-bold text-eglux-primary mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Pembayaran Gagal
          </h1>
          <p className="text-[0.85rem] text-gray-500 leading-relaxed">
            {getFailureReason()}
          </p>
        </div>

        {/* Order details (if available) */}
        {loading ? (
          <div className="px-6 py-4 text-center">
            <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin mx-auto" />
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
                <span className="text-gray-500">Status Pesanan</span>
                <span className="font-semibold text-amber-600">Menunggu Pembayaran</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Reassurance */}
        <div className="px-6 pb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-[0.75rem] text-amber-700">
              Pesanan Anda tetap tersimpan. Anda bisa membayar kembali kapan saja
              melalui menu <strong>Pesanan Saya</strong> sebelum waktu pembayaran habis (24 jam).
            </p>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="px-6 pb-8 space-y-3">
          {order && (
            <button
              onClick={() => navigate(`/orders?retry=${order.id}`)}
              className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90"
            >
              Bayar Ulang
            </button>
          )}
          <button
            onClick={() => navigate('/order-history')}
            className="w-full py-3 bg-transparent text-eglux-primary border-[1.5px] border-eglux-primary rounded-xl text-[0.9rem] font-semibold cursor-pointer transition-all hover:bg-eglux-accent"
          >
            Lihat Pesanan Saya
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-transparent text-gray-500 border-none rounded-xl text-[0.9rem] font-medium cursor-pointer transition-all hover:text-eglux-primary"
          >
            Kembali ke Beranda
          </button>
        </div>

        {/* Help */}
        <div className="px-6 pb-6 text-center border-t border-gray-100 pt-4">
          <p className="text-[0.72rem] text-gray-400">
            Butuh bantuan? Hubungi WhatsApp kami di
            <a href="https://wa.me/6285111752600" target="_blank" rel="noopener noreferrer"
              className="text-eglux-secondary font-semibold hover:underline ml-1">
              Eglux Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default PaymentFailedPage;
