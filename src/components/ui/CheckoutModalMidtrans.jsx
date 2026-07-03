// src/components/ui/CheckoutModalMidtrans.jsx
//
// Versi checkout yang berujung ke pembayaran Midtrans Snap (QRIS, transfer,
// e-wallet, dll), BUKAN redirect ke WhatsApp. Sengaja dibikin komponen
// terpisah dari CheckoutModal.jsx supaya alur WhatsApp yang lama tetap
// jalan apa adanya — dua tombol checkout bisa hidup berdampingan.
//
// Status akhir pembayaran (paid/failed/dll) disinkronkan ke database lewat
// webhook Midtrans + trigger `sync_order_payment_status`, BUKAN dari event
// onSuccess/onPending di sini. Event-event Snap di bawah cuma buat feedback
// UI instan ke customer.

import { useState, useEffect } from 'react';
import { useCart, rupiah } from '../../context/CartContext';
import { SHIPPING_OPTIONS } from '../../data/products';
import { supabase } from '../../lib/supabaseClient';
import { useMidtransSnap } from '../../hooks/useMidtransSnap';

const INITIAL_FORM = {
  name: '', phone: '', address: '', city: '',
  postal: '', shipping: SHIPPING_OPTIONS[0], notes: '',
};

const generateUUID = () => crypto.randomUUID();

