// src/components/ui/VoucherClaimModal.jsx
// ============================================================================
// VoucherClaimModal — Browse + claim vouchers (Shopee/Tokopedia style)
// ============================================================================
//
// Dipanggil dari:
//   - CheckoutModalMidtrans (button "Punya Voucher?" → open modal)
//   - Homepage / Profile (future — bisa akses dari mana saja)
//
// Features:
//   - List available vouchers (active + within date range)
//   - Show: discount value, min purchase, expiry, quota
//   - Claim button (or "Sudah Diklaim" badge)
//   - "Gunakan" button → apply ke checkout (langsung pilih, gak perlu input code)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { rupiah } from '../../context/CartContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta',
    }).format(new Date(iso));
  } catch { return iso; }
}

const VoucherClaimModal = ({ isOpen, onClose, onUseVoucher, subtotal }) => {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null); // voucher_id yang sedang di-claim
  const [myVouchers, setMyVouchers] = useState([]); // voucher yang sudah di-claim
  const [error, setError] = useState('');

  // ── Fetch available vouchers ──
  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { setError('Sesi login habis'); return; }

      // Get available vouchers
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-available-vouchers`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await resp.json();
      if (result.success) {
        setVouchers(result.vouchers || []);
      }

      // Get my claimed vouchers
      const myResp = await fetch(`${SUPABASE_URL}/functions/v1/claim-voucher`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'my_vouchers' }),
      });
      const myResult = await myResp.json();
      if (myResult.success) {
        setMyVouchers(myResult.vouchers || []);
      }
    } catch (e) {
      setError('Gagal memuat voucher: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchVouchers();
  }, [isOpen, fetchVouchers]);

  // ── Claim voucher ──
  const handleClaim = async (voucherId) => {
    setClaiming(voucherId);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/claim-voucher`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim', voucher_id: voucherId }),
      });
      const result = await resp.json();

      if (result.success) {
        // Refresh lists
        await fetchVouchers();
      } else {
        setError(result.error || 'Gagal klaim voucher');
      }
    } catch (e) {
      setError('Gagal klaim: ' + e.message);
    } finally {
      setClaiming(null);
    }
  };

  // ── Use voucher (apply ke checkout) ──
  const handleUse = (voucher) => {
    onUseVoucher?.(voucher);
    onClose();
  };

  if (!isOpen) return null;

  // Merge: available vouchers + my claimed vouchers
  const myVoucherIds = new Set(myVouchers.map(v => v.voucher?.id || v.voucher_id));

  return (
    <div
      className="fixed inset-0 bg-black/55 z-[3500] flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-t-[20px] md:rounded-[20px] max-w-[500px] w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-eglux-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
            <h3 className="text-[1rem] font-bold text-eglux-primary">Voucher Saya</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none text-xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* === Section: Voucher yang sudah di-claim (My Vouchers) === */}
          {myVouchers.length > 0 && (
            <div className="mb-6">
              <p className="text-[0.78rem] font-semibold text-gray-600 uppercase tracking-wide mb-3">Voucher Saya ({myVouchers.length})</p>
              <div className="space-y-3">
                {myVouchers.map((claim) => {
                  const v = claim.voucher;
                  if (!v) return null;
                  const canUse = !subtotal || subtotal >= (v.min_purchase || 0);
                  return (
                    <div key={claim.id} className={`border-2 rounded-lg p-3 ${canUse ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-eglux-secondary text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded">DARI EGLUX</span>
                          </div>
                          <p className="text-xs font-semibold text-gray-700 truncate mb-0.5">{v.name}</p>
                          <p className="text-lg font-bold text-red-500">
                            {v.discount_type === 'fixed' ? `Diskon ${rupiah(v.discount_value)}` : `Diskon ${v.discount_value}%`}
                          </p>
                          <p className="text-[0.7rem] text-gray-500 mt-0.5">
                            Min. belanja {v.min_purchase > 0 ? rupiah(v.min_purchase) : '—'}
                          </p>
                          <p className="text-[0.65rem] text-gray-400 mt-0.5">
                            Berlaku hingga {formatDate(v.end_at)}
                          </p>
                          {!canUse && (
                            <p className="text-[0.65rem] text-amber-600 mt-1">⚠ Belum mencapai min. belanja</p>
                          )}
                        </div>
                        <button
                          onClick={() => handleUse(v)}
                          disabled={!canUse}
                          className="px-4 py-2 text-xs font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none flex-shrink-0"
                        >
                          Gunakan
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* === Section: Voucher available untuk claim === */}
          <div>
            <p className="text-[0.78rem] font-semibold text-gray-600 uppercase tracking-wide mb-3">Voucher Tersedia</p>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : vouchers.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-400">Belum ada voucher tersedia saat ini.</p>
                <p className="text-xs text-gray-400 mt-1">Cek kembali nanti untuk promo menarik!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vouchers.map((v) => {
                  const isClaimed = v.is_claimed || myVoucherIds.has(v.id);
                  return (
                    <div key={v.id} className="border-2 border-gray-200 rounded-lg p-3 hover:border-eglux-secondary/30 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-eglux-secondary text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded">DARI EGLUX</span>
                          </div>
                          <p className="text-xs font-semibold text-gray-700 truncate mb-0.5">{v.name}</p>
                          <p className="text-lg font-bold text-red-500">
                            {v.discount_type === 'fixed' ? `Diskon ${rupiah(v.discount_value)}` : `Diskon ${v.discount_value}%`}
                          </p>
                          <p className="text-[0.7rem] text-gray-500 mt-0.5">
                            Min. belanja {v.min_purchase > 0 ? rupiah(v.min_purchase) : '—'}
                          </p>
                          <p className="text-[0.65rem] text-gray-400 mt-0.5">
                            Berlaku hingga {formatDate(v.end_at)}
                          </p>
                          {/* ⭐ Sisa quota */}
                          {v.remaining_quota !== null && v.remaining_quota !== undefined && (
                            <p className={`text-[0.65rem] mt-0.5 ${v.remaining_quota <= 5 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                              {v.remaining_quota > 0
                                ? `Sisa ${v.remaining_quota} voucher`
                                : 'Kuota habis'}
                            </p>
                          )}
                          {v.quota_total === null && (
                            <p className="text-[0.65rem] text-gray-400 mt-0.5">Tanpa batas kuota</p>
                          )}
                        </div>
                        {isClaimed ? (
                          <span className="px-4 py-2 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-md flex-shrink-0">
                            ✓ Diklaim
                          </span>
                        ) : (
                          <button
                            onClick={() => handleClaim(v.id)}
                            disabled={claiming === v.id}
                            className="px-4 py-2 text-xs font-bold text-eglux-secondary bg-white border border-eglux-secondary rounded-md hover:bg-eglux-secondary hover:text-white transition-colors disabled:opacity-50 cursor-pointer flex-shrink-0"
                          >
                            {claiming === v.id ? '⏳' : 'Klaim'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoucherClaimModal;
