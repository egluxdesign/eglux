// src/components/admin/DiscountManagementPanel.jsx
// ============================================================================
// DiscountManagementPanel — 2 tabs: Discount (per variant) + Voucher (codes)
// ============================================================================
// Tab 1: Discount — table list variants dengan discount status, set/clear via DiscountModal
// Tab 2: Voucher — list vouchers + create form (Tokopedia Seller Center style)
//
// Reference: Tokopedia Seller Center voucher creation UI
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import DiscountModal from './DiscountModal';
import { friendlyErrorMessage } from '../../lib/errorMessage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ──
function formatPrice(v) {
  if (v === null || v === undefined || v === '') return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
}
function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
    }).format(new Date(iso)) + ' WIB';
  } catch { return iso; }
}
function getDiscountStatus(v) {
  if (!v.discount_type || !v.discount_value) return { status: 'none', label: 'No Discount', cls: 'bg-gray-100 text-gray-600' };
  const now = new Date();
  const start = v.discount_start_at ? new Date(v.discount_start_at) : null;
  const end = v.discount_end_at ? new Date(v.discount_end_at) : null;
  if (start && now < start) return { status: 'scheduled', label: 'Scheduled', cls: 'bg-blue-50 text-blue-600' };
  if (end && now > end) return { status: 'expired', label: 'Expired', cls: 'bg-red-50 text-red-600' };
  return { status: 'active', label: 'Active', cls: 'bg-green-50 text-green-600' };
}
function getDiscountPercent(v) {
  if (!v.discount_type || !v.discount_value) return 0;
  const orig = Number(v.price) || 0;
  if (orig <= 0) return 0;
  const val = Number(v.discount_value);
  let curr = orig;
  switch (v.discount_type) {
    case 'percentage': curr = Math.max(0, Math.round(orig - (orig * val / 100))); break;
    case 'nominal': curr = Math.max(0, orig - val); break;
    case 'final_price': curr = Math.max(0, val); break;
    default: return 0;
  }
  return orig <= curr ? 0 : Math.round(((orig - curr) / orig) * 100);
}
function getVoucherStatus(v) {
  const now = new Date();
  if (!v.is_active) return { label: 'Nonaktif', cls: 'bg-gray-100 text-gray-600' };
  if (new Date(v.start_at) > now) return { label: 'Terjadwal', cls: 'bg-blue-50 text-blue-600' };
  if (new Date(v.end_at) < now) return { label: 'Berakhir', cls: 'bg-red-50 text-red-600' };
  return { label: 'Aktif', cls: 'bg-green-50 text-green-600' };
}