const CheckoutModalMidtrans = ({ isOpen, onClose, showToast }) => {
  const { cart, totalPrice, clearCart } = useCart();
  const { snapReady, loadError } = useMidtransSnap();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null); // order yang udah tersimpan, dipakai ulang kalau retry

  // Reset form & orderId setiap modal ditutup, biar checkout berikutnya bersih dari awal
  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setOrderId(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // Sama persis dengan logic di CheckoutModal.jsx, cuma payment_method &
  // payment_status disesuaikan karena ini akan dibayar via Midtrans, bukan manual.
  const saveOrderToSupabase = async () => {
    const customerId = generateUUID();
    const { error: customerError } = await supabase
      .from('customers')
      .insert({ id: customerId, name: form.name, phone: form.phone, address: form.address });
    if (customerError) throw customerError;

    const newOrderId = generateUUID();
    const fullAddress = `${form.address}, ${form.city}${form.postal ? ' ' + form.postal : ''}`;
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: newOrderId,
        customer_id: customerId,
        status: 'pending',
        payment_method: 'qris',
        payment_status: 'unpaid',
        total_amount: totalPrice,
        shipping_address: fullAddress,
        notes: `Pengiriman: ${form.shipping}${form.notes ? ' | Catatan: ' + form.notes : ''}`,
      });
    if (orderError) throw orderError;

    const itemsPayload = cart.map((item) => ({
      order_id: newOrderId,
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      product_name_snapshot: item.name,
      variant_name_snapshot: item.variantName ?? null,
      unit_price_snapshot: item.price || 0,
      quantity: item.qty,
      subtotal: (item.price || 0) * item.qty,
    }));
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsPayload);
    if (itemsError) throw itemsError;

    return newOrderId;
  };

  const handlePay = async () => {
    if (cart.length === 0) { showToast('Keranjang masih kosong'); return; }
    if (!form.name || !form.phone || !form.address || !form.city) {
      showToast('Mohon lengkapi data wajib (*)');
      return;
    }
    if (!snapReady) {
      showToast('Sistem pembayaran belum siap, coba sesaat lagi.');
      return;
    }

    setSubmitting(true);
    try {
      // Order cuma dibuat SEKALI. Kalau customer sempet nutup popup Snap
      // lalu klik "Bayar Sekarang" lagi, orderId yang sudah ada dipakai ulang
      // (gak bikin order duplikat tiap retry).
      let currentOrderId = orderId;
      if (!currentOrderId) {
        currentOrderId = await saveOrderToSupabase();
        setOrderId(currentOrderId);
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        'create-midtrans-transaction',
        { body: { order_id: currentOrderId } }
      );

      if (fnError || !data?.token) {
        throw new Error(data?.error || fnError?.message || 'Gagal membuat transaksi pembayaran');
      }

      setSubmitting(false);

      window.snap.pay(data.token, {
        onSuccess: () => {
          clearCart();
          onClose();
          showToast('Pembayaran berhasil! Terima kasih ✓');
        },
        onPending: () => {
          // Relevan buat QRIS/transfer bank: belum tentu langsung lunas
          // saat popup ditutup. Order tetap tersimpan, status final dari webhook.
          clearCart();
          onClose();
          showToast('Menunggu pembayaran kamu, ya! Kami akan proses begitu terkonfirmasi.');
        },
        onError: () => {
          showToast('Pembayaran gagal. Coba metode lain atau ulangi.');
        },
        onClose: () => {
          // Customer nutup popup sebelum selesai — order TETAP pending,
          // bisa dilanjutkan dengan klik "Bayar Sekarang" lagi.
          showToast('Pembayaran belum selesai. Klik "Bayar Sekarang" lagi kalau mau lanjut.');
        },
      });
    } catch (err) {
      console.error('[Midtrans Checkout] Gagal:', err);
      showToast(`Gagal memproses pembayaran: ${err.message}`);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[2200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Form Pembayaran"
    >
      <div className="bg-white rounded-[20px] max-w-[480px] w-full max-h-[92vh] overflow-y-auto
                      transition-transform duration-300 translate-y-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h3 className="text-[1.1rem] font-bold text-eglux-primary">Bayar Sekarang</h3>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-full bg-black/[0.07] flex items-center justify-center
                       text-eglux-primary text-xl border-none cursor-pointer hover:bg-black/[0.13] transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="px-6 pb-6 pt-5">
          {/* Order Summary */}
          <div className="bg-eglux-accent rounded-xl p-4 mb-5 text-[0.85rem]">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] mb-2 font-semibold">
              Ringkasan Pesanan
            </h4>
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between mb-1 text-eglux-primary font-medium">
                <span className="flex-1 mr-2 truncate">
                  {item.name.slice(0, 38)}{item.name.length > 38 ? '…' : ''}
                  <br /><small className="text-[#666] font-normal">{item.variantName ?? '-'} × {item.qty}</small>
                </span>
                <span className="whitespace-nowrap">{item.price ? rupiah(item.price * item.qty) : '—'}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-[#ddd] mt-2 pt-2">
              <span className="font-bold text-eglux-primary text-[0.85rem]">Total</span>
              <span className="font-bold text-eglux-secondary text-[0.95rem]">
                {totalPrice > 0 ? rupiah(totalPrice) : '—'}
              </span>
            </div>
          </div>

          {/* Nama + Phone */}
          {[
            { label: 'Nama Lengkap *',    name: 'name',  type: 'text', placeholder: 'Masukkan nama lengkap' },
            { label: 'Nomor WhatsApp *',  name: 'phone', type: 'tel',  placeholder: '08xxxxxxxxxx' },
          ].map((f) => (
            <div key={f.name} className="mb-4">
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                {f.label}
              </label>
              <input
                type={f.type} name={f.name} value={form[f.name]}
                onChange={change} placeholder={f.placeholder}
                disabled={!!orderId}
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors
                           disabled:bg-[#f5f5f5] disabled:text-[#999]"
              />
            </div>
          ))}

          {/* Alamat */}
          <div className="mb-4">
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Alamat Lengkap *
            </label>
            <textarea
              name="address" value={form.address} onChange={change}
              placeholder="Jalan, nomor rumah, kelurahan, kecamatan..."
              disabled={!!orderId}
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none resize-y min-h-[70px]
                         focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
            />
          </div>

          {/* Kota + Kode Pos */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Kota / Kabupaten *
              </label>
              <input
                type="text" name="city" value={form.city} onChange={change} placeholder="Kota"
                disabled={!!orderId}
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary outline-none focus:border-eglux-secondary transition-colors
                           disabled:bg-[#f5f5f5] disabled:text-[#999]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Kode Pos
              </label>
              <input
                type="text" name="postal" value={form.postal} onChange={change} placeholder="12345"
                disabled={!!orderId}
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary outline-none focus:border-eglux-secondary transition-colors
                           disabled:bg-[#f5f5f5] disabled:text-[#999]"
              />
            </div>
          </div>

          {/* Pengiriman */}
          <div className="mb-4">
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Metode Pengiriman
            </label>
            <select
              name="shipping" value={form.shipping} onChange={change}
              disabled={!!orderId}
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors
                         disabled:bg-[#f5f5f5] disabled:text-[#999]"
            >
              {SHIPPING_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Catatan */}
          <div className="mb-5">
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Catatan (opsional)
            </label>
            <textarea
              name="notes" value={form.notes} onChange={change}
              placeholder="Warna, ukuran, atau permintaan khusus..."
              disabled={!!orderId}
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none resize-y min-h-[70px]
                         focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
            />
          </div>

          {orderId && (
            <p className="text-[0.75rem] text-[#9ca3af] text-center mb-3">
              Order tersimpan. Klik tombol di bawah buat lanjut bayar.
            </p>
          )}

          {loadError && (
            <p className="text-[0.8rem] text-red-500 text-center mb-3">{loadError}</p>
          )}

          {/* Submit */}
          <button
            onClick={handlePay}
            disabled={submitting || !snapReady}
            className="w-full py-4 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem]
                       font-bold cursor-pointer transition-all duration-300 hover:opacity-90
                       flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {!snapReady ? 'Memuat sistem pembayaran...' : submitting ? 'Memproses...' : 'Bayar Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModalMidtrans;