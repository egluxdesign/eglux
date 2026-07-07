// src/components/ui/CheckoutModalMidtrans.jsx
// ============================================================================
// EGLUX Checkout — Midtrans Snap (payment) + Biteship (shipping aggregator)
//
// [v2.1] Perubahan:
//   1. Phone input → CUSTOM input dengan locked +62 prefix (non-deletable)
//      - Prefix 🇮🇩 +62 dirender sebagai overlay div (pointer-events-none)
//      - User hanya input nomor lokalnya (8xxx), +62 tidak bisa dihapus
//      - Format storage: E.164 (+628xxx) ke DB & Midtrans
//      - Validasi: digit pertama WAJIB 8 (HP only, reject landline & 0 prefix)
//      - Jika user ketik "08xxx" → error "Jangan pakai 0 di depan"
//      - Jika user ketik "21xxx" (landline) → error "Harus diawali angka 8"
//   2. Email input → inline error message di bawah field (bukan cuma toast)
//   3. City input → react-select searchable dropdown (97 kota Indonesia)
//
// Dependencies baru:
//   npm install react-select
//   (Phone input custom — NO react-phone-input-2 needed, hemat ~50KB bundle)
//
// Catatan DB:
//   - customers.phone: VARCHAR(20) minimum (untuk accommodate +628xxxxxxxxxx)
//   - orders.shipping_city: VARCHAR(100) (sudah ada)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useCart, rupiah } from '../../context/CartContext';
import { supabase } from '../../lib/supabaseClient';
import { useMidtransSnap } from '../../hooks/useMidtransSnap';
import {
  Truck,
  Loader2,
  MapPin,
  User,
  Package,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import Select from 'react-select';
import { INDONESIAN_CITIES } from '../../data/indonesianCities';

const INITIAL_FORM = {
  name: '',
  email: '',
  phone: '', // E.164: +628xxxxxxxxxx (13-15 char total)
  address: '',
  city: '', // city name string (dari dropdown)
  postal: '',
  notes: '',
};

const generateUUID = () => crypto.randomUUID();

// ===== Email validation =====
const isEmailValid = (e) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ===== Phone validation (E.164, first digit after +62 MUST be 8) =====
// Accepts:   +62 812 3456 7890 → valid (HP)
// Rejects:   +62 0812...       → "Jangan pakai 0 di depan"
// Rejects:   +62 21...         → "Harus diawali angka 8" (landline)
// Rejects:   too short/long    → "Nomor terlalu pendek/panjang"
const isPhoneValidE164 = (p) => {
  if (!p) return false;
  const digits = p.replace(/\D/g, '');
  // 62 (country) + 8 (mobile prefix) + 7-13 digits
  return /^628\d{7,13}$/.test(digits);
};

const getPhoneErrorMessage = (p) => {
  if (!p || !p.trim()) return 'Nomor WhatsApp wajib diisi';
  const digits = p.replace(/\D/g, '');
  if (!digits.startsWith('62')) {
    return 'Format nomor tidak valid (gunakan +62 8xx)';
  }
  const afterCountry = digits.slice(2);
  if (afterCountry.startsWith('0')) {
    return 'Jangan pakai 0 di depan. Langsung ketik 8xxx (contoh: 812 3456 7890)';
  }
  if (!afterCountry.startsWith('8')) {
    return 'Nomor HP Indonesia harus diawali angka 8 (contoh: +62 812 xxx)';
  }
  if (afterCountry.length < 8) return 'Nomor terlalu pendek';
  if (afterCountry.length > 14) return 'Nomor terlalu panjang';
  return '';
};

// ===== react-select custom styles (match eglux design) =====
const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: '48px',
    height: '48px',
    border: state.isFocused
      ? '1.5px solid #c9a96e'
      : state.selectProps.error
      ? '1.5px solid #ef4444'
      : '1.5px solid #ddd',
    borderRadius: '10px',
    fontSize: '0.88rem',
    fontFamily: 'inherit',
    boxShadow: 'none',
    '&:hover': {
      borderColor: state.selectProps.error ? '#ef4444' : '#c9a96e',
    },
    background: state.isDisabled ? '#f5f5f5' : '#fff',
    cursor: 'pointer',
  }),
  option: (base, state) => ({
    ...base,
    fontSize: '0.85rem',
    background: state.isSelected
      ? '#c9a96e'
      : state.isFocused
      ? '#faf6ef'
      : '#fff',
    color: state.isSelected ? '#fff' : '#1a1a1a',
    cursor: 'pointer',
    '&:active': { background: state.isSelected ? '#c9a96e' : '#f0e8d6' },
  }),
  placeholder: (base) => ({
    ...base,
    color: '#999',
    fontSize: '0.85rem',
  }),
  singleValue: (base) => ({
    ...base,
    color: '#1a1a1a',
    fontSize: '0.88rem',
  }),
  menu: (base) => ({
    ...base,
    zIndex: 9999,
    borderRadius: '10px',
    overflow: 'hidden',
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: '220px',
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: '#ddd',
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: '#999',
    '&:hover': { color: '#c9a96e' },
  }),
};

