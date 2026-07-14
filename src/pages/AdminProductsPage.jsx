// src/pages/AdminProductsPage.jsx
// ============================================================================
// [v2] Comprehensive Admin Products Page
// ============================================================================
// Features:
//   1. Products table (DB schema: id, name, slug, category, base_price, weight_in_gram, badge, is_active, description)
//   2. Expandable variant rows (DB schema: id, name, attributes, price, stock, sku, is_active, weight_in_gram, length_cm, width_cm, height_cm)
//   3. Photo upload (Supabase Storage → product_images table)
//   4. Add new variant per product
//   5. Inline edit (auto-save per cell via bulk-update-products edge function)
//   6. Bulk actions (select + set price/weight/badge/active)
//   7. CSV + XLSX upload (SheetJS for xlsx → convert to CSV → import-products-csv)
//   8. Export current data (CSV)
//   9. Search + filter (name/slug, category, active status)
//
// Dependencies: SheetJS loaded from CDN (no npm install needed)
//
// Access: /products-admin (hidden storefront page)
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import EditProductPanel from '../components/admin/EditProductPanel';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const formatPrice = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  return 'Rp ' + Number(v).toLocaleString('id-ID');
};

const downloadBase64Csv = (base64Content, filename) => {
  const byteChars = atob(base64Content);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Parse XLSX file menggunakan SheetJS (load dinamis supaya nggak perlu install kalau nggak dipakai)
async function parseXlsxFile(file) {
  // Load SheetJS dynamically dari CDN (nggak perlu npm install)
  // SheetJS official CDN: https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Gagal load SheetJS dari CDN. Cek koneksi internet.'));
      document.head.appendChild(script);
    });
  }

  const XLSX = window.XLSX;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  // Ambil sheet pertama
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert ke CSV
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return csv;
}

// ============================================================================
// PHOTO UPLOAD COMPONENT (supports product + variant photos)
// ============================================================================
const PhotoUploader = ({ productId, images, onRefresh, variantId = null }) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const label = variantId ? '📷 Foto Varian' : '📷 Foto Produk';

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const folder = variantId ? `variants/${variantId}` : productId;
      const filename = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `products/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from('product_images')
        .insert({
          product_id: productId,
          url: urlData.publicUrl,
          position: 0,
          is_primary: images.length === 0,
          variant_id: variantId,
        });

      if (dbError) throw dbError;
      onRefresh();
    } catch (e) {
      alert(`Upload gagal: ${e.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setPrimary = async (imageId) => {
    try {
      // Unset all primary untuk product ini
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('product_id', productId);

      // Set yang dipilih jadi primary
      await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', imageId);

      onRefresh();
    } catch (e) {
      alert(`Set primary gagal: ${e.message}`);
    }
  };

  const deleteImage = async (imageId, imageUrl) => {
    if (!confirm('Hapus foto ini?')) return;

    try {
      // Delete dari Storage (extract path dari URL)
      const urlObj = new URL(imageUrl);
      const pathMatch = urlObj.pathname.match(/\/product-images\/(.+)/);
      if (pathMatch) {
        const storagePath = pathMatch[1];
        await supabase.storage.from('product-images').remove([storagePath]);
      }

      // Delete dari DB
      await supabase.from('product_images').delete().eq('id', imageId);

      onRefresh();
    } catch (e) {
      alert(`Hapus gagal: ${e.message}`);
    }
  };

  return (
    <div className="bg-gray-50 p-3 rounded-md">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">{label} ({images.length})</span>
        <label className="cursor-pointer px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
          {uploading ? '⏳ Uploading...' : '+ Upload Foto'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {images.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Belum ada foto. Upload foto produk.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group w-20 h-20 rounded-md overflow-hidden border-2 border-gray-200">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
              {img.is_primary && (
                <span className="absolute top-0 left-0 bg-amber-500 text-white text-[0.55rem] px-1 py-0.5 rounded-br">
                  PRIMARY
                </span>
              )}
              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity">
                {!img.is_primary && (
                  <button
                    onClick={() => setPrimary(img.id)}
                    className="text-[0.6rem] text-white bg-amber-600 px-1.5 py-0.5 rounded hover:bg-amber-700"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => deleteImage(img.id, img.url)}
                  className="text-[0.6rem] text-white bg-red-600 px-1.5 py-0.5 rounded hover:bg-red-700"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// INLINE EDIT CELL COMPONENT
// ============================================================================
const EditableCell = ({ type, id, field, value, onSave, displayValue, inputType = 'text' }) => {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value ?? '');

  const handleStart = () => {
    setEditVal(value ?? '');
    setEditing(true);
  };

  const handleSave = () => {
    onSave(type, id, field, editVal);
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditVal(value ?? '');
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type={inputType}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          autoFocus
          className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') handleCancel();
          }}
          onBlur={handleSave}
        />
      </div>
    );
  }

  return (
    <span
      onClick={handleStart}
      className="cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded inline-block min-w-[40px]"
      title="Click to edit"
    >
      {displayValue || value || '—'}
    </span>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const AdminProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search + filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterActive, setFilterActive] = useState('all');

  // Expandable rows (Set of product IDs yang di-expand)
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Edit panel (Shopee-style slide-in)
  const [editingProduct, setEditingProduct] = useState(null);

  // Bulk select
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkValues, setBulkValues] = useState({
    base_price: '', weight_in_gram: '', badge: '', is_active: '',
  });

  // Delete confirmation modal
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { productIds: [], productNames: [], isBulk: bool }
  const [deleting, setDeleting] = useState(false);

  // CSV/XLSX upload
  const [uploadFormat, setUploadFormat] = useState('csv'); // 'csv' | 'xlsx'
  const [productsFile, setProductsFile] = useState(null);
  const [variantsFile, setVariantsFile] = useState(null);
  const [csvMode, setCsvMode] = useState('validate');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============================================================================
  // FETCH DATA
  // ============================================================================
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id, name, slug, description, category, base_price, is_active, badge,
          weight_in_gram, updated_at,
          product_variants (
            id, name, attributes, price, stock, sku, is_active,
            weight_in_gram, length_cm, width_cm, height_cm
          ),
          product_images ( id, url, position, is_primary, variant_id )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // ============================================================================
  // FILTER + SEARCH
  // ============================================================================
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name?.toLowerCase().includes(q) && !p.slug?.toLowerCase().includes(q)) return false;
      }
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      if (filterActive === 'active' && !p.is_active) return false;
      if (filterActive === 'inactive' && p.is_active) return false;
      return true;
    });
  }, [products, searchQuery, filterCategory, filterActive]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [products]);

  // ============================================================================
  // INLINE EDIT SAVE (auto-save per cell)
  // ============================================================================
  const handleCellSave = async (type, id, field, value) => {
    // Convert value kalau perlu
    let processedValue = value;
    if (field === 'is_active') processedValue = value === 'true' || value === true;
    if (field === 'base_price' || field === 'price') processedValue = Number(value);
    if (field === 'weight_in_gram' || field === 'stock') processedValue = parseInt(value, 10);
    if (field === 'length_cm' || field === 'width_cm' || field === 'height_cm') {
      processedValue = value === '' ? null : parseFloat(value);
    }
    if (field === 'attributes') {
      try { processedValue = JSON.parse(value); } catch { processedValue = {}; }
    }

    const fields = { [field]: processedValue };

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/bulk-update-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: [
            type === 'product'
              ? { type: 'product', slug: id, fields }
              : { type: 'variant', id, fields }
          ],
        }),
      });
      const result = await resp.json();

      if (result.success_count > 0) {
        showToast(`✓ ${type} updated: ${field}`, 'success');
        await fetchProducts();
      } else {
        showToast(`✗ Update failed: ${result.results?.[0]?.error || 'unknown'}`, 'error');
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // ADD NEW VARIANT
  // ============================================================================
  const handleAddVariant = async (productId) => {
    const name = prompt('Nama variant baru (e.g., "Ukuran L"):');
    if (!name) return;

    const price = prompt('Harga variant (MUST < base_price, diskon model):');
    if (!price) return;

    try {
      const { error } = await supabase
        .from('product_variants')
        .insert({
          product_id: productId,
          name: name,
          attributes: {},
          price: Number(price),
          stock: 0,
          sku: `EGL-NEW-${Date.now().toString().slice(-6)}`,
          is_active: false, // inactive sampai Boss isi weight
          weight_in_gram: null,
        });

      if (error) throw error;

      showToast(`✓ Variant "${name}" ditambahkan (inactive, isi weight untuk activate)`, 'success');
      await fetchProducts();
    } catch (e) {
      showToast(`✗ Add variant gagal: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // BULK SELECT + ACTIONS
  // ============================================================================
  const toggleSelect = (productId) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const applyBulkUpdate = async () => {
    if (selectedProducts.size === 0) {
      showToast('Pilih produk dulu', 'error');
      return;
    }

    const updates = [];
    for (const productId of selectedProducts) {
      const product = products.find((p) => p.id === productId);
      if (!product) continue;

      const fields = {};
      if (bulkValues.base_price !== '') fields.base_price = Number(bulkValues.base_price);
      if (bulkValues.weight_in_gram !== '') fields.weight_in_gram = Number(bulkValues.weight_in_gram);
      if (bulkValues.badge !== '') fields.badge = bulkValues.badge === '(clear)' ? null : bulkValues.badge;
      if (bulkValues.is_active !== '') fields.is_active = bulkValues.is_active === 'true';

      if (Object.keys(fields).length === 0) continue;
      updates.push({ type: 'product', slug: product.slug, fields });
    }

    if (updates.length === 0) {
      showToast('Isi minimal 1 field untuk bulk update', 'error');
      return;
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

      showToast(
        `Bulk update: ${result.success_count} berhasil, ${result.error_count} gagal`,
        result.error_count > 0 ? 'warning' : 'success'
      );

      if (result.success_count > 0) {
        await fetchProducts();
        setSelectedProducts(new Set());
        setBulkEditMode(false);
        setBulkValues({ base_price: '', weight_in_gram: '', badge: '', is_active: '' });
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    }
  };

  // ============================================================================
  // DELETE PRODUCTS (single + bulk)
  // ============================================================================
  const handleDeleteSingle = (product) => {
    setDeleteConfirm({
      productIds: [product.id],
      productNames: [product.name],
      isBulk: false,
    });
  };

  const handleDeleteSelected = () => {
    if (selectedProducts.size === 0) {
      showToast('Pilih produk dulu', 'error');
      return;
    }
    const selectedList = products.filter((p) => selectedProducts.has(p.id));
    setDeleteConfirm({
      productIds: Array.from(selectedProducts),
      productNames: selectedList.map((p) => p.name),
      isBulk: true,
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      // Get current session JWT for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Sesi login habis. Login ulang dulu.', 'error');
        setDeleting(false);
        return;
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-products`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_ids: deleteConfirm.productIds }),
      });
      const result = await resp.json();

      if (result.success) {
        // Differentiate soft delete vs hard delete
        const softCount = result.soft_deleted_count || 0;
        const hardCount = result.hard_deleted_count || 0;
        let msg = `✓ ${result.success_count} produk diproses`;
        if (hardCount > 0 && softCount > 0) {
          msg += ` (${hardCount} dihapus permanen, ${softCount} disembunyikan — punya riwayat order)`;
        } else if (hardCount > 0) {
          msg += ` — dihapus permanen`;
        } else if (softCount > 0) {
          msg += ` — disembunyikan dari katalog (punya riwayat order, data order tetap utuh)`;
        }
        showToast(msg, 'success');
        setDeleteConfirm(null);
        setSelectedProducts(new Set());
        await fetchProducts();
      } else {
        // Partial success
        const failed = result.results?.filter((r) => !r.success) || [];
        const softCount = result.soft_deleted_count || 0;
        const hardCount = result.hard_deleted_count || 0;
        let msg = `✓ ${result.success_count} diproses`;
        if (hardCount > 0) msg += ` (${hardCount} permanen`;
        if (softCount > 0) msg += `${hardCount > 0 ? ', ' : '('}${softCount} disembunyikan`;
        msg += `), ✗ ${result.error_count} gagal`;
        showToast(msg, 'warning');
        console.error('Delete errors:', failed);
        if (result.success_count > 0) {
          await fetchProducts();
        }
        setDeleteConfirm(null);
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ============================================================================
  // CSV/XLSX UPLOAD
  // ============================================================================
  const handleFileUpload = async () => {
    if (!productsFile) {
      showToast('Pilih file dulu', 'error');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('mode', csvMode);

      // Convert XLSX to CSV kalau perlu
      if (uploadFormat === 'xlsx') {
        const csvText = await parseXlsxFile(productsFile);
        const csvBlob = new Blob([csvText], { type: 'text/csv' });
        formData.append('products_csv', csvBlob, 'products.csv');

        if (variantsFile) {
          const variantsCsvText = await parseXlsxFile(variantsFile);
          const variantsBlob = new Blob([variantsCsvText], { type: 'text/csv' });
          formData.append('variants_csv', variantsBlob, 'variants.csv');
        }
      } else {
        // CSV langsung
        formData.append('products_csv', productsFile);
        if (variantsFile) formData.append('variants_csv', variantsFile);
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/import-products-csv`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}` },
        body: formData,
      });

      const result = await resp.json();
      setUploadResult(result);

      if (resp.ok && result.errors?.length === 0) {
        showToast(
          csvMode === 'execute'
            ? `✓ Import berhasil! Products: ${result.db_changes?.products?.upserted || 0}, Variants: ${result.db_changes?.variants?.upserted || 0}`
            : `✓ Validation pass! ${result.parsed.products_valid} products + ${result.parsed.variants_valid} variants ready.`,
          'success'
        );
        if (csvMode === 'execute') await fetchProducts();
      } else {
        showToast(`Validation failed: ${result.errors?.length || 0} error(s)`, 'error');
      }
    } catch (e) {
      // Handle SheetJS not installed
      if (e.message?.includes('xlsx') || e.message?.includes('Module')) {
        showToast('❌ SheetJS belum di-install. Run: npm install xlsx', 'error');
      } else {
        showToast(`✗ Upload error: ${e.message}`, 'error');
      }
    } finally {
      setUploading(false);
    }
  };

  // ============================================================================
  // EXPORT
  // ============================================================================
  const handleExport = async () => {
    setExporting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/export-products-csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const result = await resp.json();

      if (result.success) {
        downloadBase64Csv(result.files.products_csv.content_base64, result.files.products_csv.filename);
        setTimeout(() => {
          downloadBase64Csv(result.files.variants_csv.content_base64, result.files.variants_csv.filename);
        }, 500);
        showToast(`✓ Export: ${result.counts.products} products + ${result.counts.variants} variants`, 'success');
      } else {
        showToast(`✗ Export failed: ${result.error}`, 'error');
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  // ============================================================================
  // EXPANDABLE ROWS
  // ============================================================================
  const toggleExpand = (productId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">EGLUX Admin — Products</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {products.length} total · {products.filter(p => p.is_active).length} active · {products.filter(p => !p.is_active).length} inactive
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : '⬇ Export CSV'}
            </button>
            <button
              onClick={fetchProducts}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* === UPLOAD SECTION === */}
        <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📦 Bulk Upload (CSV / XLSX)</h2>

          {/* Format selector */}
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={uploadFormat === 'csv'}
                onChange={() => setUploadFormat('csv')}
              />
              <span className="text-sm font-medium">📄 CSV (.csv)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={uploadFormat === 'xlsx'}
                onChange={() => setUploadFormat('xlsx')}
              />
              <span className="text-sm font-medium">📊 Excel (.xlsx)</span>
              <span className="text-xs text-gray-400">(auto-load dari CDN)</span>
            </label>
          </div>

          {/* File inputs */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Products File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept={uploadFormat === 'csv' ? '.csv' : '.xlsx,.xls'}
                onChange={(e) => setProductsFile(e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {productsFile && <p className="text-xs text-green-600 mt-1">✓ {productsFile.name} ({(productsFile.size / 1024).toFixed(1)} KB)</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variants File <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="file"
                accept={uploadFormat === 'csv' ? '.csv' : '.xlsx,.xls'}
                onChange={(e) => setVariantsFile(e.target.files[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {variantsFile && <p className="text-xs text-green-600 mt-1">✓ {variantsFile.name}</p>}
            </div>
          </div>

          {/* Mode + Upload */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mode:</label>
              <select
                value={csvMode}
                onChange={(e) => setCsvMode(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="validate">Validate (dry run)</option>
                <option value="execute">Execute (update DB)</option>
              </select>
            </div>
            <button
              onClick={handleFileUpload}
              disabled={uploading}
              className={`px-6 py-2 text-sm font-medium rounded-md text-white ${
                csvMode === 'execute' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {uploading ? '⏳ Processing...' : csvMode === 'execute' ? '⚠ Execute Import' : '🔍 Validate Only'}
            </button>
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
              <h3 className="text-sm font-semibold mb-2">
                {uploadResult.errors?.length === 0 ? '✅ Validation Report' : '❌ Validation Errors'}
              </h3>
              <div className="text-xs text-gray-600 mb-2">
                Parsed: {uploadResult.parsed?.products_valid || 0} products valid,
                {' '}{uploadResult.parsed?.variants_valid || 0} variants valid
              </div>
              {uploadResult.message && <p className="text-xs mb-2">{uploadResult.message}</p>}
              {uploadResult.errors?.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Row</th>
                        <th className="px-2 py-1 text-left">Table</th>
                        <th className="px-2 py-1 text-left">Slug</th>
                        <th className="px-2 py-1 text-left">Field</th>
                        <th className="px-2 py-1 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.errors.slice(0, 50).map((err, i) => (
                        <tr key={i} className="border-b border-gray-100">
                          <td className="px-2 py-1">{err.row}</td>
                          <td className="px-2 py-1">{err.table}</td>
                          <td className="px-2 py-1 truncate max-w-[120px]">{err.slug || err.product_slug || '-'}</td>
                          <td className="px-2 py-1">{err.field || '-'}</td>
                          <td className="px-2 py-1 text-red-600">{err.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {uploadResult.errors.length > 50 && (
                    <p className="text-xs text-gray-500 mt-2">...dan {uploadResult.errors.length - 50} error lainnya</p>
                  )}
                </div>
              )}
              {uploadResult.db_changes && (
                <div className="mt-2 text-xs text-green-700">
                  DB: Products {uploadResult.db_changes.products?.inserted || 0} new + {uploadResult.db_changes.products?.updated || 0} updated ·
                  Variants {uploadResult.db_changes.variants?.inserted || 0} new + {uploadResult.db_changes.variants?.updated || 0} updated
                </div>
              )}
            </div>
          )}
        </section>

        {/* === SEARCH + FILTER === */}
        <section className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="🔍 Search by name or slug..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-md"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
              ))}
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <span className="text-sm text-gray-500">
              {filteredProducts.length} of {products.length}
            </span>
          </div>
        </section>

        {/* === BULK ACTIONS === */}
        {selectedProducts.size > 0 && (
          <section className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-blue-900">
                {selectedProducts.size} produk terpilih
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkEditMode(!bulkEditMode)}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded-md hover:bg-blue-100"
                >
                  {bulkEditMode ? 'Cancel' : '✏ Bulk Edit'}
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
                >
                  🗑 Hapus ({selectedProducts.size})
                </button>
                <button
                  onClick={() => setSelectedProducts(new Set())}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
              </div>
            </div>

            {bulkEditMode && (
              <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-blue-200">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Base Price</label>
                  <input
                    type="number"
                    value={bulkValues.base_price}
                    onChange={(e) => setBulkValues({ ...bulkValues, base_price: e.target.value })}
                    placeholder="e.g., 95000"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Weight (g)</label>
                  <input
                    type="number"
                    value={bulkValues.weight_in_gram}
                    onChange={(e) => setBulkValues({ ...bulkValues, weight_in_gram: e.target.value })}
                    placeholder="e.g., 800"
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Badge</label>
                  <select
                    value={bulkValues.badge}
                    onChange={(e) => setBulkValues({ ...bulkValues, badge: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="">— No change —</option>
                    <option value="Best Seller">Best Seller</option>
                    <option value="Baru">Baru</option>
                    <option value="(clear)">Clear</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Active</label>
                  <select
                    value={bulkValues.is_active}
                    onChange={(e) => setBulkValues({ ...bulkValues, is_active: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                  >
                    <option value="">— No change —</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
                <div className="col-span-4">
                  <button
                    onClick={applyBulkUpdate}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Apply to {selectedProducts.size} selected
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* === PRODUCTS TABLE (dengan expandable variant rows) === */}
        <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Memuat produk...</p>
          ) : error ? (
            <p className="text-center text-red-500 py-12">Error: {error}</p>
          ) : filteredProducts.length === 0 ? (
            <p className="text-center text-gray-500 py-12">Tidak ada produk.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 w-8"></th> {/* expand toggle */}
                    <th className="px-3 py-2 w-8 text-left">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleSelectAll}
                        className="cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Category</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Base Price</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700">Weight (g)</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Badge</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700">Active</th>
                    <th className="px-3 py-2 text-center font-medium text-gray-700">Variants</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <React.Fragment key={p.id}>
                      {/* === PRODUCT ROW === */}
                      <tr
                        className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => setEditingProduct(p)}
                      >
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingProduct(p)}
                              className="text-gray-400 hover:text-blue-600 text-xs px-1"
                              title="Edit produk (Shopee-style panel)"
                            >
                              ✏
                            </button>
                            <button
                              onClick={() => handleDeleteSingle(p)}
                              className="text-gray-400 hover:text-red-600 text-xs px-1"
                              title="Hapus produk"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">{p.name}</div>
                          <div className="text-xs text-gray-500">{p.slug}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {p.category || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {formatPrice(p.base_price)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {p.weight_in_gram || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {p.badge ? (
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">
                              {p.badge}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                        </td>
                        <td className="px-3 py-2 text-center text-gray-600">
                          {p.product_variants?.length || 0}
                          {(p.product_variants || []).filter(v => v.is_active).length > 0 && (
                            <span className="text-xs text-green-600 ml-1">
                              ({(p.product_variants || []).filter(v => v.is_active).length})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {p.updated_at ? new Date(p.updated_at).toLocaleDateString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          }) : '—'}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs text-gray-400 mt-4 text-center">
          EGLUX Admin — hidden page. All operations via edge functions (service_role). Auto-save per cell.
        </p>
      </div>

      {/* Edit Product Panel (Shopee-style slide-in) */}
      {editingProduct && (
        <EditProductPanel
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={fetchProducts}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-md shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' :
          toast.type === 'error' ? 'bg-red-600 text-white' :
          toast.type === 'warning' ? 'bg-amber-500 text-white' :
          'bg-gray-800 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !deleting && setDeleteConfirm(null)}
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {deleteConfirm.isBulk ? `Hapus ${deleteConfirm.productIds.length} Produk?` : 'Hapus Produk?'}
                </h3>
                <p className="text-sm text-gray-500">Tindakan ini tidak bisa dibatalkan.</p>
              </div>
            </div>

            {/* Warning text */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700">
                Semua data berikut akan dihapus permanen:
              </p>
              <ul className="text-xs text-red-600 mt-1.5 ml-4 list-disc">
                <li>Product row dari database</li>
                <li>Semua variants dari product ini</li>
                <li>Semua images dari Storage & database</li>
              </ul>
            </div>

            {/* Product names preview (max 5) */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Produk yang akan dihapus:
              </p>
              <div className="bg-gray-50 rounded-lg p-2 max-h-[120px] overflow-y-auto">
                {deleteConfirm.productNames.slice(0, 5).map((name, i) => (
                  <p key={i} className="text-sm text-gray-700 truncate">• {name}</p>
                ))}
                {deleteConfirm.productNames.length > 5 && (
                  <p className="text-xs text-gray-500 mt-1">
                    ...dan {deleteConfirm.productNames.length - 5} produk lainnya
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Menghapus...
                  </>
                ) : (
                  `🗑 Hapus Permanen`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProductsPage;
