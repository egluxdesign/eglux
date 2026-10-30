// src/components/ui/CheckoutModalDoku.jsx
// ============================================================================
// CheckoutModalDoku — DROP-IN REPLACEMENT untuk CheckoutModalMidtrans
//
// Perbedaan dengan CheckoutModalMidtrans:
//   - Pakai DOKU Checkout (bukan Midtrans Snap)
//   - Load jokul-checkout-1.0.0.js (bukan snap.js)
//   - Call edge function `create-doku-payment` (bukan `create-midtrans-payment`)
//   - Modal popup via window.loadJokulCheckout(payment_url)
//
// Props sama persis dengan CheckoutModalMidtrans (drop-in):
//   isOpen     : boolean — true buka modal, false tutup
//   onClose    : () => void — handler tutup modal
//   showToast  : (msg, type?) => void — notifikasi (optional)
//
// Cart data diambil dari useCart() context (sama kayak CheckoutModalMidtrans).
// User data diambil dari useAuth() context.
//
// Required env (.env frontend):
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_ANON_KEY
//   VITE_DOKU_MODE=sandbox|production
//
// Required Supabase Edge Functions:
//   create-doku-payment  (POST → returns payment_url)
//   doku-webhook         (menerima notifikasi DOKU)
// ============================================================================

