// src/components/ui/CheckoutModal.jsx
// Modal form order — simpan ke Supabase, lalu kirim ringkasan ke WhatsApp.
import { useState } from 'react';
import { useCart, rupiah } from '../../context/CartContext';
import { WA_NUMBER, SHIPPING_OPTIONS } from '../../data/products';
import { supabase } from '../../lib/supabaseClient';

const INITIAL_FORM = {
  name: '', phone: '', address: '', city: '',
  postal: '', shipping: SHIPPING_OPTIONS[0], notes: '',
};

const generateUUID = () => crypto.randomUUID();

const CheckoutModal = ({ isOpen, onClose, showToast }) => {
  const { cart, totalPrice, clearCart } = useCart();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const change = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const saveOrderToSupabase = async () => {
    // 1. Upsert customer — insert kalau nomor HP baru, update kalau sudah ada.
    //    ID di-generate di client supaya tidak perlu .select() balik (no public select policy).
    const customerId = generateUUID();
    const { error: customerError } = await supabase
      .from('customers')
      .insert({ id: customerId, name: form.name, phone: form.phone, address: form.address });
    if (customerError) throw customerError;

    // 2. Insert order baru dengan ID yang kita generate sendiri.
    const orderId = generateUUID();
    const fullAddress = `${form.address}, ${form.city}${form.postal ? ' ' + form.postal : ''}`;
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customer_id: customerId,
        status: 'pending',
        payment_method: 'whatsapp_manual',
        payment_status: 'unpaid',
        total_amount: totalPrice,
        shipping_address: fullAddress,
        notes: `Pengiriman: ${form.shipping}${form.notes ? ' | Catatan: ' + form.notes : ''}`,
      });
    if (orderError) throw orderError;

    // 3. Insert semua item cart sebagai order_items dengan snapshot nama & harga.
    const itemsPayload = cart.map((item) => ({
      order_id: orderId,
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

    return orderId;
  };

  const handleSubmit = async () => {
    if (cart.length === 0) { showToast('Keranjang masih kosong'); return; }
    if (!form.name || !form.phone || !form.address || !form.city) {
      showToast('Mohon lengkapi data wajib (*)');
      return;
    }

    setSubmitting(true);
    try {
      await saveOrderToSupabase();
    } catch (err) {
      console.error('[Supabase] Gagal menyimpan order:', err);
      showToast(`Gagal menyimpan order: ${err.message}`);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    // Buka WhatsApp hanya kalau Supabase berhasil.
    let msg = `*ORDER BARU - EGLUX*\n\n`;
    msg += `*Data Pembeli:*\n`;
    msg += `Nama: ${form.name}\n`;
    msg += `No. WA: ${form.phone}\n`;
    msg += `Alamat: ${form.address}\n`;
    msg += `Kota: ${form.city}${form.postal ? ' ' + form.postal : ''}\n`;
    msg += `Pengiriman: ${form.shipping}\n\n`;
    msg += `*Detail Pesanan:*\n`;
    cart.forEach((item, i) => {
      const sub = item.price ? ` = ${rupiah(item.price * item.qty)}` : '';
      msg += `${i + 1}. ${item.name}\n   Varian: ${item.variantName ?? '-'} | Qty: ${item.qty}${item.price ? ' | @' + rupiah(item.price) : ''}${sub}\n`;
    });
    if (totalPrice > 0) msg += `\n*Total Belanja: ${rupiah(totalPrice)}*`;
    if (form.notes) msg += `\n\nCatatan: ${form.notes}`;
    msg += `\n\n_Mohon konfirmasi stok & estimasi pengiriman. Terima kasih! 🙏_`;

    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    clearCart();
    setForm(INITIAL_FORM);
    onClose();
    showToast('Order berhasil disimpan & dikirim ke WhatsApp! ✓');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[2200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Form Order"
    >
      <div className="bg-white rounded-[20px] max-w-[480px] w-full max-h-[92vh] overflow-y-auto
                      transition-transform duration-300 translate-y-0">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-0">
          <h3 className="text-[1.1rem] font-bold text-eglux-primary">Form Order</h3>
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
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
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
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none resize-y min-h-[70px]
                         focus:border-eglux-secondary transition-colors"
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
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary outline-none focus:border-eglux-secondary transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Kode Pos
              </label>
              <input
                type="text" name="postal" value={form.postal} onChange={change} placeholder="12345"
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                           text-eglux-primary outline-none focus:border-eglux-secondary transition-colors"
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
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
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
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem]
                         text-eglux-primary bg-white outline-none resize-y min-h-[70px]
                         focus:border-eglux-secondary transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-4 bg-[#25D366] text-white border-none rounded-xl text-[0.95rem]
                       font-bold cursor-pointer transition-all duration-300 hover:bg-[#128C7E]
                       flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {submitting ? 'Menyimpan order...' : 'Submit Order via WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModal;