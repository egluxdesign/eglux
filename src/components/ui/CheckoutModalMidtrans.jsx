// src/components/ui/CheckoutModalMidtrans.jsx
// ============================================================================
// EGLUX Checkout — Midtrans Snap (payment) + Biteship (shipping aggregator)
//
// [v2.2] Perubahan:
//   1. Phone input → CUSTOM input dengan country selector (default +62, bisa ganti)
//      - 51 negara tersedia (ASEAN + Asia + Middle East + Eropa + Americas + Africa)
//      - Click bendera → buka dropdown searchable (cari by nama negara atau dial code)
//      - Prefix dial code (contoh: +62) dirender sebagai button, TIDAK bisa di-backspace
//      - User hanya input nomor lokalnya di input field terpisah
//      - Format storage: E.164 (+628xxx / +14155551234 / dst.) ke DB & Midtrans
//      - Validasi longga: 7-15 digit setelah country code
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
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart, rupiah } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
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
  ChevronDown,
} from 'lucide-react';
import Select from 'react-select';
import { INDONESIAN_CITIES } from '../../data/indonesianCities';
import { COUNTRIES, DEFAULT_COUNTRY } from '../../data/countries';

// Key untuk sessionStorage — sinyal agar parent page auto-buka checkout modal
// setelah user berhasil login dari halaman /admin.
export const CHECKOUT_INTENT_KEY = 'eglux_checkout_intent';

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

// ===== Phone validation (longga E.164) =====
// Valid:   +6281234567890  (12 digits total)
// Valid:   +14155551234    (11 digits total)
// Valid:   +6581234567     (9 digits total)
// Invalid: < 8 digit total (terlalu pendek)
// Invalid: > 15 digit total (terlalu panjang, melebihi E.164 max)
const isPhoneValidE164 = (p) => {
  if (!p) return false;
  const digits = p.replace(/\D/g, '');
  return /^\d{8,15}$/.test(digits);
};

const getPhoneErrorMessage = (p, country) => {
  if (!p || !p.trim()) return 'Nomor WhatsApp wajib diisi';
  const digits = p.replace(/\D/g, '');
  if (!digits.startsWith(country.dial)) {
    return `Format nomor tidak valid untuk +${country.dial} (${country.name})`;
  }
  const afterCountry = digits.slice(country.dial.length);
  if (afterCountry.length === 0) return 'Masukkan nomor telepon setelah kode negara';
  if (afterCountry.length < 7) return 'Nomor terlalu pendek (minimal 7 digit)';
  if (afterCountry.length > 14) return 'Nomor terlalu panjang (maksimal 14 digit)';
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
  // ⭐ v3: pakai recomputeCartPrices untuk refresh prices saat checkout modal buka
  const { cart, totalPrice, clearCart, recomputeCartPrices } = useCart();
  // ⭐ Redirect mode: gak perlu useMidtransSnap lagi (snap.js gak di-load)
  // User di-redirect ke Midtrans Snap page (full browser), bukan iframe popup.
  // Alasan: popup mode kena CSP error dari Midtrans sendiri (mereka kirim
  // CSP strict untuk popup page mereka, tapi inline script mereka sendiri
  // melanggar CSP itu — bug Midtrans yang gak bisa kita fix).
  const snapReady = true; // always ready — gak perlu load snap.js
  const loadError = null;
  const { user, profile, isPro } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [orderId, setOrderId] = useState(null);

  // Phone country selector state
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const countryDropdownRef = useRef(null);

  // Biteship: area lookup (by postal code)
  const [areas, setAreas] = useState([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState('');

  // Biteship: shipping rates
  const [shippingOptions, setShippingOptions] = useState([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedShipping, setSelectedShipping] = useState(null);

  // ============================================================================
  // AUTH: Pre-fill form dari profile + user_metadata saat user login
  // ============================================================================
  useEffect(() => {
    if (user && profile) {
      const userMeta = user.user_metadata || {};
      setForm((prev) => ({
        ...prev,
        name: profile.full_name || userMeta.full_name || prev.name,
        email: user.email || prev.email,
        phone: profile.phone || userMeta.phone || prev.phone,
        // ⭐ Auto-fill address dari profile (jika user sudah set di ProfileModal)
        address: profile.address || prev.address,
      }));
    }
  }, [user, profile]);

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
      // Reset phone country selector ke default Indonesia
      setSelectedCountry(DEFAULT_COUNTRY);
      setCountryDropdownOpen(false);
      setCountrySearch('');
    }
  }, [isOpen]);

  // Click-outside handler: tutup country dropdown kalau user klik di luar
  useEffect(() => {
    if (!countryDropdownOpen) return;
    const handler = (e) => {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(e.target)
      ) {
        setCountryDropdownOpen(false);
        setCountrySearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [countryDropdownOpen]);

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
  // Custom phone input: user input hanya digit lokal (tanpa dial code),
  // dial code (contoh: +62) di-prepend otomatis berdasarkan selectedCountry.
  // Prefix dirender sebagai button (TIDAK bisa di-backspace).
  const onPhoneChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 14);
    const e164 = digits ? `+${selectedCountry.dial}${digits}` : '';
    setForm((f) => ({ ...f, phone: e164 }));
    setFormErrors((prev) => ({ ...prev, phone: '' }));
  };

  const onPhoneBlur = () => {
    const err = getPhoneErrorMessage(form.phone, selectedCountry);
    setFormErrors((prev) => ({ ...prev, phone: err }));
  };

  // ===== Country selector handlers =====
  const onSelectCountry = (country) => {
    // Migrate phone value: extract digits lokal, prepend dial code baru
    const currentDigits = form.phone
      .replace(/\D/g, '')
      .slice(selectedCountry.dial.length);
    const newE164 = currentDigits ? `+${country.dial}${currentDigits}` : '';
    setForm((f) => ({ ...f, phone: newE164 }));
    setSelectedCountry(country);
    setCountryDropdownOpen(false);
    setCountrySearch('');
    setFormErrors((prev) => ({ ...prev, phone: '' }));
  };

  // Display value: strip current dial code prefix untuk ditampilkan di input
  const phoneDisplayValue = (() => {
    if (!form.phone) return '';
    const stripped = form.phone.replace(/^\+/, '');
    return stripped.startsWith(selectedCountry.dial)
      ? stripped.slice(selectedCountry.dial.length)
      : stripped;
  })();

  // Filtered country list untuk dropdown
  const filteredCountries = COUNTRIES.filter((c) => {
    if (!countrySearch.trim()) return true;
    const q = countrySearch.toLowerCase().trim().replace(/^\+/, '');
    return c.name.toLowerCase().includes(countrySearch.toLowerCase().trim()) || c.dial.includes(q);
  });

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
            weight_in_gram: item.weight_in_gram || 500,
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

    const phoneErr = getPhoneErrorMessage(form.phone, selectedCountry);
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
    // ── Pakai edge function create-order (auth-gated, bypass RLS) ──
    // Setelah SQL 006 (tighten RLS), anon key gak bisa INSERT ke
    // customers/orders/order_items. Edge function pakai service_role.
    const shippingCost = selectedShipping?.price || 0;
    const grandTotal = totalPrice + shippingCost;
    const selectedArea = areas.find((a) => String(a.id) === String(selectedAreaId));

    const payload = {
      customer: {
        name: form.name.trim(),
        phone: form.phone.trim(), // E.164: +628xxxxxxxxxx
        email: form.email.trim() || null,
        address: form.address.trim(),
      },
      order: {
        subtotal: totalPrice,
        shipping_cost: shippingCost,
        total_amount: grandTotal,
        shipping_address: form.address.trim(),
        shipping_city: form.city.trim(),
        shipping_postal_code: form.postal,
        shipping_area_id: String(selectedAreaId || '').trim() || null,
        shipping_area_name: selectedArea?.name || null,
        courier_code: (selectedShipping?.courier || '').toLowerCase(),
        courier_service: selectedShipping?.service || null,
        courier_duration: selectedShipping?.duration || null,
        courier_rate: shippingCost,
        notes: form.notes.trim() || null,
      },
      items: cart.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        product_name_snapshot: item.name,
        variant_name_snapshot: item.variantName ?? null,
        unit_price_snapshot: item.price || 0,
        quantity: item.qty,
        subtotal: (item.price || 0) * item.qty,
        weight_gram: item.weight_in_gram || 500,
      })),
    };

    const { data: result, error: fnError } = await supabase.functions.invoke(
      'create-order',
      { body: payload }
    );

    if (fnError) {
      throw new Error(`create-order: ${fnError.message}`);
    }
    if (!result?.success || !result?.order_id) {
      throw new Error(`create-order: ${result?.error || 'Unknown error'}`);
    }

    return result.order_id;
  };

  // ===== Submit → check auth → save order → mint Snap token → window.snap.pay() =====
  const handlePay = async () => {
    // Phase C: Wajib login sebelum checkout.
    // Jika belum login → simpan intent checkout di sessionStorage,
    // redirect ke halaman login (/admin). Setelah login berhasil,
    // AdminPage akan redirect balik ke page asal (state.from),
    // dan parent component akan auto-buka checkout modal karena
    // intent flag masih ada di sessionStorage.
    if (!user) {
      try {
        sessionStorage.setItem(CHECKOUT_INTENT_KEY, 'true');
      } catch (e) {
        // sessionStorage bisa disabled (private mode) — fail silently
      }
      onClose?.();
      navigate('/admin', {
        state: { from: location.pathname + location.search },
        replace: true,
      });
      return;
    }

    if (!validate()) return;

    setSubmitting(true);
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        currentOrderId = await saveOrderToSupabase();
        setOrderId(currentOrderId);

        // ⭐ Clear cart SETELAH order berhasil dibuat (bukan setelah payment success)
        // Alasan: order sudah masuk ke "Pesanan Saya" status pending.
        // User bisa bayar kapan saja via tombol "Lanjutkan Pembayaran" di /orders.
        // Kalau cart gak di-clear dan user close popup sebelum bayar, cart tetap
        // berisi item yang sama → user bisa accidentally checkout duplicate order.
        clearCart();
        showToast('Pesanan dibuat! Selesaikan pembayaran sekarang atau nanti via menu Pesanan Saya.', 'info');
      }

      const { data, error: fnError } = await supabase.functions.invoke(
        'create-midtrans-transaction',
        { body: { order_id: currentOrderId } }
      );

      if (fnError || !data?.token) {
        throw new Error(data?.error || fnError?.message || 'Gagal membuat transaksi pembayaran');
      }

      setSubmitting(false);

      // ── PAYMENT: Popup mode ──
      const isSnapReady = window.snap && typeof window.snap.pay === 'function';

      if (!isSnapReady) {
        showToast('Sistem pembayaran belum siap. Order tersimpan — bayar nanti via Pesanan Saya.', 'warning');
        setSubmitting(false);
        return;
      }

      // Popup mode — window.snap.pay()
      window.snap.pay(data.token, {
        onSuccess: (result) => {
          console.log('[Midtrans] Payment success:', result.transaction_id);
          // ⭐ Defensive: reset body scroll lock yang mungkin di-set oleh Snap popup
          // (Snap popup set body overflow:hidden saat render, kadang gak ke-release
          // otomatis setelah auto-close → web "stuck" sampai refresh)
          document.body.style.overflow = '';
          // Cart sudah di-clear saat order dibuat di atas
          onClose();
          showToast('Pembayaran berhasil! Terima kasih ✓', 'success');
        },
        onPending: () => {
          document.body.style.overflow = '';
          onClose();
          showToast('Menunggu pembayaran. Cek WA/email untuk instruksi, atau bayar via Pesanan Saya.', 'info');
        },
        onError: (result) => {
          console.error('[Midtrans] Payment error:', result);
          document.body.style.overflow = '';
          onClose();
          showToast('Pembayaran gagal. Bayar ulang via menu Pesanan Saya.', 'error');
        },
        onClose: () => {
          document.body.style.overflow = '';
          onClose();
          showToast('Order tersimpan. Bayar nanti via menu Pesanan Saya.', 'warning');
        },
      });
    } catch (err) {
      console.error('[Midtrans Checkout] Gagal:', err);
      showToast(`Gagal: ${err.message}`);
      setSubmitting(false);
    }
  };

  // Kalau user sudah login tapi intent flag masih ada (baru balik dari login),
  // clear flag — modal sudah terbuka, parent tidak perlu trigger lagi.
  useEffect(() => {
    if (user && sessionStorage.getItem(CHECKOUT_INTENT_KEY) === 'true') {
      sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
    }
  }, [user]);

  // ⭐ v3: Refresh cart prices saat checkout modal dibuka
  // (defensive — discount mungkin expire antara cart open → checkout open)
  useEffect(() => {
    if (isOpen && cart.length > 0) {
      recomputeCartPrices();
    }
  }, [isOpen, cart.length, recomputeCartPrices]);

  if (!isOpen) return null;

  // Safety net: kalau modal sempat ke-open saat user belum login
  // (seharusnya parent sudah gate), redirect ke /admin dengan intent flag.
  if (!user) {
    try { sessionStorage.setItem(CHECKOUT_INTENT_KEY, 'true'); } catch (e) {}
    onClose?.();
    navigate('/admin', {
      state: { from: location.pathname + location.search },
      replace: true,
    });
    return null;
  }

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
    <>
    <div
      className="fixed inset-0 bg-black/60 z-[3500] flex items-center justify-center p-3 md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Form Pembayaran"
    >
      <div className="bg-white rounded-[20px] max-w-[500px] w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-4 md:px-6 pt-5 md:pt-6 pb-3 md:pb-4 border-b border-gray-100">
          <div className="min-w-0 pr-2">
            <h3 className="text-[1rem] md:text-[1.1rem] font-bold text-eglux-primary truncate">Checkout</h3>
            <p className="text-[0.72rem] text-gray-500 mt-0.5 flex items-center gap-1 truncate">
              <ShieldCheck className="w-3 h-3 flex-shrink-0" /> Midtrans · Biteship
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-black/[0.07] flex items-center justify-center
                       text-eglux-primary text-xl border-none cursor-pointer hover:bg-black/[0.13] transition-colors"
            aria-label="Tutup"
          >
            &times;
          </button>
        </div>

        <div className="px-4 md:px-6 pb-6 pt-5 space-y-6">
          {/* === Order Summary (v3: transparent breakdown) === */}
          <section className="bg-eglux-accent rounded-xl p-4 text-[0.85rem]">
            <h4 className="text-[0.78rem] uppercase tracking-[1px] text-[#666] mb-2 font-semibold flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" />Ringkasan Pesanan
            </h4>

            {/* Item list — tampilkan harga asli (strike) + harga diskon per item */}
            {cart.map((item) => {
              const itemHasDiscount = item.isDiscounted && item.originalPrice > item.price;
              const itemOriginalSubtotal = (item.originalPrice || item.price) * item.qty;
              const itemDiscountedSubtotal = item.price * item.qty;
              const itemDiscountAmount = itemHasDiscount ? (itemOriginalSubtotal - itemDiscountedSubtotal) : 0;
              return (
                <div key={item.id} className="mb-2">
                  <div className="flex justify-between text-eglux-primary font-medium">
                    <span className="flex-1 mr-2 truncate">
                      {item.name.slice(0, 38)}
                      {item.name.length > 38 ? '…' : ''}
                      <br />
                      <small className="text-[#666] font-normal">
                        {item.variantName ?? '-'} × {item.qty}
                        {item.weight_in_gram ? ` · ${item.weight_in_gram}g` : ''}
                      </small>
                    </span>
                    <span className="whitespace-nowrap text-right">
                      {item.price ? rupiah(item.price * item.qty) : '—'}
                      {itemHasDiscount && (
                        <br />
                      )}
                      {itemHasDiscount && (
                        <small className="text-[0.65rem] text-gray-400 line-through font-normal">
                          {rupiah(itemOriginalSubtotal)}
                        </small>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* === Breakdown transparan === */}
            {/* 1. Subtotal Produk (harga asli, sebelum diskon) */}
            {(() => {
              const originalSubtotal = cart.reduce(
                (s, i) => s + ((i.originalPrice || i.price) * i.qty), 0
              );
              const discountedSubtotal = cart.reduce(
                (s, i) => s + (i.price * i.qty), 0
              );
              const totalDiscount = originalSubtotal - discountedSubtotal;
              const hasAnyDiscount = totalDiscount > 0;
              const shippingCost = selectedShipping?.price || 0;
              // Reserve untuk tax/admin fee (kalau ada di masa depan)
              const taxFee = 0;
              const grandTotalV3 = discountedSubtotal + shippingCost + taxFee;

              return (
                <>
                  {/* Subtotal harga asli */}
                  <div className="flex justify-between mt-2 pt-2 border-t border-[#ddd] text-[0.82rem]">
                    <span className="text-gray-600">Subtotal Produk ({cart.reduce((s,i)=>s+i.qty,0)} item)</span>
                    <span className="font-medium text-eglux-primary">{rupiah(originalSubtotal)}</span>
                  </div>

                  {/* Diskon (potongan) — tampilkan kalau ada */}
                  {hasAnyDiscount && (
                    <div className="flex justify-between mt-1 text-[0.82rem]">
                      <span className="text-green-600">↓ Diskon</span>
                      <span className="font-medium text-green-600">− {rupiah(totalDiscount)}</span>
                    </div>
                  )}

                  {/* Subtotal setelah diskon */}
                  {hasAnyDiscount && (
                    <div className="flex justify-between mt-1 text-[0.82rem]">
                      <span className="text-gray-600">Subtotal Setelah Diskon</span>
                      <span className="font-medium text-eglux-primary">{rupiah(discountedSubtotal)}</span>
                    </div>
                  )}

                  {/* Ongkir */}
                  {selectedShipping && (
                    <div className="flex justify-between mt-1 text-[0.82rem]">
                      <span className="text-gray-600">
                        Ongkir ({selectedShipping.courier} {selectedShipping.service})
                      </span>
                      <span className="font-medium text-eglux-primary">{rupiah(shippingCost)}</span>
                    </div>
                  )}

                  {/* Tax / Admin Fee (reserve untuk masa depan) */}
                  {taxFee > 0 && (
                    <div className="flex justify-between mt-1 text-[0.82rem]">
                      <span className="text-gray-600">Biaya Admin / Tax</span>
                      <span className="font-medium text-eglux-primary">{rupiah(taxFee)}</span>
                    </div>
                  )}

                  {/* Grand Total */}
                  <div className="flex justify-between border-t border-[#ddd] mt-2 pt-2">
                    <span className="font-bold text-eglux-primary text-[0.85rem]">Total Pembayaran</span>
                    <span className="font-bold text-eglux-secondary text-[0.95rem]">{rupiah(grandTotalV3)}</span>
                  </div>

                  {/* Hint hemat */}
                  {hasAnyDiscount && (
                    <p className="text-[0.65rem] text-green-600 mt-1.5 text-right">
                      🎉 Kamu hemat {rupiah(totalDiscount)} dari diskon!
                    </p>
                  )}
                </>
              );
            })()}
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

            {/* Phone — custom input dengan country selector (default +62, bisa ganti) */}
            <div>
              <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                WhatsApp *
              </label>
              <div className="relative" ref={countryDropdownRef}>
                {/* Country selector button — klik buka dropdown, TIDAK bisa di-backspace */}
                <button
                  type="button"
                  onClick={() => !isLocked && setCountryDropdownOpen((o) => !o)}
                  disabled={isLocked}
                  aria-label="Pilih kode negara"
                  className={`absolute left-0 top-0 bottom-0 flex items-center gap-1.5 px-3 bg-[#faf6ef] border-r-[1.5px] rounded-l-[10px] transition-colors ${
                    isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-[#f0e8d6]'
                  } ${formErrors.phone ? 'border-red-500' : 'border-[#ddd]'}`}
                >
                  <span className="text-base leading-none" role="img" aria-label={selectedCountry.name}>
                    {selectedCountry.flag}
                  </span>
                  <span className="text-[0.88rem] font-semibold text-eglux-primary whitespace-nowrap">
                    +{selectedCountry.dial}
                  </span>
                  <ChevronDown className="w-3 h-3 text-gray-500" />
                </button>

                {/* Input for local digits */}
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
                  className={`w-full py-3 pl-[90px] md:pl-[100px] pr-4 border-[1.5px] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors disabled:bg-[#f5f5f5] disabled:text-[#999] ${
                    formErrors.phone ? 'border-red-500' : 'border-[#ddd]'
                  }`}
                />

                {/* Dropdown: searchable country list */}
                {countryDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-w-[300px] bg-white rounded-[10px] shadow-2xl border border-[#eee] z-[100] max-h-[280px] flex flex-col overflow-hidden">
                    {/* Search */}
                    <div className="p-2 border-b border-[#eee]">
                      <input
                        type="text"
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        placeholder="Cari negara atau kode..."
                        autoFocus
                        className="w-full px-3 py-2 text-[0.85rem] border border-[#ddd] rounded-md outline-none focus:border-eglux-secondary transition-colors"
                      />
                    </div>
                    {/* List */}
                    <div className="overflow-y-auto flex-1">
                      {filteredCountries.length === 0 ? (
                        <p className="text-center text-[0.8rem] text-gray-400 py-4">
                          Negara tidak ditemukan
                        </p>
                      ) : (
                        filteredCountries.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => onSelectCountry(c)}
                            className={`w-full flex items-center gap-2.5 px-3 py-3 text-left hover:bg-[#faf6ef] transition-colors ${
                              selectedCountry.code === c.code ? 'bg-[#faf6ef]' : ''
                            }`}
                          >
                            <span className="text-base leading-none flex-shrink-0">{c.flag}</span>
                            <span className="text-[0.85rem] text-eglux-primary flex-1 truncate">
                              {c.name}
                            </span>
                            <span className="text-[0.78rem] text-gray-500 whitespace-nowrap flex-shrink-0">
                              +{c.dial}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
              <InlineError msg={formErrors.phone} />
              <p className="text-[0.72rem] text-gray-500 mt-1">
                Klik bendera untuk ganti negara (default Indonesia +62). Ketik nomor tanpa kode negara.
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
    </>
  );
};

export default CheckoutModalMidtrans;