// (Phone input styling sekarang inline via Tailwind classes — see JSX below)

const CheckoutModalMidtrans = ({ isOpen, onClose, showToast }) => {
  const { cart, totalPrice, clearCart } = useCart();
  const { snapReady, loadError } = useMidtransSnap();

  const [form, setForm] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState({});
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
      setFormErrors({});
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
    // Clear error untuk field ini saat user mulai edit
    setFormErrors((prev) => ({ ...prev, [name]: '' }));
    // Reset downstream kalau user ubah kode pos
    if (name === 'postal') {
      setAreas([]);
      setSelectedAreaId('');
      setShippingOptions([]);
      setSelectedShipping(null);
    }
  };

  // ===== Phone handlers =====
  // Custom phone input: user input hanya digit lokal (8xxx), +62 di-prepend otomatis
  // Prefix +62 dirender sebagai overlay div (pointer-events-none) sehingga tidak bisa dihapus
  const onPhoneChange = (e) => {
    // Strip non-digits, max 13 digit (8 + 12 digit maksimum HP Indonesia)
    const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
    // Selalu prepend +62 — biarkan validation yang nentukan valid atau nggak
    const e164 = digits ? `+62${digits}` : '';
    setForm((f) => ({ ...f, phone: e164 }));
    setFormErrors((prev) => ({ ...prev, phone: '' }));
  };

  const onPhoneBlur = () => {
    const err = getPhoneErrorMessage(form.phone);
    setFormErrors((prev) => ({ ...prev, phone: err }));
  };

  // Display value: strip +62 prefix untuk ditampilkan di input field
  const phoneDisplayValue = form.phone.replace(/^\+62/, '');

  // ===== City handler =====
  const onCityChange = (opt) => {
    setForm((f) => ({ ...f, city: opt?.value || '' }));
    setFormErrors((prev) => ({ ...prev, city: '' }));
  };

  // ===== Email handler =====
  const onEmailBlur = () => {
    if (form.email && !isEmailValid(form.email)) {
      setFormErrors((prev) => ({
        ...prev,
        email: 'Format email tidak valid (contoh: nama@contoh.com)',
      }));
    } else {
      setFormErrors((prev) => ({ ...prev, email: '' }));
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
        if (data.areas?.length === 1) {
          setSelectedAreaId(String(data.areas[0].id));
        }
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
    setFormErrors((prev) => ({ ...prev, postal: '' }));

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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const payload = {
          destination_area_id: areaIdStr,
          items: cart.map((item) => ({
            product_id: item.productId,
            name: item.name,
            price: item.price || 0,
            qty: item.qty,
            weight_in_gram: item.weight_gram || 500,
          })),
        };

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
    const errors = {};

    if (cart.length === 0) errors.cart = 'Keranjang masih kosong';
    if (!form.name.trim()) errors.name = 'Nama lengkap wajib diisi';

    const phoneErr = getPhoneErrorMessage(form.phone);
    if (phoneErr) errors.phone = phoneErr;

    if (form.email && !isEmailValid(form.email)) {
      errors.email = 'Format email tidak valid (contoh: nama@contoh.com)';
    }
    if (!form.address.trim()) errors.address = 'Alamat lengkap wajib diisi';
    if (!form.city.trim()) errors.city = 'Kota wajib dipilih';
    if (!/^\d{5}$/.test(form.postal)) errors.postal = 'Kode pos harus 5 digit';
    if (!selectedAreaId) errors.area = 'Pilih area tujuan dari hasil pencarian kode pos';
    if (!selectedShipping) errors.shipping = 'Pilih kurir terlebih dahulu';
    if (!snapReady) errors.system = 'Sistem pembayaran belum siap, coba sesaat lagi';

    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      // Show first error as toast (skip system error → handled by button state)
      const firstError = Object.values(errors).find(
        (e) => e !== errors.system
      );
      if (firstError) showToast(firstError);
      return false;
    }
    return true;
  };

  // ===== Persist order ke Supabase =====
  const saveOrderToSupabase = async () => {
    const customerId = generateUUID();
    const { error: customerError } = await supabase.from('customers').insert({
      id: customerId,
      name: form.name.trim(),
      phone: form.phone.trim(), // E.164: +628xxxxxxxxxx
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
      shipping_city: form.city.trim(), // dari dropdown kota
      shipping_postal_code: form.postal,
      shipping_area_id: String(selectedAreaId || '').trim() || null,
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
        onPending: () => {
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

  // Reusable inline error component
  const InlineError = ({ msg }) =>
    msg ? (
      <p className="text-[0.72rem] text-red-500 mt-1 flex items-center gap-1">
        <AlertCircle className="w-3 h-3 flex-shrink-0" /> {msg}
      </p>
    ) : null;

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

            {/* Name */}
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
                className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                  formErrors.name ? 'border-red-500' : 'border-[#ddd]'
                }`}
              />
              <InlineError msg={formErrors.name} />
            </div>

            {/* Phone — custom input dengan locked +62 prefix */}
            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                WhatsApp *
              </label>
              <div className="relative">
                {/* Locked +62 prefix — dirender sebagai overlay, TIDAK bisa diedit */}
                <div
                  className={`absolute left-0 top-0 bottom-0 flex items-center gap-1.5 px-3 pointer-events-none bg-[#faf6ef] border-r-[1.5px] rounded-l-[10px] ${
                    formErrors.phone ? 'border-red-500' : 'border-[#ddd]'
                  }`}
                >
                  <span className="text-base leading-none" role="img" aria-label="Indonesia">
                    🇮🇩
                  </span>
                  <span className="text-[0.88rem] font-semibold text-eglux-primary whitespace-nowrap">
                    +62
                  </span>
                </div>
                <input
                  type="tel"
                  name="phone"
                  value={phoneDisplayValue}
                  onChange={onPhoneChange}
                  onBlur={onPhoneBlur}
                  placeholder="812 3456 7890"
                  inputMode="numeric"
                  autoComplete="tel"
                  disabled={isLocked}
                  className={`w-full py-3 pl-[84px] pr-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                    formErrors.phone ? 'border-red-500' : 'border-[#ddd]'
                  }`}
                />
              </div>
              <InlineError msg={formErrors.phone} />
              <p className="text-[0.72rem] text-gray-500 mt-1">
                HP Indonesia only · ketik langsung 8xxx tanpa 0 di depan (contoh: 812 3456 7890)
              </p>
            </div>

            {/* Email — full width + inline error */}
            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={change}
                onBlur={onEmailBlur}
                placeholder="email@contoh.com"
                disabled={isLocked}
                autoComplete="email"
                className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                  formErrors.email ? 'border-red-500' : 'border-[#ddd]'
                }`}
              />
              <InlineError msg={formErrors.email} />
              <p className="text-[0.72rem] text-gray-500 mt-1">
                Email opsional — Midtrans akan kirim e-receipt jika diisi.
              </p>
            </div>
          </section>

          {/* === Alamat Pengiriman === */}
          <section className="space-y-4">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />Alamat Pengiriman
            </h4>

            {/* Address */}
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
                className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none resize-y min-h-[70px] focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                  formErrors.address ? 'border-red-500' : 'border-[#ddd]'
                }`}
              />
              <InlineError msg={formErrors.address} />
            </div>

            {/* City — react-select searchable dropdown */}
            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                Kota *
              </label>
              <Select
                options={INDONESIAN_CITIES}
                value={INDONESIAN_CITIES.find((c) => c.value === form.city) || null}
                onChange={onCityChange}
                isDisabled={isLocked}
                isSearchable
                placeholder="Cari kota... (ketik nama kota atau provinsi)"
                styles={selectStyles}
                error={formErrors.city}
                noOptionsMessage={() => 'Kota tidak ditemukan'}
                className="text-[0.88rem]"
                classNamePrefix="react-select"
              />
              <InlineError msg={formErrors.city} />
              <p className="text-[0.72rem] text-gray-500 mt-1">
                97 kota di Indonesia · ketik untuk cari (misal: "bandung", "jakarta", "surabaya")
              </p>
            </div>

            {/* Postal code */}
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
                className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                  formErrors.postal ? 'border-red-500' : 'border-[#ddd]'
                }`}
              />
              <InlineError msg={formErrors.postal} />
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
                  className={`w-full py-3 px-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                    formErrors.area ? 'border-red-500' : 'border-[#ddd]'
                  }`}
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
                <InlineError msg={formErrors.area} />
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

            {!shippingLoading && !selectedShipping && selectedAreaId && shippingOptions.length === 0 && (
              <InlineError msg={formErrors.shipping} />
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
