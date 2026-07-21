// src/components/admin/DiscountModal.jsx
// ============================================================================
// DiscountModal — Modal untuk set/clear discount per variant
// ============================================================================
//
// Features:
//   - 3 discount types: percentage / nominal / final_price (user pilih)
//   - Schedule: start_at + end_at (datetime picker)
//   - Live preview: harga final + badge percentage
//   - Clear discount button (set all to NULL)
//
// Cara pakai:
//   <DiscountModal
//     variant={variantObject}  // variant dengan field discount_*
//     onClose={() => setDiscountVariant(null)}
//     onSaved={() => { ... refresh ... }}
//   />
//
// Edge function yang dipanggil:
//   POST /functions/v1/set-variant-discount
//   Body: { variant_id, discount_type, discount_value, discount_start_at, discount_end_at }
//   Kalau discount_type = null → clear discount
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ──
function formatPrice(v) {
  if (v === null || v === undefined || v === '') return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
}

// Convert ISO datetime to local datetime-local input value (Asia/Jakarta)
function isoToLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    // Format: YYYY-MM-DDTHH:mm (local time)
    const tzOffset = d.getTimezoneOffset() * 60000; // ms
    const local = new Date(d.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

// Convert local datetime-local input value to ISO string
function localInputToISO(localStr) {
  if (!localStr) return null;
  try {
    const d = new Date(localStr);
    return d.toISOString();
  } catch {
    return null;
  }
}

// Compute final price berdasarkan discount type + value
function computeDiscountedPrice(originalPrice, type, value) {
  const price = Number(originalPrice) || 0;
  const val = Number(value) || 0;
  if (!type || val <= 0) return price;
  switch (type) {
    case 'percentage':
      return Math.max(0, Math.round(price - (price * val / 100)));
    case 'nominal':
      return Math.max(0, price - val);
    case 'final_price':
      return Math.max(0, val);
    default:
      return price;
  }
}

// Compute discount percentage untuk badge display
function computeDiscountPercent(originalPrice, type, value) {
  const price = Number(originalPrice) || 0;
  if (!price || !type) return 0;
  const final = computeDiscountedPrice(price, type, value);
  if (final >= price) return 0;
  return Math.round(((price - final) / price) * 100);
}

const DiscountModal = ({ variant, onClose, onSaved }) => {
  // ── Form state ──
  const [discountType, setDiscountType] = useState(variant?.discount_type || '');
  const [discountValue, setDiscountValue] = useState(variant?.discount_value || '');
  const [startAt, setStartAt] = useState(isoToLocalInput(variant?.discount_start_at));
  const [endAt, setEndAt] = useState(isoToLocalInput(variant?.discount_end_at));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Computed: original price + discounted price ──
  const originalPrice = Number(variant?.price) || 0;
  const discountedPrice = useMemo(
    () => computeDiscountedPrice(originalPrice, discountType, discountValue),
    [originalPrice, discountType, discountValue]
  );
  const discountPercent = useMemo(
    () => computeDiscountPercent(originalPrice, discountType, discountValue),
    [originalPrice, discountType, discountValue]
  );

  // ── Validation ──
  const validationErrors = useMemo(() => {
    const errs = [];
    if (discountType && (!discountValue || Number(discountValue) <= 0)) {
      errs.push('Nilai diskon wajib diisi (> 0)');
    }
    if (discountType === 'percentage' && Number(discountValue) > 100) {
      errs.push('Persentase diskon maksimal 100%');
    }
    if (discountType === 'final_price' && Number(discountValue) >= originalPrice) {
      errs.push('Harga final harus lebih kecil dari harga asli');
    }
    if (discountType && !startAt) {
      errs.push('Tanggal mulai wajib diisi');
    }
    if (discountType && !endAt) {
      errs.push('Tanggal berakhir wajib diisi');
    }
    if (discountType && startAt && endAt && new Date(startAt) >= new Date(endAt)) {
      errs.push('Tanggal berakhir harus setelah tanggal mulai');
    }
    return errs;
  }, [discountType, discountValue, startAt, endAt, originalPrice]);

  // ── Submit: call edge function ──
  const handleSave = async () => {
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' • '));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sesi login habis. Login ulang dulu.');
        setSaving(false);
        return;
      }

      const payload = {
        variant_id: variant.id,
        discount_type: discountType || null,
        discount_value: discountType ? Number(discountValue) : null,
        discount_start_at: discountType ? localInputToISO(startAt) : null,
        discount_end_at: discountType ? localInputToISO(endAt) : null,
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/set-variant-discount`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }

      onSaved?.();
    } catch (e) {
      console.error('[DiscountModal] save error:', e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Clear discount ──
  const handleClear = async () => {
    if (!confirm('Hapus diskon variant ini? Harga akan kembali normal.')) return;

    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sesi login habis.');
        setSaving(false);
        return;
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/set-variant-discount`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          variant_id: variant.id,
          discount_type: null,
          discount_value: null,
          discount_start_at: null,
          discount_end_at: null,
        }),
      });

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }

      onSaved?.();
    } catch (e) {
      console.error('[DiscountModal] clear error:', e);
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[3200] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="bg-white rounded-2xl max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-eglux-primary">Atur Diskon Varian</h2>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">
              {variant?.name} · Harga asli: {formatPrice(variant?.price)}
            </p>
          </div>
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            aria-label="Tutup"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-eglux-primary transition-colors cursor-pointer border-none bg-transparent disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              ⚠ {error}
            </div>
          )}

          {/* Discount type selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Tipe Diskon
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setDiscountType('percentage')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  discountType === 'percentage'
                    ? 'bg-eglux-primary text-white border-eglux-primary'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-eglux-secondary'
                }`}
              >
                Persentase (%)
              </button>
              <button
                onClick={() => setDiscountType('nominal')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  discountType === 'nominal'
                    ? 'bg-eglux-primary text-white border-eglux-primary'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-eglux-secondary'
                }`}
              >
                Nominal (Rp)
              </button>
              <button
                onClick={() => setDiscountType('final_price')}
                className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  discountType === 'final_price'
                    ? 'bg-eglux-primary text-white border-eglux-primary'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-eglux-secondary'
                }`}
              >
                Harga Final
              </button>
            </div>
          </div>

          {/* Discount value input */}
          {discountType && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                {discountType === 'percentage' && 'Persentase Diskon (0-100)'}
                {discountType === 'nominal' && 'Nominal Diskon (Rp)'}
                {discountType === 'final_price' && 'Harga Final (Rp)'}
              </label>
              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={
                  discountType === 'percentage' ? '20' :
                  discountType === 'nominal' ? '25000' :
                  '79000'
                }
                min="0"
                max={discountType === 'percentage' ? '100' : undefined}
                className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
              />
            </div>
          )}

          {/* Schedule: start + end date */}
          {discountType && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Mulai
                </label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                  Berakhir
                </label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {discountType && discountValue > 0 && (
            <div className="bg-eglux-accent rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Preview</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">Harga Asli</p>
                  <p className="text-sm line-through text-gray-400">{formatPrice(originalPrice)}</p>
                </div>
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
                <div>
                  <p className="text-xs text-gray-500">Harga Diskon</p>
                  <p className="text-base font-bold text-eglux-secondary">{formatPrice(discountedPrice)}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-gray-500">Hemat</p>
                  <p className="text-sm font-bold text-red-500">-{discountPercent}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state hint */}
          {!discountType && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">
                Pilih tipe diskon di atas untuk mulai mengatur diskon varian ini.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
          {variant?.discount_type && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="px-4 py-2.5 text-sm font-semibold text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Hapus Diskon
            </button>
          )}
          <button
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || validationErrors.length > 0 || !discountType}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Menyimpan...' : '💾 Simpan Diskon'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiscountModal;
