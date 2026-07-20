// src/components/ui/ChangeCourierModal.jsx
// ============================================================================
// ChangeCourierModal — Modal untuk ubah kurir pengiriman order PENDING
// ============================================================================
//
// Flow:
//   1. Buka modal dengan order data (perlu: shipping_area_id, order_items)
//   2. Fetch Biteship rates via check-biteship-rates edge function
//   3. Render list courier options (company, service, duration, price)
//   4. User pilih satu → klik "Simpan Kurir"
//   5. Call update-order-courier edge function (verify ownership + pending)
//   6. On success: closeModal + trigger parent refresh
//
// Props:
//   - isOpen: boolean
//   - onClose: () => void
//   - order: order object (dengan order_items + shipping_area_id)
//   - onUpdated: (updatedOrder) => void  // callback untuk refresh parent
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { rupiah } from '../../context/CartContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function formatDuration(d) {
  if (!d) return '';
  // Biteship return: "2-3 hari" atau "Estimasi 2-3 hari" — strip prefix kalau ada
  return d.replace(/^Estimasi\s+/i, '');
}

const ChangeCourierModal = ({ isOpen, onClose, order, onUpdated }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);

  // ── Fetch Biteship rates for this order's destination area ──
  const fetchRates = useCallback(async () => {
    if (!order?.shipping_area_id || !order?.order_items?.length) {
      setError('Data order tidak lengkap (shipping_area_id atau items kosong)');
      return;
    }

    setLoading(true);
    setError(null);
    setOptions([]);
    setSelected(null);

    try {
      const payload = {
        destination_area_id: String(order.shipping_area_id),
        items: order.order_items.map((item) => ({
          product_id: item.product_id,
          name: item.product_name_snapshot,
          price: Number(item.unit_price_snapshot) || 0,
          qty: Number(item.quantity),
          weight_in_gram: Number(item.weight_gram) || 500,
        })),
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/check-biteship-rates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error?.message || data.error || `HTTP ${resp.status}`);
      }

      const pricing = data.pricing || [];
      setOptions(pricing);

      // Auto-select current courier (kalau masih ada di list)
      if (order.courier_code) {
        const current = pricing.find(
          (p) => String(p.courier || '').toLowerCase() === String(order.courier_code).toLowerCase()
            && (p.service === order.courier_service || !order.courier_service)
        );
        if (current) setSelected(current);
      }
    } catch (e) {
      console.error('[ChangeCourierModal] fetchRates error:', e);
      setError(`Gagal memuat daftar kurir: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (isOpen && order) {
      fetchRates();
    }
  }, [isOpen, order, fetchRates]);

  // ── Save selected courier via edge function ──
  const handleSave = async () => {
    if (!selected) {
      setError('Pilih kurir dulu');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // ⭐ Pakai supabase.functions.invoke() — handle auth header + CORS otomatis
      // (sama kayak pattern di CheckoutModalMidtrans untuk create-midtrans-transaction)
      const { data, error: invokeError } = await supabase.functions.invoke(
        'update-order-courier',
        {
          body: {
            order_id: order.id,
            courier: {
              courier_code: String(selected.courier || '').toLowerCase(),
              courier_service: selected.service || '',
              courier_rate: Number(selected.price) || 0,
              courier_duration: formatDuration(selected.duration) || selected.etd || '',
            },
          },
        }
      );

      if (invokeError) {
        throw new Error(invokeError.message || 'Gagal menghubungi server');
      }
      if (!data?.success) {
        throw new Error(data?.error || 'Gagal mengubah kurir');
      }

      // Callback ke parent untuk refresh order data
      onUpdated?.(data.updated_fields);
      onClose();
    } catch (e) {
      console.error('[ChangeCourierModal] save error:', e);
      // Pesan ramah user kalau network/CORS error
      const msg = e.message?.includes('Failed to fetch') || e.message?.includes('CORS')
        ? 'Gagal terhubung ke server. Pastikan edge function "update-order-courier" sudah di-deploy ke Supabase.'
        : e.message;
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[3100] flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div className="bg-white rounded-2xl max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-eglux-primary">Ubah Kurir Pengiriman</h2>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">
              Order #{(order?.id || '').replace(/-/g, '').slice(0, 8).toUpperCase()}
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
          {/* Tujuan */}
          <div className="bg-gray-50 rounded-xl p-3 text-xs">
            <p className="text-gray-500 mb-1">Tujuan Pengiriman</p>
            <p className="font-medium text-gray-900">
              {order?.shipping_city || '—'}
              {order?.shipping_postal_code ? `, ${order.shipping_postal_code}` : ''}
            </p>
            <p className="text-gray-400 mt-0.5 line-clamp-1">{order?.shipping_address}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              ⚠ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Courier options */}
          {!loading && options.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Pilih Kurir ({options.length} opsi)
              </p>
              {options.map((opt, idx) => {
                const isSelected = selected?.courier === opt.courier && selected?.service === opt.service;
                const isCurrent =
                  String(opt.courier || '').toLowerCase() === String(order?.courier_code || '').toLowerCase()
                  && (opt.service === order?.courier_service || !order?.courier_service);

                return (
                  <button
                    key={`${opt.courier}-${opt.service}-${idx}`}
                    onClick={() => setSelected(opt)}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer bg-transparent
                      ${isSelected
                        ? 'border-eglux-secondary bg-eglux-secondary/5 ring-1 ring-eglux-secondary/20'
                        : 'border-gray-200 hover:border-eglux-secondary/40 hover:bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-eglux-primary uppercase">
                            {opt.courier}
                          </p>
                          <span className="text-[0.65rem] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {opt.service}
                          </span>
                          {isCurrent && (
                            <span className="text-[0.6rem] font-bold text-eglux-secondary bg-eglux-secondary/10 px-1.5 py-0.5 rounded">
                              SAAT INI
                            </span>
                          )}
                        </div>
                        <p className="text-[0.7rem] text-gray-500 mt-1">
                          {formatDuration(opt.duration) || opt.etd || 'Estimasi tidak tersedia'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-eglux-secondary">
                          {rupiah(opt.price)}
                        </p>
                        {isSelected && (
                          <svg className="w-4 h-4 text-eglux-secondary ml-auto mt-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty (no options) */}
          {!loading && !error && options.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">Tidak ada kurir tersedia untuk area ini.</p>
            </div>
          )}

          {/* Total preview */}
          {selected && order && (
            <div className="bg-eglux-accent rounded-xl p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal Produk</span>
                <span className="font-medium text-gray-900">{rupiah(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ongkir ({selected.courier} {selected.service})</span>
                <span className="font-medium text-gray-900">{rupiah(selected.price)}</span>
              </div>
              <div className="border-t border-eglux-secondary/20 pt-1.5 mt-1.5 flex justify-between items-center">
                <span className="font-semibold text-gray-900">Total Baru</span>
                <span className="text-base font-bold text-eglux-secondary">
                  {rupiah(Number(order.subtotal || 0) + Number(selected.price || 0))}
                </span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => !saving && onClose()}
              disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer border-none disabled:opacity-50"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !selected}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Menyimpan...
                </>
              ) : 'Simpan Kurir'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangeCourierModal;
