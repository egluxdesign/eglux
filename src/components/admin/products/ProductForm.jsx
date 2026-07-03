// src/components/admin/products/ProductForm.jsx
//
// Catatan arsitektur: komponen ini CUMA ngumpulin data (termasuk File objects
// buat gambar) dan nge-preview-nya secara lokal. Proses upload ke Supabase
// Storage & penyimpanan ke database sepenuhnya ditangani di ProductsPage
// (handleSaveProduct) — biar semua logic Supabase ada di satu tempat, gampang
// di-debug kalau ada error.

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Image as ImageIcon, Save, Star, Loader2, AlertTriangle, Camera } from 'lucide-react';

const CATEGORY_OPTIONS = [
  'sofa', 'table', 'chair', 'bed', 'storage', 'lighting', 'decor'
];

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const emptyVariant = () => ({
  _key: crypto.randomUUID(), // React key + penanda korelasi ke ProductsPage, BUKAN dikirim ke DB
  id: null,                  // null = varian baru
  name: '',
  size: '',
  color: '',
  price: '',
  stock: 0,
  sku: '',
  is_active: true,
  image: null,               // { id, url, file, isNew } | null
});

const ProductForm = ({ product, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    category: 'sofa',
    base_price: '',
    is_active: true,
    badge: '',
  });
  const [variants, setVariants] = useState([]);
  const [removedVariantIds, setRemovedVariantIds] = useState([]);
  const [removedVariantImageIds, setRemovedVariantImageIds] = useState([]);
  const [images, setImages] = useState([]); // gambar level produk
  const [removedImageIds, setRemovedImageIds] = useState([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        slug: product.slug || '',
        description: product.description || '',
        category: product.category || 'sofa',
        base_price: product.base_price ?? '',
        is_active: product.is_active ?? true,
        badge: product.badge || '',
      });
      setSlugTouched(true);

      const productLevelImages = (product.images || []).filter((img) => !img.variant_id);
      setImages(
        productLevelImages
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((img) => ({
            _key: img.id, id: img.id, url: img.url, file: null,
            isNew: false, isPrimary: img.is_primary, position: img.position,
          }))
      );

      setVariants(
        (product.variants || []).map((v) => {
          const variantImage = (product.images || []).find((img) => img.variant_id === v.id);
          return {
            _key: v.id,
            id: v.id,
            name: v.name || '',
            size: v.attributes?.size || '',
            color: v.attributes?.color || '',
            price: v.price ?? '',
            stock: v.stock ?? 0,
            sku: v.sku || '',
            is_active: v.is_active ?? true,
            image: variantImage
              ? { id: variantImage.id, url: variantImage.url, file: null, isNew: false }
              : null,
          };
        })
      );
    }
  }, [product]);

  const handleNameChange = (name) => {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  };

  const handleSlugChange = (slug) => {
    setSlugTouched(true);
    setForm((f) => ({ ...f, slug: slugify(slug) }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Product name is required';
    if (!form.slug.trim()) newErrors.slug = 'Slug is required';
    if (!form.base_price || Number(form.base_price) <= 0) newErrors.base_price = 'Valid price is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Variants ──────────────────────────────────────────────
  const addVariant = () => setVariants((prev) => [...prev, emptyVariant()]);

  const updateVariant = (key, field, value) => {
    setVariants((prev) => prev.map((v) => (v._key === key ? { ...v, [field]: value } : v)));
  };

  const removeVariant = (key) => {
    const target = variants.find((v) => v._key === key);
    if (target?.id) setRemovedVariantIds((prev) => [...prev, target.id]);
    if (target?.image?.id) setRemovedVariantImageIds((prev) => [...prev, target.image.id]);
    setVariants((prev) => prev.filter((v) => v._key !== key));
  };

  const setVariantImage = (key, file) => {
    if (!file) return;
    setVariants((prev) =>
      prev.map((v) => {
        if (v._key !== key) return v;
        // Kalau sebelumnya udah ada gambar tersimpan, tandai buat dihapus dulu
        if (v.image?.id) setRemovedVariantImageIds((ids) => [...ids, v.image.id]);
        return { ...v, image: { id: null, url: URL.createObjectURL(file), file, isNew: true } };
      })
    );
  };

  const removeVariantImage = (key) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v._key !== key) return v;
        if (v.image?.id) setRemovedVariantImageIds((ids) => [...ids, v.image.id]);
        return { ...v, image: null };
      })
    );
  };

  // ── Product-level images ────────────────────────────────────
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const newImages = files.map((file, i) => ({
      _key: crypto.randomUUID(), id: null, url: URL.createObjectURL(file), file,
      isNew: true, isPrimary: images.length === 0 && i === 0, position: images.length + i,
    }));
    setImages((prev) => [...prev, ...newImages]);
    e.target.value = '';
  };

  const removeImage = (key) => {
    const target = images.find((img) => img._key === key);
    if (target?.id) setRemovedImageIds((prev) => [...prev, target.id]);
    setImages((prev) => {
      const next = prev.filter((img) => img._key !== key);
      if (target?.isPrimary && next.length > 0) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
  };

  const setPrimaryImage = (key) => {
    setImages((prev) => prev.map((img) => ({ ...img, isPrimary: img._key === key })));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    try {
      await onSave({
        productInfo: {
          name: form.name,
          slug: form.slug,
          description: form.description || null,
          category: form.category,
          base_price: Number(form.base_price),
          is_active: form.is_active,
          badge: form.badge || null,
        },
        images: images.map((img) => ({
          _key: img._key, id: img.id, file: img.file, isNew: img.isNew,
          isPrimary: img.isPrimary, position: img.position,
        })),
        removedImageIds,
        variants: variants.map((v) => ({
          _key: v._key,
          id: v.id,
          name: v.name.trim() || [v.size, v.color].filter(Boolean).join(' / ') || 'Default',
          attributes: {
            ...(v.size ? { size: v.size } : {}),
            ...(v.color ? { color: v.color } : {}),
          },
          price: v.price === '' ? null : Number(v.price),
          stock: Number(v.stock) || 0,
          sku: v.sku || null,
          is_active: v.is_active,
          image: v.image ? { id: v.image.id, file: v.image.file, isNew: v.image.isNew } : null,
        })),
        removedVariantIds,
        removedVariantImageIds,
      });
    } catch (err) {
      setSaveError(err.message || 'Gagal menyimpan produk.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field) => `w-full px-4 py-2.5 bg-[#f8f9fc] border rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none transition-all placeholder-[#9ca3af]
    ${errors[field] ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100' : 'border-[#e8ecf4] focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ecf4]">
          <h2 className="text-[1.1rem] font-bold text-[#1a1d2b]">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          {saveError && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-[0.85rem] mb-5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {saveError}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Product Name *</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Scandinavian Sofa"
                  className={inputClass('name')}
                />
                {errors.name && <p className="text-red-500 text-[0.75rem] mt-1">{errors.name}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">
                  Slug * <span className="font-normal text-[#9ca3af]">(URL produk, otomatis dari nama)</span>
                </label>
                <input
                  type="text" value={form.slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="scandinavian-sofa"
                  className={inputClass('slug')}
                />
                {errors.slug && <p className="text-red-500 text-[0.75rem] mt-1">{errors.slug}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Product description..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all placeholder-[#9ca3af] resize-none"
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all appearance-none"
                >
                  {CATEGORY_OPTIONS.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Base Price (Rp) *</label>
                <input
                  type="number" value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                  placeholder="0" min="0"
                  className={inputClass('base_price')}
                />
                {errors.base_price && <p className="text-red-500 text-[0.75rem] mt-1">{errors.base_price}</p>}
                <p className="text-[0.7rem] text-[#9ca3af] mt-1">Harga default kalau varian gak punya harga sendiri.</p>
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Badge (opsional)</label>
                <input
                  type="text" value={form.badge}
                  onChange={(e) => setForm({ ...form, badge: e.target.value })}
                  placeholder="New, Best Seller, dll"
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all placeholder-[#9ca3af]"
                />
              </div>

              <div className="flex items-center gap-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-[#c9a96e]' : 'bg-[#e8ecf4]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                </button>
                <span className="text-[0.85rem] text-[#1a1d2b] font-medium">
                  {form.is_active ? 'Active — tampil di storefront' : 'Inactive — disembunyikan dari storefront'}
                </span>
              </div>
            </div>

            {/* Product-level Images */}
            <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4] flex items-center justify-between">
                <h3 className="text-[0.9rem] font-semibold text-[#1a1d2b]">Images</h3>
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded-lg text-[0.8rem] font-medium hover:bg-[#c9a96e]/20 transition-colors cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  Add Images
                  <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                </label>
              </div>

              {images.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-10 h-10 text-[#e8ecf4] mx-auto mb-2" />
                  <p className="text-[0.85rem] text-[#9ca3af]">No images yet. Upload one to get started.</p>
                </div>
              ) : (
                <div className="p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {images.map((img) => (
                    <div key={img._key} className="relative group">
                      <div className={`aspect-square rounded-xl overflow-hidden border-2 ${img.isPrimary ? 'border-[#c9a96e]' : 'border-[#e8ecf4]'}`}>
                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                      </div>
                      {img.isPrimary && (
                        <span className="absolute top-1.5 left-1.5 bg-[#c9a96e] text-white text-[0.65rem] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-1">
                          <Star className="w-2.5 h-2.5 fill-current" /> Primary
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                        {!img.isPrimary && (
                          <button type="button" onClick={() => setPrimaryImage(img._key)}
                            className="p-1.5 bg-white rounded-lg hover:bg-[#c9a96e] hover:text-white transition-colors" title="Set as primary">
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button type="button" onClick={() => removeImage(img._key)}
                          className="p-1.5 bg-white rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-colors" title="Remove">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Variants */}
            <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4] flex items-center justify-between">
                <div>
                  <h3 className="text-[0.9rem] font-semibold text-[#1a1d2b]">Variants</h3>
                  <p className="text-[0.7rem] text-[#9ca3af]">Stok dikelola per varian. Tiap varian bisa punya 1 foto sendiri (opsional).</p>
                </div>
                <button type="button" onClick={addVariant}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded-lg text-[0.8rem] font-medium hover:bg-[#c9a96e]/20 transition-colors flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                  Add Variant
                </button>
              </div>

              {variants.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-10 h-10 text-[#e8ecf4] mx-auto mb-2" />
                  <p className="text-[0.85rem] text-[#9ca3af]">No variants yet. Add one to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f3f4f6]">
                  {variants.map((variant) => (
                    <div key={variant._key} className="px-4 py-4 flex flex-col md:flex-row gap-3 md:items-end">
                      {/* Variant photo */}
                      <div className="flex-shrink-0">
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Photo</label>
                        <div className="relative w-14 h-14">
                          {variant.image ? (
                            <>
                              <img src={variant.image.url} alt="" className="w-14 h-14 rounded-lg object-cover border border-[#e8ecf4]" />
                              <button
                                type="button"
                                onClick={() => removeVariantImage(variant._key)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <label className="w-14 h-14 rounded-lg border-2 border-dashed border-[#e8ecf4] flex items-center justify-center cursor-pointer hover:border-[#c9a96e] transition-colors">
                              <Camera className="w-4 h-4 text-[#9ca3af]" />
                              <input
                                type="file" accept="image/*" className="hidden"
                                onChange={(e) => setVariantImage(variant._key, e.target.files?.[0])}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 flex-1">
                        <div>
                          <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Size</label>
                          <input type="text" value={variant.size}
                            onChange={(e) => updateVariant(variant._key, 'size', e.target.value)}
                            placeholder="S, M, L"
                            className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all" />
                        </div>
                        <div>
                          <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Color</label>
                          <input type="text" value={variant.color}
                            onChange={(e) => updateVariant(variant._key, 'color', e.target.value)}
                            placeholder="Black, White"
                            className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all" />
                        </div>
                        <div>
                          <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Price</label>
                          <input type="number" value={variant.price}
                            onChange={(e) => updateVariant(variant._key, 'price', e.target.value)}
                            placeholder="= base price"
                            className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all" />
                        </div>
                        <div>
                          <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Stock *</label>
                          <input type="number" value={variant.stock}
                            onChange={(e) => updateVariant(variant._key, 'stock', e.target.value)}
                            placeholder="0" min="0"
                            className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all" />
                        </div>
                        <div>
                          <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">SKU</label>
                          <input type="text" value={variant.sku}
                            onChange={(e) => updateVariant(variant._key, 'sku', e.target.value)}
                            placeholder="SKU"
                            className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all" />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col items-center">
                            <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Active</label>
                            <button type="button" onClick={() => updateVariant(variant._key, 'is_active', !variant.is_active)}
                              className={`relative w-9 h-5 rounded-full transition-colors ${variant.is_active ? 'bg-[#c9a96e]' : 'bg-[#e8ecf4]'}`}>
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${variant.is_active ? 'translate-x-4' : ''}`} />
                            </button>
                          </div>
                          <button type="button" onClick={() => removeVariant(variant._key)}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-400">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-[#e8ecf4] flex justify-end gap-3">
          <button type="button" onClick={onCancel}
            className="px-5 py-2.5 bg-[#f8f9fc] text-[#1a1d2b] rounded-xl text-[0.85rem] font-medium hover:bg-[#f0f1f5] transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#c9a96e] text-white rounded-xl text-[0.85rem] font-medium hover:bg-[#b8985e] transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductForm;