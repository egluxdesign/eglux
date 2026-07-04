// src/components/ui/CheckoutModalMidtrans.jsx
// ============================================================================
// EGLUX Checkout — Midtrans Snap (payment) + Biteship (shipping aggregator)
//
// Form fields 1:1 dengan requirement Midtrans customer_details + Biteship rates:
//   - name, email (opsional), phone → customer_details
//   - address, city, postal_code → billing_address + shipping_address
//   - postal_code → Biteship /v1/areas_by_postal_code → destination_area_id
//   - destination_area_id + cart items → Biteship /v1/rates/calculate → kurir list
//   - selected kurir → shipping_cost → masuk ke gross_amount Midtrans
//
// Database: kolom terstruktur (shipping_cost, courier_code, dst.) — bukan di notes.
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCart, rupiah } from '../../context/CartContext';
import { supabase } from '../../lib/supabaseClient';
import { useMidtransSnap } from '../../hooks/useMidtransSnap';
import { Truck, Loader2, MapPin, User, Package, ShieldCheck } from 'lucide-react';

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  postal: '',
  notes: '',
};

const generateUUID = () => crypto.randomUUID();
const isPhoneValid = (p) => /^0?8\d{8,12}$/.test((p || '').replace(/\D/g, ''));
const isEmailValid = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const CheckoutModalMidtrans = ({ isOpen, onClose, showToast }) => {
  const { cart, totalPrice, clearCart } = useCart();
  const { snapReady, loadError } = useMidtransSnap();

  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null);

  // Biteship: area lookup (by postal code)
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState('');

  // Biteship: shipping rates
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedShipping, setSelectedShipping] = useState(null);

  const postalDebounceRef = useRef(null);

  // Reset semua state saat modal ditutup
  useEffect(() => {
    if (!isOpen) {
      setForm(INITIAL_FORM);
      setOrderId(null);
      setSubmitting(false);
      setAreas([]);
      setSelectedAreaId('');
      setShippingOptions([]);
      setSelectedShipping(null);
    }
  }, [isOpen]);

  const change = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    // Reset downstream kalau user ubah kode pos
    if (name === 'postal') {
      setAreas([]);
      setSelectedAreaId('');
      setShippingOptions([]);
      setSelectedShipping(null);
    }
  };

  // ===== Biteship area lookup (debounced 500ms) =====
  const lookupAreas = useCallback(
    async (postal) => {
      if (!/^\d{5}$/.test(postal)) return;
      setAreasLoading(true);
      setAreas([]);
      setSelectedAreaId('');
      setShippingOptions([]);
      setSelectedShipping(null);

      try {
        // supabase-js v2 functions.invoke TIDAK support method:GET + query param.
        // Pakai fetch langsung dengan anon key di header Authorization.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const resp = await fetch(
          `${supabaseUrl}/functions/v1/search-biteship-areas?postal_code=${encodeURIComponent(postal)}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${anonKey}`,
              apikey: anonKey,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await resp.json();
        if (!resp.ok || data.error) {
          throw new Error(
            data.error?.message || data.error || `HTTP ${resp.status}`
          );
        }

        setAreas(data.areas || []);
        // Auto-select kalau cuma 1 area match
        if (data.areas?.length === 1) {
          setSelectedAreaId(String(data.areas[0].id));
        }

        // Show "tidak ditemukan" jika 0 results
        if (resp.ok && (!data.areas || data.areas.length === 0)) {
          showToast(`Kode pos ${postal} tidak ditemukan di Biteship.`);
        }
      } catch (err) {
        let msg = err.message;
        try {
          const p = JSON.parse(err.message);
          msg = p.error || p.msg || msg;
        } catch {
          /* not JSON */
        }
        showToast(`Gagal cari area: ${msg}`);
      } finally {
        setAreasLoading(false);
      }
    },
    [showToast]
  );

  const onPostalChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 5);
    setForm((f) => ({ ...f, postal: val }));

    if (postalDebounceRef.current) clearTimeout(postalDebounceRef.current);
    if (val.length === 5) {
      postalDebounceRef.current = setTimeout(() => lookupAreas(val), 500);
    } else {
      setAreas([]);
      setSelectedAreaId('');
    }
  };

  // ===== Auto-fetch rates begitu area dipilih =====
  const fetchRates = useCallback(
    async (areaId) => {
      // Per Biteship docs: destination_area_id is STRING. Keep as string, no Number() conversion.
      const areaIdStr = areaId != null ? String(areaId).trim() : '';
      if (!areaIdStr) {
        console.error('[fetchRates] Empty areaId:', areaId);
        showToast('Area ID tidak valid, coba pilih ulang area tujuan.');
        return;
      }
      if (cart.length === 0) return;

      setShippingLoading(true);
      setShippingOptions([]);
      setSelectedShipping(null);

      try {
        // Pakai fetch native (konsisten dengan search-biteship-areas Task 1-f)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const payload = {
          destination_area_id: areaIdStr,  // ← STRING per Biteship docs
          items: cart.map((item) => ({
            product_id: item.productId,
            name: item.name,
            price: item.price || 0,
            qty: item.qty,
            weight_in_gram: item.weight_gram || 500,
          })),
        };

        console.log('[fetchRates] Sending to check-biteship-rates:', {
          destination_area_id: payload.destination_area_id,
          type: typeof payload.destination_area_id,
          items_count: payload.items.length,
        });

        const resp = await fetch(`${supabaseUrl}/functions/v1/check-biteship-rates`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await resp.json();
        if (!resp.ok || data.error) {
          throw new Error(
            data.error?.message || data.error || `HTTP ${resp.status}`
          );
        }

        setShippingOptions(data.pricing || []);
        if (!data.pricing?.length) showToast('Tidak ada kurir tersedia untuk area ini.');
      } catch (err) {
        let msg = err.message;
        try {
          const p = JSON.parse(err.message);
          msg = p.error || p.msg || msg;
        } catch {
          /* not JSON */
        }
        showToast(`Error ongkir: ${msg}`);
      } finally {
        setShippingLoading(false);
      }
    },
    [cart, showToast]
  );

  useEffect(() => {
    if (selectedAreaId) fetchRates(selectedAreaId);
  }, [selectedAreaId, fetchRates]);

  // ===== Validation =====
  const validate = () => {
    if (cart.length === 0) return showToast('Keranjang masih kosong'), false;
    if (!form.name.trim()) return showToast('Nama lengkap wajib diisi'), false;
    if (!form.phone.trim() || !isPhoneValid(form.phone))
      return showToast('Format WhatsApp tidak valid (contoh: 08123456789)'), false;
    if (!isEmailValid(form.email)) return showToast('Format email tidak valid'), false;
    if (!form.address.trim()) return showToast('Alamat lengkap wajib diisi'), false;
    if (!form.city.trim()) return showToast('Kota wajib diisi'), false;
    if (!/^\d{5}$/.test(form.postal)) return showToast('Kode pos harus 5 digit'), false;
    if (!selectedAreaId) return showToast('Pilih area tujuan dari hasil pencarian kode pos'), false;
    if (!selectedShipping) return showToast('Pilih kurir terlebih dahulu'), false;
    if (!snapReady) return showToast('Sistem pembayaran belum siap, coba sesaat lagi'), false;
    return true;
  };

  // ===== Persist order ke Supabase =====
  const saveOrderToSupabase = async () => {
    const customerId = generateUUID();
    const { error: customerError } = await supabase.from('customers').insert({
      id: customerId,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      address: form.address.trim(),
    });
    if (customerError) throw customerError;

    const newOrderId = generateUUID();
    const shippingCost = selectedShipping?.price || 0;
    const grandTotal = totalPrice + shippingCost;
    const selectedArea = areas.find((a) => String(a.id) === String(selectedAreaId));

    const { error: orderError } = await supabase.from('orders').insert({
      id: newOrderId,
      customer_id: customerId,
      status: 'pending',
      payment_method: 'midtrans_snap',
      payment_status: 'unpaid',
      subtotal: totalPrice,
      shipping_cost: shippingCost,
      total_amount: grandTotal,
      shipping_address: form.address.trim(),
      shipping_city: form.city.trim(),
      shipping_postal_code: form.postal,
      shipping_area_id: parseInt(selectedAreaId, 10),
      shipping_area_name: selectedArea?.name || null,
      courier_code: (selectedShipping?.courier || '').toLowerCase(),
      courier_service: selectedShipping?.service || null,
      courier_duration: selectedShipping?.duration || null,
      courier_rate: shippingCost,
      notes: form.notes.trim() || null,
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
      weight_gram: item.weight_gram || 500,
    }));
    const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload);
    if (itemsError) throw itemsError;

    return newOrderId;
  };

  // ===== Submit → save order → mint Snap token → window.snap.pay() =====
  const handlePay = async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
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
        onSuccess: (result) => {
          console.log('[Midtrans] Payment success:', result.transaction_id);
          clearCart();
          onClose();
          showToast('Pembayaran berhasil! Terima kasih ✓');
        },
        onPending: (result) => {
          showToast('Menunggu pembayaran. Cek WA/email untuk instruksi.');
        },
        onError: (result) => {
          console.error('[Midtrans] Payment error:', result);
          showToast('Pembayaran gagal. Coba metode lain.');
        },
        onClose: () => {
          showToast('Kamu menutup halaman pembayaran. Order tersimpan — hubungi kami untuk bayar.');
        },
      });
    } catch (err) {
      console.error('[Midtrans Checkout] Gagal:', err);
      showToast(`Gagal: ${err.message}`);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const grandTotal = totalPrice + (selectedShipping?.price || 0);
  const isLocked = !!orderId;
  const showAreaDropdown = !areasLoading && areas.length > 1;
  const showAreaAutoSelected = !areasLoading && areas.length === 1 && selectedAreaId;
  const showAreaNotFound = !areasLoading && form.postal.length === 5 && areas.length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[2200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Form Pembayaran"
    >
      <div className="bg-white rounded-[20px] max-w-[500px] w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-[1.1rem] font-bold text-eglux-primary">Checkout</h3>
            <p className="text-[0.72rem] text-gray-500 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Midtrans · Biteship
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-full bg-black/[0.07] flex items-center justify-center
                       text-eglux-primary text-xl border-none cursor-pointer hover:bg-black/[0.13] transition-colors"
            aria-label="Tutup"
          >
            &times;
          </button>
        </div>

        <div className="px-6 pb-6 pt-5 space-y-6">
          {/* === Order Summary === */}
          <section className="bg-eglux-accent rounded-xl p-4 text-[0.85rem]">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] mb-2 font-semibold flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />Ringkasan Pesanan
            </h4>
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between mb-1 text-eglux-primary font-medium">
                <span className="flex-1 mr-2 truncate">
                  {item.name.slice(0, 38)}
                  {item.name.length > 38 ? '…' : ''}
                  <br />
                  <small className="text-[#666] font-normal">
                    {item.variantName ?? '-'} × {item.qty}
                    {item.weight_gram ? ` · ${item.weight_gram}g` : ''}
                  </small>
                </span>
                <span className="whitespace-nowrap">
                  {item.price ? rupiah(item.price * item.qty) : '—'}
                </span>
              </div>
            ))}
            <div className="flex justify-between mt-2 pt-2 border-t border-[#ddd] text-[0.82rem]">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium text-eglux-primary">{rupiah(totalPrice)}</span>
            </div>
            {selectedShipping && (
              <div className="flex justify-between mt-1 text-[0.82rem]">
                <span className="text-gray-600">
                  Ongkir ({selectedShipping.courier} {selectedShipping.service})
                </span>
                <span className="font-medium text-eglux-primary">{rupiah(selectedShipping.price)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[#ddd] mt-2 pt-2">
              <span className="font-bold text-eglux-primary text-[0.85rem]">Total</span>
              <span className="font-bold text-eglux-secondary text-[0.95rem]">{rupiah(grandTotal)}</span>
            </div>
          </section>

          {/* === Data Pembeli === */}
          <section className="space-y-4">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] font-semibold flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />Data Pembeli
            </h4>

            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Nama Lengkap *
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={change}
                placeholder="Masukkan nama lengkap"
                disabled={isLocked}
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  WhatsApp *
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={change}
                  placeholder="08xxxxxxxxxx"
                  inputMode="numeric"
                  disabled={isLocked}
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
                />
              </div>
              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={change}
                  placeholder="email@contoh.com"
                  disabled={isLocked}
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
                />
              </div>
            </div>
            <p className="text-[0.72rem] text-gray-500 -mt-2">
              Email opsional — Midtrans akan kirim e-receipt jika diisi.
            </p>
          </section>

          {/* === Alamat Pengiriman === */}
          <section className="space-y-4">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />Alamat Pengiriman
            </h4>

            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Alamat Lengkap *
              </label>
              <textarea
                name="address"
                value={form.address}
                onChange={change}
                placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan..."
                disabled={isLocked}
                className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none resize-y min-h-[70px] focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  Kota / Kabupaten *
                </label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={change}
                  placeholder="Kota"
                  disabled={isLocked}
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
                />
              </div>
              <div>
                <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                  Kode Pos *
                </label>
                <input
                  type="text"
                  name="postal"
                  value={form.postal}
                  onChange={onPostalChange}
                  placeholder="12345"
                  inputMode="numeric"
                  maxLength={5}
                  disabled={isLocked}
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
                />
              </div>
            </div>

            {/* Loading area lookup */}
            {areasLoading && (
              <div className="text-[0.78rem] text-gray-500 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari area Biteship...
              </div>
            )}

            {/* Multi-area: dropdown */}
            {showAreaDropdown && (
              <div>
                <label className="block text-[0.78rem] font-semibold text-eglux-primary mb-1.5">
                  Pilih Area Tujuan *
                </label>
                <select
                  value={selectedAreaId}
                  onChange={(e) => setSelectedAreaId(e.target.value)}
                  disabled={isLocked}
                  className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary disabled:bg-[#f5f5f5] disabled:text-[#999]"
                >
                  <option value="">— Pilih area —</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.suburb_name ? ` · ${a.suburb_name}` : ''}
                      {a.city_name ? ` · ${a.city_name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Single-area: auto-selected confirmation */}
            {showAreaAutoSelected && (
              <div className="text-[0.78rem] text-gray-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✓ Area terpilih:{' '}
                <strong>
                  {areas[0].name}
                  {areas[0].city_name ? `, ${areas[0].city_name}` : ''}
                </strong>
              </div>
            )}

            {/* Not found */}
            {showAreaNotFound && (
              <p className="text-[0.78rem] text-red-500">
                Kode pos tidak ditemukan di Biteship. Periksa kembali.
              </p>
            )}
          </section>

          {/* === Pilih Kurir === */}
          <section className="space-y-3">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] font-semibold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />Pilih Kurir
            </h4>

            {!selectedAreaId && (
              <p className="text-[0.78rem] text-gray-500 italic">
                Lengkapi kode pos & pilih area dulu untuk melihat opsi kurir.
              </p>
            )}

            {shippingLoading && (
              <div className="text-[0.82rem] text-gray-500 flex items-center gap-2 py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Mengambil ongkir...
              </div>
            )}

            {!shippingLoading && shippingOptions.length > 0 && (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {shippingOptions.map((opt) => {
                  const isSelected =
                    selectedShipping?.courier === opt.courier &&
                    selectedShipping?.service === opt.service;
                  return (
                    <label
                      key={`${opt.courier}-${opt.service}`}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-eglux-secondary bg-eglux-accent'
                          : 'border-[#eee] hover:border-[#ccc]'
                      } ${isLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="shipping"
                          className="accent-[#c9a96e]"
                          checked={isSelected}
                          onChange={() => setSelectedShipping(opt)}
                          disabled={isLocked}
                        />
                        <div>
                          <p className="text-[0.82rem] font-semibold text-eglux-primary">
                            {opt.courier} — {opt.service}
                          </p>
                          <p className="text-[0.72rem] text-[#999]">
                            {opt.duration}
                            {opt.description ? ` · ${opt.description}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[0.85rem] font-bold text-eglux-secondary whitespace-nowrap ml-2">
                        {rupiah(opt.price)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* === Catatan === */}
          <section>
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Catatan (opsional)
            </label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={change}
              placeholder="Warna, ukuran, atau permintaan khusus..."
              disabled={isLocked}
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none resize-y min-h-[60px] focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999]"
            />
          </section>

          {orderId && (
            <p className="text-[0.75rem] text-[#9ca3af] text-center">
              Order tersimpan (ID: <code>{orderId.slice(0, 8)}</code>). Klik tombol di bawah untuk lanjut bayar.
            </p>
          )}

          {loadError && <p className="text-[0.8rem] text-red-500 text-center">{loadError}</p>}

          {/* Submit */}
          <button
            onClick={handlePay}
            disabled={submitting || !snapReady}
            className="w-full py-4 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all duration-300 hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {!snapReady
              ? 'Memuat sistem pembayaran...'
              : submitting
              ? 'Memproses...'
              : `Bayar Sekarang · ${rupiah(grandTotal)}`}
          </button>

          <p className="text-[0.7rem] text-gray-400 text-center">
            Dengan melanjutkan, kamu setuju dengan syarat & ketentuan kami. Pembayaran diproses aman oleh Midtrans.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutModalMidtrans;