import { useEffect, useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

// ── DOKU Checkout JS loader (cached, sandbox vs production) ──
const DOKU_JS_SANDBOX = 'https://sandbox.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js';
const DOKU_JS_PRODUCTION = 'https://jokul.doku.com/jokul-checkout-js/v1/jokul-checkout-1.0.0.js';

// ⭐ Export CHECKOUT_INTENT_KEY for compatibility with CartDrawer / CartPage
// that import it from CheckoutModalMidtrans (legacy).
// Same value as in CartPage.jsx: 'eglux_checkout_intent'
export const CHECKOUT_INTENT_KEY = 'eglux_checkout_intent';

let dokuJsPromise = null;

function loadDokuJs(isProduction) {
  if (typeof window === 'undefined') return Promise.reject(new Error('window not available'));
  if (typeof window.loadJokulCheckout === 'function') return Promise.resolve();
  if (dokuJsPromise) return dokuJsPromise;

  const src = isProduction ? DOKU_JS_PRODUCTION : DOKU_JS_SANDBOX;
  dokuJsPromise = new Promise((resolve, reject) => {
    // Cleanup any prior instance
    document.querySelectorAll('script[data-doku-checkout-js]').forEach((s) => s.remove());
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.setAttribute('data-doku-checkout-js', 'true');
    script.onload = () => {
      if (typeof window.loadJokulCheckout === 'function') resolve();
      else reject(new Error('jokul-checkout-1.0.0.js loaded but loadJokulCheckout not defined'));
    };
    script.onerror = () => reject(new Error('Failed to load jokul-checkout-1.0.0.js'));
    document.head.appendChild(script);
  });
  return dokuJsPromise;
}

const isProductionMode = () => {
  const v = (import.meta?.env?.VITE_DOKU_MODE || '').toLowerCase();
  return v === 'production';
};

// ── Component ──
const CheckoutModalDoku = ({ isOpen, onClose, showToast }) => {
  const { cart, clearCart } = useCart();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    postal_code: '',
    notes: '',
  });

  // Auto-fill from user profile
  useEffect(() => {
    if (!user) return;
    setForm((f) => ({
      ...f,
      name: f.name || user.user_metadata?.full_name || '',
      email: f.email || user.email || '',
      phone: f.phone || user.user_metadata?.phone || '',
    }));
  }, [user]);

  // Body scroll lock when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setError(null);
    }
  }, [isOpen]);

  // Prefetch DOKU JS when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDokuJs(isProductionMode()).catch((e) => {
        console.warn('[DOKU] preload JS failed:', e);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const subtotal = cart.reduce(
    (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 1),
    0
  );
  const total = subtotal; // shipping handled separately / on DOKU side

  const handlePay = async (e) => {
    e.preventDefault();
    if (!form.name || !form.phone) {
      const msg = 'Mohon lengkapi nama dan nomor WhatsApp.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
      return;
    }
    if (!cart.length) {
      const msg = 'Keranjang masih kosong.';
      setError(msg);
      if (showToast) showToast(msg, 'error');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build line_items from cart
      const line_items = cart.map((it, i) => ({
        id: String(it.id || it.product_id || `ITEM-${i + 1}`).slice(0, 64),
        name: String(it.name || it.title || 'Item').slice(0, 255),
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 1),
        sku: String(it.sku || '').slice(0, 64),
        category: String(it.category || 'retail').slice(0, 100),
      }));

      // Generate merchant order_id
      const order_id = `doku-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      // Build payload
      const payload = {
        order_id,
        amount: total,
        customer_name: form.name,
        customer_phone: form.phone,
        customer_email: form.email,
        customer_address: form.address,
        customer_city: form.city,
        customer_postcode: form.postal_code,
        line_items,
        shipping_address: {
          first_name: form.name,
          address: form.address,
          city: form.city,
          postal_code: form.postal_code,
          phone: form.phone,
        },
        billing_address: {
          first_name: form.name,
          address: form.address,
          city: form.city,
          postal_code: form.postal_code,
          phone: form.phone,
        },
      };

      // Call edge function via raw fetch (better error visibility)
      const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-doku-payment`;
      const resp = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Invalid response: ${text.slice(0, 200)}`);
      }

      if (!resp.ok || !data.success) {
        const errMsg = Array.isArray(data.error)
          ? data.error.join(', ')
          : data.error || `HTTP ${resp.status}`;
        throw new Error(errMsg);
      }

      const { payment_url, invoice_number } = data;

      // Open DOKU modal
      await loadDokuJs(isProductionMode());
      if (typeof window.loadJokulCheckout !== 'function') {
        // Fallback: full-page redirect
        window.location.href = payment_url;
        return;
      }

      window.loadJokulCheckout(payment_url);

      if (showToast) {
        showToast(`Pembayaran DOKU dimulai — Invoice: ${invoice_number}`, 'success');
      }

      // Optional: clear cart after payment session starts
      // (uncomment if you want cart cleared immediately — but user might close modal without paying)
      // clearCart();

      // Close our modal (DOKU modal takes over)
      onClose?.();
    } catch (err) {
      console.error('[DOKU] payment failed:', err);
      setError(err.message || String(err));
      if (showToast) showToast(`Gagal memulai pembayaran: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95dvh] overflow-y-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Checkout Pembayaran</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handlePay} className="p-5 space-y-4">
          {/* Customer info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
              Data Pemesan
            </h3>
            <input
              type="text"
              placeholder="Nama lengkap"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              required
            />
            <input
              type="tel"
              placeholder="Nomor WhatsApp (08xxx)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
              required
            />
            <input
              type="email"
              placeholder="Email (opsional)"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Shipping address */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
              Alamat Pengiriman
            </h3>
            <textarea
              placeholder="Alamat lengkap (jalan, RT/RW, kelurahan)"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500 resize-none"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Kota"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                required
              />
              <input
                type="text"
                placeholder="Kode pos"
                value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className="px-4 py-3 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-neutral-50 rounded-2xl p-4 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-800 uppercase tracking-wide">
              Ringkasan Pesanan
            </h3>
            {cart.map((it, i) => (
              <div key={i} className="flex justify-between text-sm text-neutral-700">
                <span>
                  {it.name || it.title} × {it.quantity}
                </span>
                <span>Rp {(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString('id-ID')}</span>
              </div>
            ))}
            <div className="border-t border-neutral-200 my-2" />
            <div className="flex justify-between font-semibold text-neutral-900">
              <span>Total</span>
              <span className="text-amber-700">Rp {total.toLocaleString('id-ID')}</span>
            </div>
          </div>

          {/* Payment method info */}
          <div className="text-xs text-neutral-500 text-center">
            Bayar via DOKU: Transfer Bank (VA), DOKU e-Wallet, Alfamart, Indomaret
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 disabled:bg-neutral-300 text-white font-semibold rounded-xl transition-colors"
          >
            {loading ? 'Memproses...' : `Bayar Rp ${total.toLocaleString('id-ID')}`}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CheckoutModalDoku;
