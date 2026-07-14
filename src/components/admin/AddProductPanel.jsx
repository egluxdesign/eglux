// src/components/admin/EditProductPanel.jsx (tambah AddProductPanel di file ini)
// atau src/components/admin/AddProductPanel.jsx (file terpisah)
// ============================================================================
// AddProductPanel — slide-in panel untuk CREATE new product (mirip EditProductPanel
// tapi empty form, mode create).
//
// Pemakaian:
//   <AddProductPanel
//     isOpen={showAddPanel}
//     onClose={() => setShowAddPanel(false)}
//     onCreated={fetchProducts}
//   />
//
// Fitur:
//   - Form: name, slug (auto-generate), category, base_price, weight_in_gram,
//     badge, description, is_active
//   - Optional initial variant: name, price, stock, weight, SKU, dimensions
//   - Validation client-side + server-side
//   - Submit → call create-product edge function
//   - Setelah success → onCreated() untuk refresh table + onClose()
// ============================================================================

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helper: slugify (sama dengan backend) ──
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Helper: format rupiah ──
function formatRupiah(v) {
  if (!v && v !== 0) return '';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
}

// ── Categories (sesuai docs: kitchen / storage / homedecor / bathroom) ──
const CATEGORIES = ['kitchen', 'storage', 'homedecor', 'bathroom'];
const BADGES = ['', 'Best Seller', 'Baru'];

