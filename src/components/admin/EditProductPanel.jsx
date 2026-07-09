// src/components/admin/EditProductPanel.jsx
// ============================================================================
// Shopee/Tokopedia-style Product Edit Panel
// ============================================================================
// Slide-in panel dari kanan. Form-based dengan sections:
//   1. Product Photos (grid upload, set primary, delete)
//   2. Product Info (name, category, description, badge, status)
//   3. Variants (card-based: photo + name + price + stock + weight + sku + dim)
//   4. Save button (batch update semua perubahan sekaligus)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const formatPrice = (v) => {
  if (!v && v !== 0) return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
};

const CATEGORIES = ['kitchen', 'storage', 'homedecor', 'bathroom'];
const BADGES = ['', 'Best Seller', 'Baru'];

const EditProductPanel = ({ product, onClose, onSaved }) => {
  // Product form state
  const [formData, setFormData] = useState({
    name: '', slug: '', category: '', description: '',
    base_price: 0, weight_in_gram: 0, badge: '', is_active: true,
  });

  // Variants state (array of variant objects with editable fields)
  const [variants, setVariants] = useState([]);
  const [productImages, setProductImages] = useState([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ============================================================================
  // INIT: populate form saat product berubah
  // ============================================================================
  useEffect(() => {
    if (!product) return;
    setFormData({
      name: product.name || '',
      slug: product.slug || '',
      category: product.category || '',
      description: product.description || '',
      base_price: product.base_price || 0,
      weight_in_gram: product.weight_in_gram || 0,
      badge: product.badge || '',
      is_active: product.is_active ?? true,
    });
    setVariants(
      (product.product_variants || []).map((v) => ({
        ...v,
        price: v.price || 0,
        stock: v.stock || 0,
        weight_in_gram: v.weight_in_gram || 0,
        length_cm: v.length_cm || '',
        width_cm: v.width_cm || '',
        height_cm: v.height_cm || '',
        _changed: false,
      }))
    );
    setProductImages(product.product_images || []);
  }, [product]);

  // ============================================================================
  // FORM HANDLERS
  // ============================================================================
  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateVariant = (variantId, field, value) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variantId ? { ...v, [field]: value, _changed: true } : v
      )
    );
  };

  // ============================================================================
  // PHOTO UPLOAD (product-level)
  // ============================================================================
  const uploadPhoto = async (file, variantId = null) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const folder = variantId ? `variants/${variantId}` : product.id;
      const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `products/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      const existingImages = variantId
        ? productImages.filter((img) => img.variant_id === variantId)
        : productImages.filter((img) => !img.variant_id);

      const { error: dbError } = await supabase
        .from('product_images')
        .insert({
          product_id: product.id,
          url: urlData.publicUrl,
          position: 0,
          is_primary: existingImages.length === 0,
          variant_id: variantId,
        });
      if (dbError) throw dbError;

      showToast('✓ Foto diupload', 'success');
      onSaved(); // refresh parent
    } catch (e) {
      showToast(`✗ Upload gagal: ${e.message}`, 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const setPrimaryPhoto = async (imageId) => {
    try {
      await supabase.from('product_images').update({ is_primary: false }).eq('product_id', product.id);
      await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId);
      showToast('✓ Primary diubah', 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  const deletePhoto = async (imageId, imageUrl) => {
    if (!confirm('Hapus foto ini?')) return;
    try {
      const urlObj = new URL(imageUrl);
      const pathMatch = urlObj.pathname.match(/\/product-images\/(.+)/);
      if (pathMatch) await supabase.storage.from('product-images').remove([pathMatch[1]]);
      await supabase.from('product_images').delete().eq('id', imageId);
      showToast('✓ Foto dihapus', 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // ADD VARIANT
  // ============================================================================
  const addVariant = async () => {
    const name = prompt('Nama variant baru:');
    if (!name) return;
    const price = prompt('Harga variant (harus < base price):', '0');
    if (price === null) return;

    try {
      const { data, error } = await supabase
        .from('product_variants')
        .insert({
          product_id: product.id,
          name,
          attributes: {},
          price: Number(price),
          stock: 0,
          sku: `EGL-NEW-${Date.now().toString().slice(-6)}`,
          is_active: false,
          weight_in_gram: null,
        })
        .select()
        .single();

      if (error) throw error;
      showToast(`✓ Variant "${name}" ditambahkan`, 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // DELETE VARIANT
  // ============================================================================
  const deleteVariant = async (variantId, variantName) => {
    if (!confirm(`Hapus variant "${variantName}"? Stok dan data variant akan hilang.`)) return;
    try {
      await supabase.from('product_variants').delete().eq('id', variantId);
      showToast(`✓ Variant dihapus`, 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // SAVE ALL CHANGES (batch update)
  // ============================================================================
  const handleSave = async () => {
    setSaving(true);
    const updates = [];

    // Product update
    updates.push({
      type: 'product',
      slug: formData.slug,
      fields: {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        base_price: Number(formData.base_price),
        weight_in_gram: Number(formData.weight_in_gram),
        badge: formData.badge || null,
        is_active: formData.is_active,
      },
    });

    // Variant updates (only changed ones)
    for (const v of variants) {
      if (!v._changed) continue;
      updates.push({
        type: 'variant',
        id: v.id,
        fields: {
          name: v.name,
          price: Number(v.price),
          stock: parseInt(v.stock, 10),
          weight_in_gram: v.weight_in_gram ? parseInt(v.weight_in_gram, 10) : null,
          sku: v.sku,
          length_cm: v.length_cm ? parseFloat(v.length_cm) : null,
          width_cm: v.width_cm ? parseFloat(v.width_cm) : null,
          height_cm: v.height_cm ? parseFloat(v.height_cm) : null,
          is_active: v.is_active,
        },
      });
    }

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/bulk-update-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });
      const result = await resp.json();

      if (result.success) {
        showToast(`✓ ${result.success_count} perubahan tersimpan`, 'success');
        onSaved();
        setTimeout(() => onClose(), 800);
      } else {
        showToast(`✗ ${result.error_count} error. Cek console.`, 'error');
        console.error('Save errors:', result.results);
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  if (!product) return null;

  const coverImages = productImages.filter((img) => !img.variant_id);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[3000]"
        onClick={onClose}
      />

      {/* Panel — slide from right */}
      <div className="fixed top-0 right-0 w-full md:w-[600px] h-screen bg-white z-[3001] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Produk</h2>
            <p className="text-xs text-gray-500 truncate max-w-[300px]">{formData.name}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '⏳ Menyimpan...' : '💾 Simpan'}
            </button>
          </div>
        </div>

        <div className="flex-1 px-6 py-6 space-y-8">
          {/* === SECTION 1: PRODUCT PHOTOS === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              📸 Foto Produk (Cover)
            </h3>
            <div className="flex flex-wrap gap-3">
              {coverImages.map((img) => (
                <div key={img.id} className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {img.is_primary && (
                    <span className="absolute top-0 left-0 bg-amber-500 text-white text-[0.6rem] px-1.5 py-0.5 rounded-br font-bold">
                      ★ UTAMA
                    </span>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                    {!img.is_primary && (
                      <button
                        onClick={() => setPrimaryPhoto(img.id)}
                        className="text-[0.65rem] text-white bg-amber-600 px-2 py-0.5 rounded hover:bg-amber-700"
                      >
                        Jadikan Utama
                      </button>
                    )}
                    <button
                      onClick={() => deletePhoto(img.id, img.url)}
                      className="text-[0.65rem] text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
              {/* Upload button */}
              <label className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                {uploadingPhoto ? (
                  <span className="text-xs text-gray-400">⏳</span>
                ) : (
                  <>
                    <span className="text-2xl text-gray-400">+</span>
                    <span className="text-[0.65rem] text-gray-400 mt-1">Upload</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadPhoto(e.target.files[0])}
                  disabled={uploadingPhoto}
                />
              </label>
            </div>
          </section>

          {/* === SECTION 2: PRODUCT INFO === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3">📝 Informasi Produk</h3>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nama Produk</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Category + Badge */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                  <select
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Pilih —</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Badge</label>
                  <select
                    value={formData.badge}
                    onChange={(e) => updateField('badge', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {BADGES.map((b) => (
                      <option key={b} value={b}>{b || '— Tidak ada —'}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Base Price + Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Harga Dasar (Rp) <span className="text-gray-400">— strike-through</span>
                  </label>
                  <input
                    type="number"
                    value={formData.base_price}
                    onChange={(e) => updateField('base_price', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Berat Default (gram) <span className="text-gray-400">— fallback</span>
                  </label>
                  <input
                    type="number"
                    value={formData.weight_in_gram}
                    onChange={(e) => updateField('weight_in_gram', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Status:</label>
                <button
                  onClick={() => updateField('is_active', !formData.is_active)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                    formData.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    formData.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-xs text-gray-600">{formData.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </section>

          {/* === SECTION 3: VARIANTS (card-based, Shopee pattern) === */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">📦 Varian ({variants.length})</h3>
              <button
                onClick={addVariant}
                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
              >
                + Tambah Varian
              </button>
            </div>

            {variants.length === 0 ? (
              <p className="text-sm text-gray-400 italic py-4 text-center bg-gray-50 rounded-lg">
                Belum ada varian. Klik "+ Tambah Varian" untuk menambah.
              </p>
            ) : (
              <div className="space-y-4">
                {variants.map((v, idx) => {
                  const variantImages = productImages.filter((img) => img.variant_id === v.id);
                  return (
                    <div key={v.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      {/* Variant header */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-700">Varian {idx + 1}</span>
                        <div className="flex items-center gap-2">
                          {/* Active toggle */}
                          <button
                            onClick={() => updateVariant(v.id, 'is_active', !v.is_active)}
                            className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                              v.is_active ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                              v.is_active ? 'translate-x-5' : 'translate-x-1'
                            }`} />
                          </button>
                          <button
                            onClick={() => deleteVariant(v.id, v.name)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            🗑 Hapus
                          </button>
                        </div>
                      </div>

                      {/* Variant photo thumbnail + fields */}
                      <div className="flex gap-3">
                        {/* Photo */}
                        <div className="flex-shrink-0">
                          <label className="block w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-300 cursor-pointer hover:border-blue-400 relative group">
                            {variantImages.length > 0 ? (
                              <img src={variantImages[0].url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-white">
                                <span className="text-xl text-gray-300">📷</span>
                                <span className="text-[0.55rem] text-gray-400 mt-0.5">Upload</span>
                              </div>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => uploadPhoto(e.target.files[0], v.id)}
                            />
                          </label>
                          {variantImages.length > 1 && (
                            <span className="text-[0.55rem] text-gray-400 text-center block mt-0.5">
                              +{variantImages.length - 1} foto
                            </span>
                          )}
                        </div>

                        {/* Fields */}
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Nama Varian</label>
                            <input
                              type="text"
                              value={v.name || ''}
                              onChange={(e) => updateVariant(v.id, 'name', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Harga (Rp)</label>
                            <input
                              type="number"
                              value={v.price}
                              onChange={(e) => updateVariant(v.id, 'price', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Stok</label>
                            <input
                              type="number"
                              value={v.stock}
                              onChange={(e) => updateVariant(v.id, 'stock', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Berat (gram)</label>
                            <input
                              type="number"
                              value={v.weight_in_gram || ''}
                              onChange={(e) => updateVariant(v.id, 'weight_in_gram', e.target.value)}
                              placeholder="wajib untuk active"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">SKU</label>
                            <input
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) => updateVariant(v.id, 'sku', e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">
                              Dimensi (cm) — opsional, untuk volumetric Biteship
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={v.length_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'length_cm', e.target.value)}
                                placeholder="P"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-gray-400">×</span>
                              <input
                                type="number"
                                value={v.width_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'width_cm', e.target.value)}
                                placeholder="L"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-gray-400">×</span>
                              <input
                                type="number"
                                value={v.height_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'height_cm', e.target.value)}
                                placeholder="T"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Variant preview price */}
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {Number(v.price) < Number(formData.base_price) ? (
                            <>
                              <span className="line-through text-gray-400">{formatPrice(formData.base_price)}</span>
                              {' → '}
                              <span className="font-bold text-eglux-secondary">{formatPrice(v.price)}</span>
                              {' '}
                              <span className="text-red-500">
                                -{Math.round(((formData.base_price - v.price) / formData.base_price) * 100)}%
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400">Harga varian ≥ base price (cek diskon model)</span>
                          )}
                        </span>
                        <span className={`text-[0.65rem] px-2 py-0.5 rounded-full ${
                          v.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {v.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer (sticky) */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[3100] px-4 py-2 rounded-md shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          'bg-gray-800 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </>
  );
};

export default EditProductPanel;
