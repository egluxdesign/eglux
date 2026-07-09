// src/pages/AdminProductsPage.jsx
// ============================================================================
// EGLUX Admin Products Page — bulk update via CSV/Google Sheets + inline edit
// ============================================================================
// Access: hidden storefront page at /products-admin (direct URL only)
// Auth: edge functions pakai service_role (page cuma UI trigger)
//
// Features:
//   1. Product list with search + filter (category, badge, active)
//   2. Inline edit (click cell → edit → save)
//   3. Bulk actions (select + set price/weight/stock/active)
//   4. CSV upload (file + Google Sheets URL) with validate/execute mode
//   5. Export current data (download pre-filled CSV template)
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ============================================================================
// HELPER
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const AdminProductsPage = () => {
  // State: products + variants
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State: search + filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterActive, setFilterActive] = useState('all');

  // State: inline edit
  const [editingCell, setEditingCell] = useState(null); // { type, id, field }
  const [editValue, setEditValue] = useState('');

  // State: bulk select
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkValues, setBulkValues] = useState({
    base_price: '',
    weight_in_gram: '',
    badge: '',
    is_active: '',
  });

  // State: CSV upload
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'sheets'
  const [productsFile, setProductsFile] = useState(null);
  const [variantsFile, setVariantsFile] = useState(null);
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [csvMode, setCsvMode] = useState('validate'); // 'validate' | 'execute'
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // State: export
  const [exporting, setExporting] = useState(false);

  // State: toast/notification
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
            id, name, price, stock, sku, is_active,
            weight_in_gram, length_cm, width_cm, height_cm
          )
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
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!p.name?.toLowerCase().includes(q) && !p.slug?.toLowerCase().includes(q)) {
          return false;
        }
      }
      // Filter category
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      // Filter active
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
  // INLINE EDIT
  // ============================================================================
  const startEdit = (type, id, field, currentValue) => {
    setEditingCell({ type, id, field });
    setEditValue(currentValue ?? '');
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { type, id, field } = editingCell;

    // Build update payload
    const fields = { [field]: field === 'is_active' ? editValue === 'true' : editValue };

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
        await fetchProducts(); // refresh
      } else {
        showToast(`✗ Update failed: ${result.results?.[0]?.error || 'unknown error'}`, 'error');
      }
    } catch (e) {
      showToast(`✗ Network error: ${e.message}`, 'error');
    }
    cancelEdit();
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

    // Build updates array
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
  // CSV UPLOAD
  // ============================================================================
  const handleFileUpload = async () => {
    if (!productsFile && uploadMode === 'file') {
      showToast('Pilih file products CSV dulu', 'error');
      return;
    }
    if (uploadMode === 'sheets' && !sheetsUrl) {
      showToast('Masukkan Google Sheets URL', 'error');
      return;
    }

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('mode', csvMode);

      if (uploadMode === 'file') {
        formData.append('products_csv', productsFile);
        if (variantsFile) formData.append('variants_csv', variantsFile);
      } else {
        // Google Sheets: fetch CSV content from URL, then attach as file
        // Google Sheets publish-to-web CSV URL format:
        // https://docs.google.com/spreadsheets/d/{ID}/export?format=csv
        // or https://docs.google.com/spreadsheets/d/e/{ID}/pub?output=csv

        // Fetch both sheets URLs (products + variants) — for now, assume single URL for products
        const csvText = await (await fetch(sheetsUrl)).text();
        const csvBlob = new Blob([csvText], { type: 'text/csv' });
        formData.append('products_csv', csvBlob, 'products_from_sheets.csv');
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/import-products-csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
        },
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
        if (csvMode === 'execute') {
          await fetchProducts(); // refresh list
        }
      } else {
        showToast(
          `Validation failed: ${result.errors?.length || 0} error(s). Lihat detail di bawah.`,
          'error'
        );
      }
    } catch (e) {
      showToast(`✗ Upload error: ${e.message}`, 'error');
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
        // Download both CSVs
        downloadBase64Csv(result.files.products_csv.content_base64, result.files.products_csv.filename);
        setTimeout(() => {
          downloadBase64Csv(result.files.variants_csv.content_base64, result.files.variants_csv.filename);
        }, 500);
        showToast(`✓ Export berhasil: ${result.counts.products} products + ${result.counts.variants} variants`, 'success');
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
        {/* === CSV UPLOAD SECTION === */}
        <section className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">📦 Bulk Upload via CSV</h2>

          {/* Mode tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setUploadMode('file')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                uploadMode === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📁 File Upload
            </button>
            <button
              onClick={() => setUploadMode('sheets')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                uploadMode === 'sheets' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              📊 Google Sheets URL
            </button>
          </div>

          {/* File upload mode */}
          {uploadMode === 'file' && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Products CSV <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setProductsFile(e.target.files[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {productsFile && <p className="text-xs text-green-600 mt-1">✓ {productsFile.name} ({(productsFile.size / 1024).toFixed(1)} KB)</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variants CSV <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setVariantsFile(e.target.files[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {variantsFile && <p className="text-xs text-green-600 mt-1">✓ {variantsFile.name}</p>}
              </div>
            </div>
          )}

          {/* Google Sheets mode */}
          {uploadMode === 'sheets' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Sheets CSV URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={sheetsUrl}
                onChange={(e) => setSheetsUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/e/{ID}/pub?output=csv"
                className="block w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Di Google Sheets: File → Share → Publish to web → pilih CSV → copy URL
              </p>
            </div>
          )}

          {/* Mode + Upload button */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Mode:</label>
              <select
                value={csvMode}
                onChange={(e) => setCsvMode(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="validate">Validate (dry run — cek error dulu)</option>
                <option value="execute">Execute (langsung update DB)</option>
              </select>
            </div>
            <button
              onClick={handleFileUpload}
              disabled={uploading}
              className={`px-6 py-2 text-sm font-medium rounded-md text-white ${
                csvMode === 'execute'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              } disabled:opacity-50`}
            >
              {uploading ? '⏳ Processing...' : csvMode === 'execute' ? '⚠ Execute Import' : '🔍 Validate Only'}
            </button>
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                {uploadResult.errors?.length === 0 ? '✅ Validation Report' : '❌ Validation Errors'}
              </h3>
              <div className="text-xs text-gray-600 mb-2">
                <span className="font-medium">Parsed:</span> {uploadResult.parsed?.products_valid || 0} products valid,
                {' '}{uploadResult.parsed?.products_invalid || 0} invalid ·
                {' '}{uploadResult.parsed?.variants_valid || 0} variants valid,
                {' '}{uploadResult.parsed?.variants_invalid || 0} invalid
              </div>
              {uploadResult.message && (
                <p className="text-xs text-gray-700 mb-2">{uploadResult.message}</p>
              )}
              {uploadResult.errors?.length > 0 && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Row</th>
                        <th className="px-2 py-1 text-left">Table</th>
                        <th className="px-2 py-1 text-left">Slug/ID</th>
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
                  <span className="font-medium">DB Changes:</span>
                  {' '}Products: {uploadResult.db_changes.products?.inserted || 0} new + {uploadResult.db_changes.products?.updated || 0} updated ·
                  {' '}Variants: {uploadResult.db_changes.variants?.inserted || 0} new + {uploadResult.db_changes.variants?.updated || 0} updated
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
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>
              ))}
            </select>
            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
            <span className="text-sm text-gray-500">
              {filteredProducts.length} of {products.length} products
            </span>
          </div>
        </section>

        {/* === BULK ACTIONS BAR === */}
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
                  onClick={() => setSelectedProducts(new Set())}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear selection
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Weight (gram)</label>
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
                    <option value="(clear)">Clear badge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Active Status</label>
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
                    Apply to {selectedProducts.size} selected products
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* === PRODUCTS TABLE === */}
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
                    <th className="px-3 py-2 text-left">
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
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
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
                      <td className="px-3 py-2 text-gray-600">{p.category || '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {editingCell?.type === 'product' && editingCell?.id === p.slug && editingCell?.field === 'base_price' ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              className="w-24 px-1 py-0.5 text-xs border border-blue-500 rounded"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                            />
                            <button onClick={saveEdit} className="text-xs text-green-600">✓</button>
                            <button onClick={cancelEdit} className="text-xs text-red-600">✗</button>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEdit('product', p.slug, 'base_price', p.base_price)}
                            className="cursor-pointer hover:bg-yellow-50 px-1 rounded"
                            title="Click to edit"
                          >
                            {formatPrice(p.base_price)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editingCell?.type === 'product' && editingCell?.id === p.slug && editingCell?.field === 'weight_in_gram' ? (
                          <div className="flex items-center gap-1 justify-end">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              autoFocus
                              className="w-20 px-1 py-0.5 text-xs border border-blue-500 rounded"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                            />
                            <button onClick={saveEdit} className="text-xs text-green-600">✓</button>
                            <button onClick={cancelEdit} className="text-xs text-red-600">✗</button>
                          </div>
                        ) : (
                          <span
                            onClick={() => startEdit('product', p.slug, 'weight_in_gram', p.weight_in_gram)}
                            className="cursor-pointer hover:bg-yellow-50 px-1 rounded"
                            title="Click to edit"
                          >
                            {p.weight_in_gram || '—'}
                          </span>
                        )}
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
                            ({(p.product_variants || []).filter(v => v.is_active).length} active)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {p.updated_at ? new Date(p.updated_at).toLocaleDateString('id-ID', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer note */}
        <p className="text-xs text-gray-400 mt-4 text-center">
          EGLUX Admin — hidden page. All operations via edge functions (service_role). No direct DB access from browser.
        </p>
      </div>

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
    </div>
  );
};

export default AdminProductsPage;