// ============================================================================
// VOUCHER FORM COMPONENT (Tokopedia-style)
// ============================================================================
const VoucherForm = ({ onClose, onSaved, showToast }) => {
  const [step, setStep] = useState(1); // 1=info, 2=validity, 3=settings, 4=quota
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: `Voucher ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
    start_date: new Date().toISOString().slice(0, 10),
    start_time: '00:00',
    end_date: '',
    end_time: '23:59',
    validity_type: 'date_range',
    validity_days: 5,
    discount_type: 'fixed',
    discount_value: '',
    min_purchase_type: 'none', // 'none' | 'set'
    min_purchase: '',
    max_discount: '',
    quota_total: '',
    quota_per_user: 30,
    applicable_type: 'all',
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) { showToast?.('Sesi login habis', 'error'); setSaving(false); return; }

      const start_at = new Date(`${form.start_date}T${form.start_time}+07:00`).toISOString();
      const end_at = new Date(`${form.end_date}T${form.end_time}+07:00`).toISOString();

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-voucher`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: form.name,
          start_at, end_at,
          channel: 'all',
          validity_type: form.validity_type,
          validity_days: form.validity_type === 'days_after_claim' ? form.validity_days : null,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          min_purchase: form.min_purchase_type === 'set' ? Number(form.min_purchase) : 0,
          max_discount: form.max_discount ? Number(form.max_discount) : null,
          quota_total: form.quota_total ? Number(form.quota_total) : null,
          quota_per_user: Number(form.quota_per_user),
          applicable_type: form.applicable_type,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Failed to create voucher');

      showToast?.('✓ Voucher berhasil dibuat', 'success');
      onSaved?.();
    } catch (e) {
      showToast?.('Gagal: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Calculate estimated cost ──
  const estimatedCost = useMemo(() => {
    const val = Number(form.discount_value) || 0;
    const quota = Number(form.quota_total) || 0;
    if (form.discount_type === 'fixed') return val * quota;
    return 0; // percentage hard to estimate without avg order
  }, [form.discount_value, form.quota_total, form.discount_type]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl max-w-2xl w-full my-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg font-bold text-gray-900">Buat Voucher</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* === Info Banner === */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <p className="text-xs text-blue-900">Minimum belanja untuk menggunakan voucher dihitung berdasarkan nilai pesanan setelah dipotong discount variant.</p>
          </div>

          {/* === Section 1: Informasi dasar === */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Informasi dasar</h3>
            <div className="space-y-4">
              {/* Nama voucher */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama voucher</label>
                <input
                  type="text" value={form.name} onChange={e => update('name', e.target.value)}
                  maxLength={50}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
                />
                <p className="text-xs text-gray-400 text-right mt-1">{form.name.length}/50</p>
              </div>
              {/* Waktu mulai */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waktu mulai (GMT+7)</label>
                <div className="flex gap-2">
                  <input type="date" value={form.start_date} onChange={e => update('start_date', e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md" />
                  <input type="time" value={form.start_time} onChange={e => update('start_time', e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-md" />
                </div>
              </div>
              {/* Waktu selesai */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Waktu selesai (GMT+7)</label>
                <div className="flex gap-2">
                  <input type="date" value={form.end_date} onChange={e => update('end_date', e.target.value)} className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md" />
                  <input type="time" value={form.end_time} onChange={e => update('end_time', e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-md" />
                </div>
              </div>
            </div>
          </div>

          {/* === Section 2: Masa berlaku voucher === */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Tentukan masa berlaku voucher</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" checked={form.validity_type === 'days_after_claim'} onChange={() => update('validity_type', 'days_after_claim')} className="text-eglux-secondary" />
                <span className="text-sm text-gray-700">Jumlah hari setelah voucher diklaim</span>
                {form.validity_type === 'days_after_claim' && (
                  <div className="flex items-center gap-1 ml-2">
                    <button onClick={() => update('validity_days', Math.max(1, form.validity_days - 1))} className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center cursor-pointer">−</button>
                    <input type="number" value={form.validity_days} onChange={e => update('validity_days', Number(e.target.value))} className="w-16 text-center px-2 py-1.5 text-sm border-y border-gray-300" />
                    <button onClick={() => update('validity_days', form.validity_days + 1)} className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center cursor-pointer">+</button>
                    <span className="text-sm text-gray-500 ml-1">hari</span>
                  </div>
                )}
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" checked={form.validity_type === 'date_range'} onChange={() => update('validity_type', 'date_range')} className="text-eglux-secondary" />
                <span className="text-sm text-gray-700">Rentang tanggal tertentu (GMT+7)</span>
              </label>
            </div>
          </div>

          {/* === Section 3: Pengaturan voucher === */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Pengaturan voucher</h3>
            {/* Type selection cards */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => update('discount_type', 'fixed')}
                className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${form.discount_type === 'fixed' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${form.discount_type === 'fixed' ? 'border-eglux-secondary bg-eglux-secondary' : 'border-gray-300'}`} />
                  <span className={`text-sm font-bold ${form.discount_type === 'fixed' ? 'text-eglux-secondary' : 'text-gray-600'}`}>Potongan dana</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <p className="text-[0.6rem] text-gray-400">Dari EGLUX</p>
                  <p className={`text-sm font-bold ${form.discount_type === 'fixed' ? 'text-red-500' : 'text-gray-400'}`}>Diskon {form.discount_type === 'fixed' && form.discount_value ? formatPrice(form.discount_value) : '—'}</p>
                  <p className="text-[0.6rem] text-gray-400">Min. belanja {form.min_purchase_type === 'set' && form.min_purchase ? formatPrice(form.min_purchase) : '—'}</p>
                  <button className={`mt-1 px-3 py-1 rounded text-[0.65rem] font-bold ${form.discount_type === 'fixed' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'}`}>Klaim</button>
                </div>
              </button>
              <button
                onClick={() => update('discount_type', 'percentage')}
                className={`p-4 rounded-lg border-2 text-left transition-all cursor-pointer ${form.discount_type === 'percentage' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${form.discount_type === 'percentage' ? 'border-eglux-secondary bg-eglux-secondary' : 'border-gray-300'}`} />
                  <span className={`text-sm font-bold ${form.discount_type === 'percentage' ? 'text-eglux-secondary' : 'text-gray-600'}`}>Persentase diskon</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-gray-100">
                  <p className="text-[0.6rem] text-gray-400">Dari EGLUX</p>
                  <p className={`text-sm font-bold ${form.discount_type === 'percentage' ? 'text-red-500' : 'text-gray-400'}`}>Diskon {form.discount_type === 'percentage' && form.discount_value ? form.discount_value + '%' : '—%'}</p>
                  <p className="text-[0.6rem] text-gray-400">Min. belanja {form.min_purchase_type === 'set' && form.min_purchase ? formatPrice(form.min_purchase) : '—'}</p>
                  <button className={`mt-1 px-3 py-1 rounded text-[0.65rem] font-bold ${form.discount_type === 'percentage' ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400'}`}>Klaim</button>
                </div>
              </button>
            </div>

            {/* Jumlah diskon */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah diskon</label>
              {form.discount_type === 'fixed' ? (
                <div className="flex items-center">
                  <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md">Rp</span>
                  <input type="number" value={form.discount_value} onChange={e => update('discount_value', e.target.value)} placeholder="Masukkan angka" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-r-md" />
                </div>
              ) : (
                <div className="flex items-center">
                  <input type="number" value={form.discount_value} onChange={e => update('discount_value', e.target.value)} placeholder="Masukkan angka" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-l-md" />
                  <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border border-l-0 border-gray-300 rounded-r-md">%</span>
                </div>
              )}
              {form.discount_type === 'fixed' && <p className="text-xs text-gray-400 mt-1">Untuk membuat promo yang menarik, diskon minimal Rp100.</p>}
              {form.discount_type === 'percentage' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Maksimal diskon (opsional, untuk cap persentase)</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md">Rp</span>
                    <input type="number" value={form.max_discount} onChange={e => update('max_discount', e.target.value)} placeholder="Tanpa batas" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-r-md" />
                  </div>
                </div>
              )}
            </div>

            {/* Minimum belanja */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Minimum belanja ⓘ</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.min_purchase_type === 'set'} onChange={() => update('min_purchase_type', 'set')} className="text-eglux-secondary" />
                  <span className="text-sm text-gray-700">Tetapkan nilai</span>
                </label>
                {form.min_purchase_type === 'set' && (
                  <div className="flex items-center ml-6">
                    <span className="px-3 py-2 text-sm text-gray-500 bg-gray-100 border border-r-0 border-gray-300 rounded-l-md">Rp</span>
                    <input type="number" value={form.min_purchase} onChange={e => update('min_purchase', e.target.value)} placeholder="Masukkan angka" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-r-md" />
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={form.min_purchase_type === 'none'} onChange={() => update('min_purchase_type', 'none')} className="text-eglux-secondary" />
                  <span className="text-sm text-gray-700">Tanpa belanja minimum</span>
                </label>
              </div>
            </div>
          </div>

          {/* === Section 4: Kuota & Batasan === */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Kuota & Batasan</h3>
            <div className="space-y-4">
              {/* Kuota Klaim */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kuota Klaim</label>
                <input type="number" value={form.quota_total} onChange={e => update('quota_total', e.target.value)} placeholder="Kosongkan untuk unlimited" max={9999999} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md" />
                <p className="text-xs text-gray-400 mt-1">Maksimal 9.999.999 voucher bisa diklaim</p>
              </div>
              {/* Perkiraan biaya */}
              <div>
                <p className="text-sm font-medium text-gray-700">Perkiraan biaya: <span className="font-bold text-gray-900">{formatPrice(estimatedCost)}</span></p>
                <p className="text-xs text-gray-400">Biaya yang Anda tanggung saat voucher digunakan sepenuhnya</p>
              </div>
              {/* Batas klaim per pengguna */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Batas klaim per pengguna ⓘ</label>
                <div className="flex items-center gap-1">
                  <button onClick={() => update('quota_per_user', Math.max(1, form.quota_per_user - 1))} className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center cursor-pointer">−</button>
                  <input type="number" value={form.quota_per_user} onChange={e => update('quota_per_user', Number(e.target.value))} className="w-20 text-center px-2 py-1.5 text-sm border-y border-gray-300" />
                  <button onClick={() => update('quota_per_user', form.quota_per_user + 1)} className="w-8 h-8 border border-gray-300 rounded flex items-center justify-center cursor-pointer">+</button>
                </div>
              </div>
              {/* Berlaku untuk */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Berlaku untuk</label>
                <p className="text-xs text-gray-500 mb-3">Voucher bisa diterapkan pada semua produk atau pilihan di toko Anda. Saat ini, pembeli hanya bisa menggunakan satu voucher per pesanan.</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`p-3 rounded-lg border-2 cursor-pointer flex items-center gap-2 ${form.applicable_type === 'all' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                    <input type="radio" checked={form.applicable_type === 'all'} onChange={() => update('applicable_type', 'all')} className="text-eglux-secondary" />
                    <span className="text-sm font-medium text-gray-700">Semua produk</span>
                  </label>
                  <label className={`p-3 rounded-lg border-2 cursor-pointer flex items-center gap-2 ${form.applicable_type === 'specific' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                    <input type="radio" checked={form.applicable_type === 'specific'} onChange={() => update('applicable_type', 'specific')} className="text-eglux-secondary" />
                    <span className="text-sm font-medium text-gray-700">Produk tertentu</span>
                  </label>
                </div>
                {form.applicable_type === 'specific' && (
                  <p className="text-xs text-amber-600 mt-2">⚠ Pemilihan produk tertentu belum tersedia. Voucher akan berlaku untuk semua produk sementara.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">Batal</button>
          <button onClick={handleSubmit} disabled={saving || !form.name || !form.discount_value || !form.end_date} className="px-6 py-2 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 disabled:opacity-50 cursor-pointer">
            {saving ? '⏳ Menyimpan...' : 'Simpan Voucher'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const DiscountManagementPanel = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState('discount');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [discountModalVariant, setDiscountModalVariant] = useState(null);
  const [selectedVariants, setSelectedVariants] = useState(new Set());
  const [bulkClearing, setBulkClearing] = useState(false);

  // Voucher state
  const [vouchers, setVouchers] = useState([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [showVoucherForm, setShowVoucherForm] = useState(false);

  // ── Fetch products ──
  const fetchProducts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: e } = await supabase.from('products').select(`
        id, name, slug, category, is_active,
        product_variants (id, name, price, stock, is_active, discount_type, discount_value, discount_start_at, discount_end_at)
      `).order('name');
      if (e) throw e;
      setProducts(data || []);
    } catch (e) { setError(friendlyErrorMessage(e, 'Memuat produk')); }
    finally { setLoading(false); }
  }, []);

  // ── Fetch vouchers ──
  const fetchVouchers = useCallback(async () => {
    setVouchersLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      if (!token) return;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-voucher`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const result = await resp.json();
      if (result.success) setVouchers(result.vouchers || []);
    } catch (e) { console.error('[Voucher] fetch error:', e?.message); }
    finally { setVouchersLoading(false); }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { if (activeTab === 'voucher') fetchVouchers(); }, [activeTab, fetchVouchers]);

  const allVariants = useMemo(() => {
    const list = [];
    products.forEach(p => (p.product_variants || []).forEach(v => list.push({ ...v, product_name: p.name, product_slug: p.slug })));
    return list;
  }, [products]);

  const filteredVariants = useMemo(() => {
    let r = allVariants;
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); r = r.filter(v => v.product_name?.toLowerCase().includes(q) || v.name?.toLowerCase().includes(q)); }
    if (filterStatus !== 'all') r = r.filter(v => getDiscountStatus(v).status === filterStatus);
    return r;
  }, [allVariants, searchQuery, filterStatus]);

  const stats = useMemo(() => {
    let active = 0, scheduled = 0, expired = 0, none = 0;
    allVariants.forEach(v => { const s = getDiscountStatus(v).status; if (s === 'active') active++; else if (s === 'scheduled') scheduled++; else if (s === 'expired') expired++; else none++; });
    return { total: allVariants.length, active, scheduled, expired, none };
  }, [allVariants]);

  const handleBulkClear = async () => {
    if (selectedVariants.size === 0 || !confirm(`Hapus discount untuk ${selectedVariants.size} variant?`)) return;
    setBulkClearing(true);
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      for (const vid of selectedVariants) {
        await fetch(`${SUPABASE_URL}/functions/v1/set-variant-discount`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ variant_id: vid, discount_type: null, discount_value: null, discount_start_at: null, discount_end_at: null }),
        });
      }
      showToast?.(`✓ ${selectedVariants.size} discount dihapus`, 'success');
      setSelectedVariants(new Set()); fetchProducts();
    } catch (e) { showToast?.('Gagal: ' + e.message, 'error'); }
    finally { setBulkClearing(false); }
  };

  const toggleVariant = (id) => setSelectedVariants(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelectedVariants(selectedVariants.size === filteredVariants.length ? new Set() : new Set(filteredVariants.map(v => v.id)));

  // ── Voucher actions ──
  const handleDeleteVoucher = async (id) => {
    if (!confirm('Hapus voucher ini?')) return;
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch(`${SUPABASE_URL}/functions/v1/manage-voucher`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', voucher_id: id }),
      });
      showToast?.('✓ Voucher dihapus', 'success'); fetchVouchers();
    } catch (e) { showToast?.('Gagal: ' + e.message, 'error'); }
  };

  const handleToggleVoucher = async (id, isActive) => {
    try {
      const token = (await supabase.auth.getSession()).data?.session?.access_token;
      await fetch(`${SUPABASE_URL}/functions/v1/manage-voucher`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', voucher_id: id, is_active: !isActive }),
      });
      fetchVouchers();
    } catch (e) { showToast?.('Gagal: ' + e.message, 'error'); }
  };

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        <button onClick={() => setActiveTab('discount')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'discount' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>🏷️ Discount</button>
        <button onClick={() => setActiveTab('voucher')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'voucher' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>🎟️ Voucher</button>
      </div>

      {/* === DISCOUNT TAB === */}
      {activeTab === 'discount' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500 uppercase">Total</p><p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p></div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4"><p className="text-xs text-green-600 uppercase">Active</p><p className="text-2xl font-bold text-green-700 mt-1">{stats.active}</p></div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4"><p className="text-xs text-blue-600 uppercase">Scheduled</p><p className="text-2xl font-bold text-blue-700 mt-1">{stats.scheduled}</p></div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="text-xs text-red-600 uppercase">Expired</p><p className="text-2xl font-bold text-red-700 mt-1">{stats.expired}</p></div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4"><p className="text-xs text-gray-500 uppercase">No Discount</p><p className="text-2xl font-bold text-gray-600 mt-1">{stats.none}</p></div>
          </div>

          <section className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input type="text" placeholder="🔍 Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-md" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-md">
                <option value="all">All ({stats.total})</option><option value="active">Active ({stats.active})</option><option value="scheduled">Scheduled ({stats.scheduled})</option><option value="expired">Expired ({stats.expired})</option><option value="none">No Discount ({stats.none})</option>
              </select>
            </div>
          </section>

          {selectedVariants.size > 0 && (
            <section className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-red-900">{selectedVariants.size} variant terpilih</span>
              <div className="flex gap-2">
                <button onClick={handleBulkClear} disabled={bulkClearing} className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-100 disabled:opacity-50 cursor-pointer">{bulkClearing ? '⏳...' : '🗑 Hapus Discount'}</button>
                <button onClick={() => setSelectedVariants(new Set())} className="px-3 py-1.5 text-sm text-gray-600 cursor-pointer">Batal</button>
              </div>
            </section>
          )}

          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" /></div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="text-sm text-red-600">{error}</p><button onClick={fetchProducts} className="mt-2 text-xs text-red-700 font-semibold hover:underline">Coba lagi</button></div>
          ) : filteredVariants.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center"><p className="text-gray-500">Tidak ada variant.</p></div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-10"><input type="checkbox" checked={selectedVariants.size === filteredVariants.length && filteredVariants.length > 0} onChange={toggleSelectAll} className="cursor-pointer" /></th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product / Variant</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Original</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Discount</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Effective</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVariants.map(v => {
                    const st = getDiscountStatus(v); const pct = getDiscountPercent(v); const has = st.status !== 'none';
                    const eff = has && st.status === 'active' ? (v.discount_type === 'percentage' ? Math.max(0, Math.round(Number(v.price) - Number(v.price) * Number(v.discount_value) / 100)) : v.discount_type === 'nominal' ? Math.max(0, Number(v.price) - Number(v.discount_value)) : Number(v.discount_value)) : Number(v.price);
                    return (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="px-3 py-3"><input type="checkbox" checked={selectedVariants.has(v.id)} onChange={() => toggleVariant(v.id)} className="cursor-pointer" /></td>
                        <td className="px-3 py-3"><p className="text-sm font-medium text-gray-900">{v.product_name}</p><p className="text-xs text-gray-500">{v.name}</p></td>
                        <td className="px-3 py-3 text-sm text-gray-700">{formatPrice(v.price)}</td>
                        <td className="px-3 py-3">{has ? <p className="text-sm font-semibold text-red-600">-{pct}%</p> : <span className="text-sm text-gray-400">—</span>}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-gray-900">{formatPrice(eff)}</td>
                        <td className="px-3 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-[0.7rem] font-semibold ${st.cls}`}>{st.label}</span></td>
                        <td className="px-3 py-3 text-right"><button onClick={() => setDiscountModalVariant(v)} className="px-3 py-1.5 text-xs font-semibold text-eglux-secondary bg-white border border-eglux-secondary/30 rounded-md hover:bg-eglux-secondary hover:text-white transition-colors cursor-pointer">{has ? '✏ Edit' : '+ Set'}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* === VOUCHER TAB === */}
      {activeTab === 'voucher' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">{vouchers.length} voucher tersimpan</p>
            <button onClick={() => setShowVoucherForm(true)} className="px-4 py-2 text-sm font-bold text-white bg-eglux-primary rounded-md hover:opacity-90 cursor-pointer">+ Buat Voucher</button>
          </div>

          {vouchersLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" /></div>
          ) : vouchers.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
              <div className="text-4xl mb-3">🎟️</div>
              <p className="text-gray-700 font-medium mb-1">Belum ada voucher</p>
              <p className="text-sm text-gray-400 mb-5">Buat voucher pertama untuk customer Anda</p>
              <button onClick={() => setShowVoucherForm(true)} className="px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-sm font-bold hover:opacity-90 cursor-pointer">+ Buat Voucher</button>
            </div>
          ) : (
            <div className="space-y-3">
              {vouchers.map(v => {
                const st = getVoucherStatus(v);
                return (
                  <div key={v.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-bold text-gray-900 truncate">{v.name}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${st.cls}`}>{st.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">Code: <span className="font-mono font-semibold text-eglux-secondary">{v.code}</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {v.discount_type === 'fixed' ? formatPrice(v.discount_value) : `${v.discount_value}%`}
                        {v.min_purchase > 0 ? ` · Min: ${formatPrice(v.min_purchase)}` : ''}
                        {v.quota_total ? ` · Kuota: ${v.quota_total}` : ' · Unlimited'}
                      </p>
                      <p className="text-[0.7rem] text-gray-400 mt-0.5">{formatDate(v.start_at)} — {formatDate(v.end_at)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleToggleVoucher(v.id, v.is_active)} className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${v.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${v.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={() => handleDeleteVoucher(v.id)} className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded cursor-pointer border-none bg-transparent">🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Discount Modal */}
      {discountModalVariant && <DiscountModal variant={discountModalVariant} onClose={() => setDiscountModalVariant(null)} onSaved={() => { fetchProducts(); setDiscountModalVariant(null); }} />}

      {/* Voucher Form */}
      {showVoucherForm && <VoucherForm onClose={() => setShowVoucherForm(false)} onSaved={() => { setShowVoucherForm(false); fetchVouchers(); }} showToast={showToast} />}
    </div>
  );
};

export default DiscountManagementPanel;
