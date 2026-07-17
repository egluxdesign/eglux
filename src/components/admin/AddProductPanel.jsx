// src/components/admin/AddProductPanel.jsx
// ============================================================================
// AddProductPanel — slide-in panel untuk CREATE new product.
// UI PERSIS match dengan EditProductPanel (copy structure & styling).
//
// Perbedaan dengan EditProductPanel:
//   - Slug auto-generate dari name (no input user)
//   - Form empty (mode create, bukan edit)
//   - Submit → create-product edge function
//   - Setelah product created → upload semua foto yang ada di local state
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Helpers ──
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatPrice(v) {
  if (v === null || v === undefined || v === '') return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
}

const CATEGORIES = ['kitchen', 'storage', 'homedecor', 'bathroom'];
const BADGES = ['', 'Best Seller', 'Baru'];

const AddProductPanel = ({ isOpen, onClose, onCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    category: '',
    description: '',
    base_price: '',
    weight_in_gram: '',
    badge: '',
    is_active: false,
  });

  const [variants, setVariants] = useState([
    {
      id: 'new-1',
      name: 'Default',
      price: '',
      stock: '',
      weight_in_gram: '',
      sku: '',
      is_active: false,
      length_cm: '',
      width_cm: '',
      height_cm: '',
      _changed: true,
    },
  ]);

  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        name: '', slug: '', category: '', description: '',
        base_price: '', weight_in_gram: '', badge: '', is_active: false,
      });
      setVariants([{
        id: 'new-1', name: 'Default', price: '', stock: '',
        weight_in_gram: '', sku: '', is_active: false,
        length_cm: '', width_cm: '', height_cm: '', _changed: true,
      }]);
      setPendingPhotos([]);
      setToast(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (formData.name) {
      setFormData((prev) => ({ ...prev, slug: slugify(prev.name) }));
    }
  }, [formData.name]);

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

  const addVariant = () => {
    const newId = `new-${Date.now()}`;
    setVariants((prev) => [...prev, {
      id: newId,
      name: '',
      price: '',
      stock: '',
      weight_in_gram: '',
      sku: '',
      is_active: false,
      length_cm: '',
      width_cm: '',
      height_cm: '',
      _changed: true,
    }]);
  };

  const deleteVariant = (variantId) => {
    if (variants.length === 1) {
      showToast('Minimal 1 varian wajib ada', 'error');
      return;
    }
    if (!confirm('Hapus varian ini?')) return;
    setVariants((prev) => prev.filter((v) => v.id !== variantId));
    setPendingPhotos((prev) => prev.filter((p) => p.variant_id !== variantId));
  };

  const addPhoto = (file, variantId = null) => {
    if (!file) return;
    const photo = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      preview_url: URL.createObjectURL(file),
      variant_id: variantId,
    };
    setPendingPhotos((prev) => [...prev, photo]);
  };

  const addMultiplePhotos = (files, variantId = null) => {
    if (!files || files.length === 0) return;
    const newPhotos = Array.from(files).map((file) => ({
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      preview_url: URL.createObjectURL(file),
      variant_id: variantId,
    }));
    setPendingPhotos((prev) => [...prev, ...newPhotos]);
  };

  const removePhoto = (photoId) => {
    setPendingPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId);
      if (photo?.preview_url) URL.revokeObjectURL(photo.preview_url);
      return prev.filter((p) => p.id !== photoId);
    });
  };

  // ── Upload photos ke Storage setelah product created ──
  // FIX: pakai session.access_token milik user (bukan ANON_KEY statis),
  // supaya Edge Function bisa verifikasi identitas admin dengan benar.
  const uploadPendingPhotos = async (productId, variantIdMap) => {
    if (pendingPhotos.length === 0) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showToast('Sesi login habis, foto tidak bisa diupload', 'error');
      return;
    }

    setUploadingPhoto(true);
    let uploaded = 0;
    let firstPhoto = true;

    for (const photo of pendingPhotos) {
      try {
        const fd = new FormData();
        fd.append('file', photo.file);
        fd.append('product_id', productId);
        if (photo.variant_id && variantIdMap[photo.variant_id]) {
          fd.append('variant_id', variantIdMap[photo.variant_id]);
        }
        if (!photo.variant_id && firstPhoto) {
          fd.append('is_primary', 'true');
          firstPhoto = false;
        }

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-product-image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: fd,
        });

        if (resp.ok) {
          uploaded++;
        } else {
          console.warn('Photo upload failed:', await resp.text());
        }
      } catch (e) {
        console.warn('Photo upload error:', e.message);
      }
    }

    setUploadingPhoto(false);
    if (uploaded > 0) {
      showToast(`✓ ${uploaded} foto diupload`, 'success');
    }
  };

  const validationErrors = useMemo(() => {
    const errs = [];
    if (!formData.name.trim()) errs.push('Nama produk wajib diisi');
    if (!formData.category.trim()) errs.push('Kategori wajib diisi');
    if (!formData.base_price || Number(formData.base_price) < 0) errs.push('Harga dasar wajib diisi (≥ 0)');
    if (!formData.weight_in_gram || Number(formData.weight_in_gram) < 0) errs.push('Berat default wajib diisi (≥ 0)');

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.name.trim()) errs.push(`Varian ${i + 1}: nama wajib diisi`);
      if (v.price === '' || Number(v.price) < 0) errs.push(`Varian ${i + 1}: harga wajib diisi (≥ 0)`);
      if (v.stock === '' || Number(v.stock) < 0) errs.push(`Varian ${i + 1}: stok wajib diisi (≥ 0)`);
      if (Number(v.price) > Number(formData.base_price)) {
        errs.push(`Varian ${i + 1}: harga tidak boleh > harga dasar`);
      }
      if (v.is_active) {
        const effectiveWeight = v.weight_in_gram || formData.weight_in_gram;
        if (!effectiveWeight || Number(effectiveWeight) <= 0) {
          errs.push(`Varian ${i + 1}: varian aktif wajib punya berat > 0`);
        }
      }
    }
    return errs;
  }, [formData, variants]);

  const handleSave = async () => {
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(' • '), 'error');
      return;
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Sesi login habis. Login ulang dulu.', 'error');
        setSaving(false);
        return;
      }

      const payload = {
        product: {
          name: formData.name.trim(),
          slug: formData.slug || slugify(formData.name),
          category: formData.category.trim(),
          base_price: Number(formData.base_price),
          weight_in_gram: Number(formData.weight_in_gram),
          badge: formData.badge || null,
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        },
        variants: variants.map((v) => ({
          name: v.name.trim(),
          price: Number(v.price),
          stock: parseInt(v.stock, 10),
          weight_in_gram: v.weight_in_gram ? Number(v.weight_in_gram) : null,
          sku: v.sku?.trim() || null,
          is_active: v.is_active,
          length_cm: v.length_cm ? Number(v.length_cm) : null,
          width_cm: v.width_cm ? Number(v.width_cm) : null,
          height_cm: v.height_cm ? Number(v.height_cm) : null,
        })),
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

      const variantIdMap = {};
      if (result.variants) {
        result.variants.forEach((v, idx) => {
          const tempId = variants[idx]?.id;
          if (tempId) variantIdMap[tempId] = v.id;
        });
      }

      if (pendingPhotos.length > 0) {
        await uploadPendingPhotos(result.product_id, variantIdMap);
      }

      showToast('✓ Produk berhasil dibuat', 'success');
      onCreated?.();
      setTimeout(() => {
        onClose?.();
      }, 1200);
    } catch (e) {
      showToast(`✗ ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const getPhotos = (variantId = null) => pendingPhotos.filter((p) => p.variant_id === variantId);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[3000]" onClick={onClose} />

      <div className="fixed top-0 right-0 w-full md:w-[600px] h-screen bg-white z-[3001] overflow-y-auto shadow-2xl flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">+ Tambah Produk Baru</h2>
            <p className="text-xs text-gray-500 truncate max-w-[300px]">
              {formData.name || 'Isi informasi produk di bawah'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-[34px] h-[34px] rounded-full bg-black/[0.07] flex items-center justify-center text-gray-600 text-xl cursor-pointer border-none hover:bg-black/[0.13] transition-colors"
            aria-label="Tutup"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 px-6 py-6 space-y-8">
          {/* === SECTION 1: PRODUCT PHOTOS (COVER) === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              📸 Foto Produk (Cover)
            </h3>
            <div className="flex flex-wrap gap-3">
              {getPhotos(null).map((photo, idx) => (
                <div key={photo.id} className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200">
                  <img src={photo.preview_url} alt="" className="w-full h-full object-cover" />
                  {idx === 0 && (
                    <div className="absolute top-1 left-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => removePhoto(photo.id)}
                      className="text-[0.65rem] text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
              <label
                htmlFor="cover-photo-upload"
                className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                {uploadingPhoto ? (
                  <span className="text-xs text-gray-400">⏳</span>
                ) : (
                  <>
                    <span className="text-2xl text-gray-400">+</span>
                    <span className="text-[0.65rem] text-gray-400 mt-1">Upload</span>
                  </>
                )}
                <input
                  id="cover-photo-upload"
                  name="cover_photo"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addMultiplePhotos(e.target.files, null);
                    e.target.value = '';
                  }}
                  disabled={uploadingPhoto || saving}
                />
              </label>
            </div>
            <p className="text-[0.65rem] text-gray-400 mt-2">
              Foto pertama otomatis jadi primary. Upload setelah produk dibuat.
            </p>
          </section>

          {/* === SECTION 2: PRODUCT INFO === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3">📝 Informasi Produk</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="product-name" className="block text-xs font-medium text-gray-600 mb-1">Nama Produk</label>
                <input
                  id="product-name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="e.g., Toples Pita Lucu"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="product-category" className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
                  <select
                    id="product-category"
                    name="category"
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
                  <label htmlFor="product-badge" className="block text-xs font-medium text-gray-600 mb-1">Badge</label>
                  <select
                    id="product-badge"
                    name="badge"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="product-base-price" className="block text-xs font-medium text-gray-600 mb-1">
                    Harga Dasar (Rp) <span className="text-gray-400">— strike-through</span>
                  </label>
                  <input
                    id="product-base-price"
                    name="base_price"
                    type="number"
                    value={formData.base_price}
                    onChange={(e) => updateField('base_price', e.target.value)}
                    placeholder="95000"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="product-weight" className="block text-xs font-medium text-gray-600 mb-1">
                    Berat Default (gram) <span className="text-gray-400">— fallback</span>
                  </label>
                  <input
                    id="product-weight"
                    name="weight_in_gram"
                    type="number"
                    value={formData.weight_in_gram}
                    onChange={(e) => updateField('weight_in_gram', e.target.value)}
                    placeholder="800"
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="product-description" className="block text-xs font-medium text-gray-600 mb-1">Deskripsi</label>
                <textarea
                  id="product-description"
                  name="description"
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Deskripsi produk (opsional)"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="product-active-toggle" className="text-xs font-medium text-gray-600">Status:</label>
                <button
                  id="product-active-toggle"
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

          {/* === SECTION 3: VARIANTS === */}
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
                  const variantPhotos = getPhotos(v.id);
                  return (
                    <div key={v.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-gray-700">Varian {idx + 1}</span>
                        <div className="flex items-center gap-2">
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
                            onClick={() => deleteVariant(v.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            🗑 Hapus
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          {variantPhotos.length > 0 ? (
                            <div className="relative group w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200">
                              <img src={variantPhotos[0].preview_url} alt="" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <button
                                  onClick={() => removePhoto(variantPhotos[0].id)}
                                  className="text-[0.6rem] text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label
                              htmlFor={`variant-photo-${v.id}`}
                              className="block w-20 h-20 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer hover:border-blue-400 relative"
                            >
                              <div className="w-full h-full flex flex-col items-center justify-center bg-white">
                                <span className="text-xl text-gray-300">📷</span>
                                <span className="text-[0.55rem] text-gray-400 mt-0.5">Upload</span>
                              </div>
                              <input
                                id={`variant-photo-${v.id}`}
                                name={`variant_photo_${v.id}`}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  addPhoto(e.target.files[0], v.id);
                                  e.target.value = '';
                                }}
                                disabled={saving}
                              />
                            </label>
                          )}
                        </div>

                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label htmlFor={`variant-name-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Nama Varian</label>
                            <input
                              id={`variant-name-${v.id}`}
                              name={`variant_name_${v.id}`}
                              type="text"
                              value={v.name || ''}
                              onChange={(e) => updateVariant(v.id, 'name', e.target.value)}
                              placeholder="e.g., Ukuran L, Bening"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label htmlFor={`variant-price-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Harga (Rp)</label>
                            <input
                              id={`variant-price-${v.id}`}
                              name={`variant_price_${v.id}`}
                              type="number"
                              value={v.price}
                              onChange={(e) => updateVariant(v.id, 'price', e.target.value)}
                              placeholder="85000"
                              min="0"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label htmlFor={`variant-stock-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Stok</label>
                            <input
                              id={`variant-stock-${v.id}`}
                              name={`variant_stock_${v.id}`}
                              type="number"
                              value={v.stock}
                              onChange={(e) => updateVariant(v.id, 'stock', e.target.value)}
                              placeholder="50"
                              min="0"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label htmlFor={`variant-weight-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">Berat (gram)</label>
                            <input
                              id={`variant-weight-${v.id}`}
                              name={`variant_weight_${v.id}`}
                              type="number"
                              value={v.weight_in_gram || ''}
                              onChange={(e) => updateVariant(v.id, 'weight_in_gram', e.target.value)}
                              placeholder="wajib untuk active"
                              min="0"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label htmlFor={`variant-sku-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">SKU</label>
                            <input
                              id={`variant-sku-${v.id}`}
                              name={`variant_sku_${v.id}`}
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) => updateVariant(v.id, 'sku', e.target.value)}
                              placeholder="opsional"
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <div className="col-span-2">
                            <label htmlFor={`variant-length-${v.id}`} className="block text-[0.65rem] font-medium text-gray-500 mb-0.5">
                              Dimensi (cm) — opsional, untuk volumetric Biteship
                            </label>
                            <div className="flex items-center gap-1">
                              <input
                                id={`variant-length-${v.id}`}
                                name={`variant_length_${v.id}`}
                                type="number"
                                value={v.length_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'length_cm', e.target.value)}
                                placeholder="P"
                                min="0"
                                step="0.1"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-gray-400">×</span>
                              <input
                                id={`variant-width-${v.id}`}
                                name={`variant_width_${v.id}`}
                                type="number"
                                value={v.width_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'width_cm', e.target.value)}
                                placeholder="L"
                                min="0"
                                step="0.1"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <span className="text-gray-400">×</span>
                              <input
                                id={`variant-height-${v.id}`}
                                name={`variant_height_${v.id}`}
                                type="number"
                                value={v.height_cm || ''}
                                onChange={(e) => updateVariant(v.id, 'height_cm', e.target.value)}
                                placeholder="T"
                                min="0"
                                step="0.1"
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {v.price && formData.base_price && Number(v.price) < Number(formData.base_price) ? (
                            <>
                              <span className="line-through text-gray-400">{formatPrice(formData.base_price)}</span>
                              {' → '}
                              <span className="font-bold text-eglux-secondary">{formatPrice(v.price)}</span>
                              {' '}
                              <span className="text-red-500">
                                -{Math.round(((formData.base_price - v.price) / formData.base_price) * 100)}%
                              </span>
                            </>
                          ) : v.price && formData.base_price && Number(v.price) === Number(formData.base_price) ? (
                            <span className="font-bold text-eglux-secondary">{formatPrice(v.price)}</span>
                          ) : v.price && formData.base_price && Number(v.price) > Number(formData.base_price) ? (
                            <span className="text-red-400">⚠ Harga varian lebih mahal dari base price!</span>
                          ) : (
                            <span className="text-gray-400">Isi harga varian</span>
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

          {validationErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">⚠ Lengkapi data berikut:</p>
              <ul className="text-xs text-amber-600 ml-4 list-disc">
                {validationErrors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {validationErrors.length > 5 && (
                  <li className="text-gray-500">...dan {validationErrors.length - 5} error lainnya</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || validationErrors.length > 0}
            className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Menyimpan...' : '✓ Buat Produk'}
          </button>
        </div>
      </div>

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

export default AddProductPanel;