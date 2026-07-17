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
import { compressImage } from '../../utils/compressImage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ⭐ Helper: get current session JWT for auth-gated edge function calls
const getSessionToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || '';
};

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
  const [initialized, setInitialized] = useState(false); // prevent form reset on parent refresh
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ============================================================================
  // LOCAL REFRESH: fetch fresh images + variants untuk produk ini (tanpa reset form)
  // Bug fix: pakai spread operator supaya React detect state change (new array reference)
  // ============================================================================
  const refreshLocalData = useCallback(async () => {
    if (!product) return;
    try {
      const { data } = await supabase
        .from('products')
        .select(`
          product_variants (id, name, attributes, price, stock, sku, is_active, weight_in_gram, length_cm, width_cm, height_cm),
          product_images (id, url, position, is_primary, variant_id)
        `)
        .eq('id', product.id)
        .single();

      if (data) {
        // Preserve _changed flag untuk variants yang sedang di-edit (jangan overwrite kalau user lagi edit)
        setVariants((prevVariants) => {
          const newVariants = (data.product_variants || []).map((v) => {
            // Cek apakah variant ini sudah ada di state (preserve _changed flag)
            const existing = prevVariants.find((pv) => pv.id === v.id);
            return {
              ...v,
              price: v.price || 0,
              stock: v.stock || 0,
              weight_in_gram: v.weight_in_gram || 0,
              length_cm: v.length_cm || '',
              width_cm: v.width_cm || '',
              height_cm: v.height_cm || '',
              // Preserve _changed flag kalau variant sudah ada di state
              _changed: existing?._changed || false,
            };
          });
          // Tambahkan variant baru yang belum ada di DB (e.g., baru di-add tapi belum di-save)
          const dbIds = new Set((data.product_variants || []).map((v) => v.id));
          const unsavedNewVariants = prevVariants.filter((pv) => !dbIds.has(pv.id));
          return [...newVariants, ...unsavedNewVariants];
        });

        // Force new array reference supaya React re-render
        setProductImages([...(data.product_images || [])]);
      }
    } catch (e) {
      console.error('refreshLocalData error:', e);
    }
  }, [product]);

  // ============================================================================
  // INIT: populate form saat panel buka (reset initialized setiap kali product berubah)
  // ============================================================================
  useEffect(() => {
    if (!product) return;
    // Reset form setiap kali product berubah (bukan cuma first time)
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
  // PHOTO UPLOAD (product + variant, via edge function to bypass RLS)
  // ============================================================================
  const uploadPhoto = async (file, variantId = null) => {
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('product_id', product.id);
      if (variantId) formData.append('variant_id', variantId);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/upload-product-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
        },
        body: formData,
      });

      const compressedFile = await compressImage(file); // ← tambahin ini
          // ...lanjut pakai compressedFile, bukan file, buat FormData
          formData.append('file', compressedFile);
          // ...
        };

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || 'Upload gagal');
      }

      // Optimistic update: tambah foto ke local state langsung (no refresh, no form reset)
      const newImage = {
        id: result.image_id,
        url: result.url,
        is_primary: result.is_primary,
        variant_id: variantId,
        position: 0,
      };
      setProductImages((prev) => [...prev, newImage]);
      onSaved(); // refresh parent background only
      return result;
    } catch (e) {
      showToast(`✗ Upload gagal: ${e.message}`, 'error');
      return null;
    }
  };

  // ⭐ Bulk upload: multiple files sekaligus
  const uploadMultiplePhotos = async (files, variantId = null) => {
    if (!files || files.length === 0) return;

    setUploadingPhoto(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      const result = await uploadPhoto(file, variantId);
      if (result) successCount++;
      else failCount++;
    }

    setUploadingPhoto(false);
    if (successCount > 0) {
      showToast(`✓ ${successCount} foto diupload${failCount > 0 ? `, ${failCount} gagal` : ''}`, 'success');
    }
  };

  const setPrimaryPhoto = async (imageId) => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-product-asset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'set_primary',
          image_id: imageId,
          product_id: product.id,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      // Optimistic update: update is_primary di local state langsung
      setProductImages((prev) =>
        prev.map((img) => ({
          ...img,
          is_primary: img.id === imageId,
        }))
      );
      showToast('✓ Primary diubah', 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  const deletePhoto = async (imageId, imageUrl) => {
    if (!confirm('Hapus foto ini?')) return;
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-product-asset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete_photo',
          image_id: imageId,
          image_url: imageUrl,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      // Optimistic update: hapus foto dari local state langsung
      setProductImages((prev) => prev.filter((img) => img.id !== imageId));
      showToast('✓ Foto dihapus', 'success');
      onSaved();
    } catch (e) {
      showToast(`✗ Gagal: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // ADD VARIANT (prompt + immediate DB insert → dapat UUID asli)
  // ============================================================================
  const addVariant = async () => {
    const name = prompt('Nama variant baru (e.g., "Ukuran L"):');
    if (!name) return;
    const price = prompt('Harga variant (tidak boleh lebih mahal dari base price):', '0');
    if (price === null) return;

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-product-asset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add_variant',
          product_id: product.id,
          name: name,
          price: Number(price),
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      // Optimistic update: tambah variant ke local state langsung
      setVariants((prev) => [...prev, {
        ...result.variant,
        price: result.variant.price || 0,
        stock: result.variant.stock || 0,
        weight_in_gram: result.variant.weight_in_gram || 0,
        length_cm: '',
        width_cm: '',
        height_cm: '',
        _changed: false,
      }]);
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
    if (!confirm(`Hapus variant "${variantName || 'Varian Baru'}"? Stok dan data variant akan hilang.`)) return;

    // Variant baru (belum tersimpan di DB) → hapus dari local state saja, no API call
    if (variantId.startsWith('new-')) {
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
      showToast('✓ Varian baru dihapus', 'success');
      return;
    }

    // Variant existing (sudah di DB) → hapus dari DB + local state
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/manage-product-asset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete_variant',
          variant_id: variantId,
        }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error);

      // Hapus dari local state langsung (optimistic update, no refresh needed)
      setVariants((prev) => prev.filter((v) => v.id !== variantId));
      showToast('✓ Variant dihapus', 'success');
      onSaved(); // refresh parent background (tabel admin)
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
    const newVariants = []; // Variants yang belum punya ID (perlu INSERT, bukan UPDATE)

    // Product update
    const productFields = {
      name: formData.name,
      category: formData.category,
      description: formData.description,
      base_price: Number(formData.base_price),
      weight_in_gram: Number(formData.weight_in_gram),
      badge: formData.badge || null,
      is_active: formData.is_active,
    };


    updates.push({
      type: 'product',
      slug: formData.slug,
      fields: productFields,
    });

    // Variant updates (only changed ones)
    for (const v of variants) {
      if (!v._changed) continue;

      const isNew = !v.id || v.id.startsWith('new-') || v.id === '';
      const variantFields = {
        name: v.name,
        price: Number(v.price),
        stock: parseInt(v.stock, 10),
        weight_in_gram: v.weight_in_gram ? parseInt(v.weight_in_gram, 10) : null,
        // SKU: empty string → null (PostgreSQL UNIQUE constraint allow multiple NULLs
        // tapi reject multiple empty strings). Trim whitespace dulu juga.
        sku: v.sku?.trim() || null,
        length_cm: v.length_cm ? parseFloat(v.length_cm) : null,
        width_cm: v.width_cm ? parseFloat(v.width_cm) : null,
        height_cm: v.height_cm ? parseFloat(v.height_cm) : null,
        is_active: v.is_active,
      };

      if (isNew) {
        // Variant baru → INSERT (perlu product_id). Kumpulkan dulu, insert setelah product update sukses.
        newVariants.push({ ...variantFields, _tempId: v.id, _originalIndex: variants.indexOf(v) });
      } else {
        // Variant existing → UPDATE
        updates.push({
          type: 'variant',
          id: v.id,
          fields: variantFields,
        });
      }
    }

    // ⚠️ Validasi: kalau ada variant baru, kita perlu INSERT via supabase client langsung
    // (edge function bulk-update-products hanya support UPDATE, bukan INSERT).
    // Untuk simplicity, insert dulu variant baru, baru bulk-update sisanya.
    let newVariantIds = {}; // map _tempId → real UUID
    if (newVariants.length > 0) {
      try {
        // Ambil product_id dari slug
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('id')
          .eq('slug', formData.slug)
          .single();
        if (prodErr || !prodData) {
          showToast(`✗ Gagal ambil product_id untuk insert variant baru: ${prodErr?.message || 'not found'}`, 'error');
          setSaving(false);
          return;
        }

        // Insert semua variant baru
        for (const nv of newVariants) {
          const { _tempId, _originalIndex, ...insertFields } = nv;
          const { data: inserted, error: insertErr } = await supabase
            .from('product_variants')
            .insert({ ...insertFields, product_id: prodData.id })
            .select('id')
            .single();
          if (insertErr) {
            showToast(`✗ Gagal insert variant "${insertFields.name}": ${insertErr.message}`, 'error');
            console.error('Insert variant error:', insertErr);
          } else if (inserted) {
            newVariantIds[_tempId] = inserted.id;
          }
        }
      } catch (e) {
        showToast(`✗ Error insert variant baru: ${e.message}`, 'error');
        setSaving(false);
        return;
      }
    }

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/bulk-update-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getSessionToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });
      const result = await resp.json();

      // Filter hasil: hanya yang error
      const failedResults = result.results?.filter(r => !r.success) || [];

      if (result.error_count === 0 && result.success_count > 0) {
        let msg = `✓ ${result.success_count} perubahan tersimpan`;
        if (Object.keys(newVariantIds).length > 0) {
          msg += ` + ${Object.keys(newVariantIds).length} variant baru`;
        }
        showToast(msg, 'success');
        refreshLocalData(); onSaved();
        setTimeout(() => onClose(), 800);
      } else if (result.error_count > 0) {
        // Tampilkan error spesifik per item, bukan cuma count
        const errorMsgs = failedResults.map(r => `${r.type} "${r.identifier}": ${r.error}`).join('\n');
        showToast(`✗ ${result.error_count} error. Lihat detail di console.`, 'error');
        console.error('Save errors (detailed):', failedResults);
        console.error('Error messages:\n' + errorMsgs);
        // Juga alert user biar gampang copy
        if (typeof window !== 'undefined') {
          console.table(failedResults.map(r => ({ type: r.type, identifier: r.identifier, error: r.error })));
        }
      } else {
        // No changes to save via bulk-update, but mungkin ada new variants yang sukses insert
        if (Object.keys(newVariantIds).length > 0) {
          showToast(`✓ ${Object.keys(newVariantIds).length} variant baru tersimpan`, 'success');
          refreshLocalData(); onSaved();
          setTimeout(() => onClose(), 800);
        } else {
          showToast('Tidak ada perubahan untuk disimpan', 'info');
          onClose();
        }
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
        {/* Header — tanpa tombol Simpan/Batal (hanya di bawah) */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Produk</h2>
            <p className="text-xs text-gray-500 truncate max-w-[300px]">{formData.name}</p>
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
          {/* === SECTION 1: PRODUCT PHOTOS (Cover) — drag to reorder, star for primary === */}
          <section>
            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              📸 Foto Produk (Cover)
            </h3>
            <div className="flex flex-wrap gap-3">
              {coverImages.map((img, idx) => (
                <div
                  key={img.id}
                  className="relative group w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200 cursor-move"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(idx));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    if (isNaN(fromIdx) || fromIdx === idx) return;
                    // Reorder coverImages locally
                    const next = [...coverImages];
                    const [moved] = next.splice(fromIdx, 1);
                    next.splice(idx, 0, moved);
                    // First photo = primary
                    next.forEach((im, i) => im.is_primary = i === 0);
                    // Update local state
                    setProductImages(prev => {
                      const variants = prev.filter(p => p.variant_id);
                      return [...next.map((im, i) => ({ ...im, is_primary: i === 0 })), ...variants];
                    });
                    // Update DB: set first photo as primary
                    const primaryImg = next[0];
                    if (primaryImg) {
                      try {
                        const token = await getSessionToken();
                        await fetch(`${SUPABASE_URL}/functions/v1/manage-product-asset`, {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'set_primary', image_id: primaryImg.id, product_id: product.id }),
                        });
                      } catch (err) { console.warn('Reorder set_primary failed:', err); }
                    }
                  }}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover pointer-events-none" />
                  {/* Star icon for primary (first photo) */}
                  {img.is_primary && (
                    <div className="absolute top-1 left-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </div>
                  )}
                  {/* Hover: Hapus only */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => deletePhoto(img.id, img.url)}
                      className="text-[0.65rem] text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
              {/* Upload button — multiple files */}
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
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    uploadMultiplePhotos(e.target.files, null);
                    e.target.value = '';
                  }}
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
                        {/* Photo — show variant photo with hover hapus, or upload button */}
                        <div className="flex-shrink-0">
                          {variantImages.length > 0 ? (
                            <div className="relative group w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200">
                              <img src={variantImages[0].url} alt="" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <button
                                  onClick={() => deletePhoto(variantImages[0].id, variantImages[0].url)}
                                  className="text-[0.6rem] text-white bg-red-600 px-2 py-0.5 rounded hover:bg-red-700"
                                >
                                  Hapus
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="block w-20 h-20 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 cursor-pointer hover:border-blue-400 relative">
                              <div className="w-full h-full flex flex-col items-center justify-center bg-white">
                                <span className="text-xl text-gray-300">📷</span>
                                <span className="text-[0.55rem] text-gray-400 mt-0.5">Upload</span>
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  uploadPhoto(e.target.files[0], v.id);
                                  e.target.value = '';
                                }}
                                disabled={uploadingPhoto}
                              />
                            </label>
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
                          ) : Number(v.price) === Number(formData.base_price) ? (
                            <span className="font-bold text-eglux-secondary">{formatPrice(v.price)}</span>
                          ) : (
                            <span className="text-red-400">⚠ Harga varian lebih mahal dari base price!</span>
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