const AddProductPanel = ({ isOpen, onClose, onCreated }) => {
  // ── Product form state ──
  const [form, setForm] = useState({
    name: '',
    slug: '',
    slugTouched: false, // true kalau user manual edit slug
    category: 'kitchen',
    base_price: '',
    weight_in_gram: '',
    badge: '',
    description: '',
    is_active: false,
  });

  // ── Initial variant (optional) ──
  const [withVariant, setWithVariant] = useState(true);
  const [variant, setVariant] = useState({
    name: 'Default',
    price: '',
    stock: '',
    weight_in_gram: '', // kosong = fallback ke product weight
    sku: '',
    is_active: false,
    length_cm: '',
    width_cm: '',
    height_cm: '',
  });

  // ── Submit state ──
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Auto-generate slug dari name (kalau user belum manual edit slug) ──
  useEffect(() => {
    if (!form.slugTouched && form.name) {
      setForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
    }
  }, [form.name, form.slugTouched]);

  // ── Reset form saat panel close ──
  useEffect(() => {
    if (!isOpen) {
      setForm({
        name: '', slug: '', slugTouched: false,
        category: 'kitchen', base_price: '', weight_in_gram: '',
        badge: '', description: '', is_active: false,
      });
      setVariant({
        name: 'Default', price: '', stock: '', weight_in_gram: '',
        sku: '', is_active: false, length_cm: '', width_cm: '', height_cm: '',
      });
      setWithVariant(true);
      setError(null);
    }
  }, [isOpen]);

  // ── Validation ──
  const validate = () => {
    const errs = [];
    if (!form.name.trim()) errs.push('Nama produk wajib diisi');
    if (!form.category.trim()) errs.push('Kategori wajib diisi');
    if (!form.base_price || Number(form.base_price) < 0) errs.push('Base price wajib diisi (≥ 0)');
    if (!form.weight_in_gram || Number(form.weight_in_gram) < 0) errs.push('Berat (gram) wajib diisi (≥ 0)');

    if (withVariant) {
      if (!variant.name.trim()) errs.push('Nama varian wajib diisi');
      if (variant.price === '' || Number(variant.price) < 0) errs.push('Harga varian wajib diisi (≥ 0)');
      if (variant.stock === '' || Number(variant.stock) < 0) errs.push('Stok varian wajib diisi (≥ 0)');
      if (Number(variant.price) > Number(form.base_price)) {
        errs.push('Harga varian tidak boleh > base price');
      }
      if (variant.is_active && (!variant.weight_in_gram || Number(variant.weight_in_gram) <= 0) && (!form.weight_in_gram || Number(form.weight_in_gram) <= 0)) {
        errs.push('Varian aktif wajib punya berat > 0 (isi berat varian atau produk)');
      }
    }
    return errs;
  };

  const validationErrors = useMemo(() => validate(), [form, variant, withVariant]);

  // ── Submit handler ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (validationErrors.length > 0) {
      setError(validationErrors.join(' • '));
      return;
    }

    setSaving(true);
    try {
      // Get current session JWT for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sesi login habis. Login ulang dulu.');
        setSaving(false);
        return;
      }

      const payload = {
        product: {
          name: form.name.trim(),
          slug: form.slug.trim() || slugify(form.name),
          category: form.category.trim(),
          base_price: Number(form.base_price),
          weight_in_gram: Number(form.weight_in_gram),
          badge: form.badge || null,
          description: form.description.trim() || null,
          is_active: form.is_active,
        },
        variant: withVariant ? {
          name: variant.name.trim(),
          price: Number(variant.price),
          stock: parseInt(variant.stock, 10),
          weight_in_gram: variant.weight_in_gram ? Number(variant.weight_in_gram) : null,
          sku: variant.sku.trim() || null,
          is_active: variant.is_active,
          length_cm: variant.length_cm ? Number(variant.length_cm) : null,
          width_cm: variant.width_cm ? Number(variant.width_cm) : null,
          height_cm: variant.height_cm ? Number(variant.height_cm) : null,
        } : null,
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-product`, {
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

      // Success — refresh table & close panel
      onCreated?.();
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-[1500]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — slide-in dari kanan */}
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white z-[1501]
                   shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Tambah Produk Baru"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">+ Tambah Produk Baru</h2>
            <p className="text-xs text-gray-500 mt-0.5">Buat produk baru + varian awal (opsional)</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Tutup"
            className="w-9 h-9 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* === SECTION: INFORMASI PRODUK === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 pb-2 border-b border-gray-200">
              📦 Informasi Produk
            </h3>

            {/* Name */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nama Produk *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Toples Pita Lucu"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Slug */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Slug (URL) *
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value, slugTouched: true })}
                placeholder="auto-generate dari nama"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">
                Auto-generate dari nama. Bisa edit manual. Unique ID untuk URL produk.
              </p>
            </div>

            {/* Category + Badge */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Kategori *
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Badge
                </label>
                <select
                  value={form.badge}
                  onChange={(e) => setForm({ ...form, badge: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                >
                  {BADGES.map((b) => (
                    <option key={b} value={b}>{b || '— Tidak ada —'}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Base Price + Weight */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Base Price (Rp) *
                </label>
                <input
                  type="number"
                  value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                  placeholder="95000"
                  min="0"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                />
                {form.base_price && (
                  <p className="text-xs text-gray-500 mt-1">{formatRupiah(form.base_price)}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Berat (gram) *
                </label>
                <input
                  type="number"
                  value={form.weight_in_gram}
                  onChange={(e) => setForm({ ...form, weight_in_gram: e.target.value })}
                  placeholder="800"
                  min="0"
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Description */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Deskripsi
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Deskripsi produk (opsional)"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>

            {/* Is Active */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="cursor-pointer"
              />
              <span className="text-sm text-gray-700">
                Aktifkan produk (tampil di katalog)
              </span>
            </label>
            <p className="text-xs text-gray-400 mt-1 ml-6">
              ⚠️ Disarankan <strong>OFF</strong> dulu sampai variant aktif & foto diupload. Nyalakan setelah siap.
            </p>
          </section>

          {/* === SECTION: VARIANT AWAL (OPTIONAL) === */}
          <section>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                🎨 Varian Awal (Opsional)
              </h3>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withVariant}
                  onChange={(e) => setWithVariant(e.target.checked)}
                  className="cursor-pointer"
                />
                <span className="text-xs text-gray-600">Buat varian</span>
              </label>
            </div>

            {withVariant && (
              <>
                <p className="text-xs text-gray-500 mb-3 bg-blue-50 p-2 rounded">
                  💡 Varian awal opsional. Kalau skip, kamu bisa tambah varian
                  via panel edit setelah produk dibuat.
                </p>

                {/* Variant Name */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nama Varian *
                  </label>
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => setVariant({ ...variant, name: e.target.value })}
                    placeholder="e.g., Ukuran L, Bening, Default"
                    required={withVariant}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Price + Stock */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Harga Varian (Rp) *
                    </label>
                    <input
                      type="number"
                      value={variant.price}
                      onChange={(e) => setVariant({ ...variant, price: e.target.value })}
                      placeholder="85000"
                      min="0"
                      required={withVariant}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                    {variant.price && (
                      <p className="text-xs text-gray-500 mt-1">{formatRupiah(variant.price)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Stok *
                    </label>
                    <input
                      type="number"
                      value={variant.stock}
                      onChange={(e) => setVariant({ ...variant, stock: e.target.value })}
                      placeholder="50"
                      min="0"
                      required={withVariant}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Weight + SKU */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Berat Varian (gram)
                    </label>
                    <input
                      type="number"
                      value={variant.weight_in_gram}
                      onChange={(e) => setVariant({ ...variant, weight_in_gram: e.target.value })}
                      placeholder="kosong = pakai berat produk"
                      min="0"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      SKU
                    </label>
                    <input
                      type="text"
                      value={variant.sku}
                      onChange={(e) => setVariant({ ...variant, sku: e.target.value })}
                      placeholder="opsional, unique"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                </div>

                {/* Dimensions (optional) */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Dimensi (cm) — opsional, untuk volumetric Biteship
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={variant.length_cm}
                      onChange={(e) => setVariant({ ...variant, length_cm: e.target.value })}
                      placeholder="P"
                      min="0"
                      step="0.1"
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={variant.width_cm}
                      onChange={(e) => setVariant({ ...variant, width_cm: e.target.value })}
                      placeholder="L"
                      min="0"
                      step="0.1"
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="number"
                      value={variant.height_cm}
                      onChange={(e) => setVariant({ ...variant, height_cm: e.target.value })}
                      placeholder="T"
                      min="0"
                      step="0.1"
                      className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Variant Is Active */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={variant.is_active}
                    onChange={(e) => setVariant({ ...variant, is_active: e.target.checked })}
                    className="cursor-pointer"
                  />
                  <span className="text-sm text-gray-700">
                    Aktifkan varian (bisa dipilih customer)
                  </span>
                </label>
                <p className="text-xs text-gray-400 mt-1 ml-6">
                  ⚠️ Varian aktif wajib punya berat {'>'} 0 (isi berat varian atau produk).
                </p>
              </>
            )}
          </section>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              ⚠ {error}
            </div>
          )}
        </form>

        {/* Footer — action buttons */}
        <div className="border-t border-gray-200 p-4 flex gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving || validationErrors.length > 0}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Menyimpan...
              </>
            ) : (
              '✓ Buat Produk'
            )}
          </button>
        </div>
      </aside>
    </>
  );
};

export default AddProductPanel;
