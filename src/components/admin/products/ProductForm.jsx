// src/components/admin/products/ProductForm.jsx
import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Image as ImageIcon, Save } from 'lucide-react';

const CATEGORY_OPTIONS = [
  'sofa', 'table', 'chair', 'bed', 'storage', 'lighting', 'decor'
];

const EMPTY_VARIANT = { size: '', color: '', price_adjustment: 0, stock: 0, sku: '' };

const ProductForm = ({ product, onSave, onCancel }) => {
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'sofa',
    base_price: '',
    stock: '',
    sku: '',
    status: 'draft',
    image_url: '',
    variants: [],
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        description: product.description || '',
        category: product.category || 'sofa',
        base_price: product.base_price || '',
        stock: product.stock || '',
        sku: product.sku || '',
        status: product.status || 'draft',
        image_url: product.image_url || '',
        variants: product.variants || [],
      });
    }
  }, [product]);

  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Product name is required';
    if (!form.base_price || Number(form.base_price) <= 0) newErrors.base_price = 'Valid price is required';
    if (!form.sku.trim()) newErrors.sku = 'SKU is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave({
      ...form,
      base_price: Number(form.base_price),
      stock: Number(form.stock) || 0,
    });
    setSaving(false);
  };

  const addVariant = () => {
    setForm(prev => ({
      ...prev,
      variants: [...prev.variants, { ...EMPTY_VARIANT, id: crypto.randomUUID() }]
    }));
  };

  const updateVariant = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) => i === index ? { ...v, [field]: value } : v)
    }));
  };

  const removeVariant = (index) => {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index)
    }));
  };

  const inputClass = (field) => `w-full px-4 py-2.5 bg-[#f8f9fc] border rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none transition-all placeholder-[#9ca3af]
    ${errors[field] ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100' : 'border-[#e8ecf4] focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ecf4]">
          <h2 className="text-[1.1rem] font-bold text-[#1a1d2b]">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-[#f8f9fc] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#6b7280]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Product Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Scandinavian Sofa"
                  className={inputClass('name')}
                />
                {errors.name && <p className="text-red-500 text-[0.75rem] mt-1">{errors.name}</p>}
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
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Category *</label>
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
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">SKU *</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="e.g., EGL-SFA-001"
                  className={inputClass('sku')}
                />
                {errors.sku && <p className="text-red-500 text-[0.75rem] mt-1">{errors.sku}</p>}
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Base Price (Rp) *</label>
                <input
                  type="number"
                  value={form.base_price}
                  onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                  placeholder="0"
                  min="0"
                  className={inputClass('base_price')}
                />
                {errors.base_price && <p className="text-red-500 text-[0.75rem] mt-1">{errors.base_price}</p>}
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Stock</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all placeholder-[#9ca3af]"
                />
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all appearance-none"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Image URL</label>
                <input
                  type="text"
                  value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.9rem] text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20 transition-all placeholder-[#9ca3af]"
                />
              </div>
            </div>

            {/* Image Preview */}
            {form.image_url && (
              <div className="border border-[#e8ecf4] rounded-xl p-4">
                <p className="text-[0.8rem] font-semibold text-[#1a1d2b] mb-2">Image Preview</p>
                <div className="w-32 h-32 bg-[#f8f9fc] rounded-xl overflow-hidden">
                  <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                </div>
              </div>
            )}

            {/* Variants */}
            <div className="border border-[#e8ecf4] rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#e8ecf4] flex items-center justify-between">
                <h3 className="text-[0.9rem] font-semibold text-[#1a1d2b]">Variants</h3>
                <button
                  type="button"
                  onClick={addVariant}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded-lg text-[0.8rem] font-medium hover:bg-[#c9a96e]/20 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Variant
                </button>
              </div>

              {form.variants.length === 0 ? (
                <div className="p-8 text-center">
                  <ImageIcon className="w-10 h-10 text-[#e8ecf4] mx-auto mb-2" />
                  <p className="text-[0.85rem] text-[#9ca3af]">No variants yet. Add one to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f3f4f6]">
                  {form.variants.map((variant, index) => (
                    <div key={variant.id || index} className="px-4 py-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <div>
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Size</label>
                        <input
                          type="text"
                          value={variant.size}
                          onChange={(e) => updateVariant(index, 'size', e.target.value)}
                          placeholder="S, M, L"
                          className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Color</label>
                        <input
                          type="text"
                          value={variant.color}
                          onChange={(e) => updateVariant(index, 'color', e.target.value)}
                          placeholder="Black, White"
                          className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Price Adj.</label>
                        <input
                          type="number"
                          value={variant.price_adjustment}
                          onChange={(e) => updateVariant(index, 'price_adjustment', Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Stock</label>
                        <input
                          type="number"
                          value={variant.stock}
                          onChange={(e) => updateVariant(index, 'stock', Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.7rem] font-medium text-[#6b7280] mb-1">Variant SKU</label>
                        <input
                          type="text"
                          value={variant.sku}
                          onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                          placeholder="SKU"
                          className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none focus:border-[#c9a96e] transition-all"
                        />
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => removeVariant(index)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e8ecf4] flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-[#f8f9fc] text-[#1a1d2b] rounded-xl text-[0.85rem] font-medium hover:bg-[#f0f1f5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#c9a96e] text-white rounded-xl text-[0.85rem] font-medium hover:bg-[#b8985e] transition-colors disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductForm;