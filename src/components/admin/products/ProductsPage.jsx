// src/components/admin/products/ProductsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ProductFilters from './ProductFilters';
import ProductsTable from './ProductsTable';
import ProductForm from './ProductForm';
import { Package, AlertTriangle } from 'lucide-react';

// Postgres error code buat foreign key violation — dipakai buat kasih pesan
// yang jelas ke admin kalau coba hapus produk/varian yang masih direferensikan
// order lama, bukannya nampilin error mentah dari database.
const FK_VIOLATION = '23503';

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    let query = supabase
      .from('products')
      .select('*, product_variants(*), product_images(*)')
      .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (statusFilter !== 'all') {
      query = query.eq('is_active', statusFilter === 'active');
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter);
    }

    const { data, error } = await query;

    if (error) {
      setFetchError('Gagal memuat produk. Coba refresh.');
      setProducts([]);
      setLoading(false);
      return;
    }

    let result = (data || []).map((p) => ({
      ...p,
      variants: p.product_variants || [],
      images: p.product_images || [],
      stock: (p.product_variants || []).reduce((sum, v) => sum + (v.stock || 0), 0),
      primaryImage:
        (p.product_images || []).find((img) => img.is_primary)?.url ||
        (p.product_images || [])[0]?.url ||
        null,
    }));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku?.toLowerCase().includes(q))
      );
    }

    setProducts(result);
    setSelectedProducts([]);
    setLoading(false);
  }, [statusFilter, categoryFilter, searchQuery, sortConfig]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleSelectProduct = (id, checked) => {
    setSelectedProducts((prev) => (checked ? [...prev, id] : prev.filter((pid) => pid !== id)));
  };

  const handleSelectAll = (ids, checked) => {
    setSelectedProducts((prev) =>
      checked ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id))
    );
  };

  // ── Save (create/update) ───────────────────────────────────
  // Alurnya bertahap: 1) simpan baris produk dulu buat dapet product_id yang valid,
  // 2) baru upload gambar & proses varian yang butuh product_id itu.
  const handleSaveProduct = async ({ productInfo, variants, removedVariantIds, uploadNewImages, removedImageIds }) => {
    let productId = editingProduct?.id;

    if (editingProduct) {
      const { error } = await supabase.from('products').update(productInfo).eq('id', productId);
      if (error) throw new Error(mapSlugError(error) || 'Gagal update produk.');
    } else {
      const { data: newProduct, error } = await supabase
        .from('products')
        .insert(productInfo)
        .select()
        .single();
      if (error) throw new Error(mapSlugError(error) || 'Gagal membuat produk.');
      productId = newProduct.id;
    }

    // ── Images ──
    // Hapus gambar yang di-remove admin (dari Storage & tabel product_images)
    if (removedImageIds.length > 0) {
      const { data: toDelete } = await supabase
        .from('product_images')
        .select('id, url')
        .in('id', removedImageIds);

      for (const img of toDelete || []) {
        const path = extractStoragePath(img.url, productId);
        if (path) await supabase.storage.from('product-images').remove([path]);
      }
      await supabase.from('product_images').delete().in('id', removedImageIds);
    }

    // Upload file baru ke Storage, lalu upsert semua baris gambar (lama + baru)
    const resolvedImages = await uploadNewImages(productId);
    for (const img of resolvedImages) {
      if (img.id) {
        await supabase
          .from('product_images')
          .update({ is_primary: img.is_primary, position: img.position })
          .eq('id', img.id);
      } else {
        await supabase.from('product_images').insert({
          product_id: productId,
          url: img.url,
          is_primary: img.is_primary,
          position: img.position,
        });
      }
    }

    // ── Variants ──
    // Update yang punya id (udah ada di DB), insert yang belum, hapus yang di-remove.
    // Kalau ada varian yang gagal dihapus karena masih direferensikan order lama,
    // fallback-nya di-nonaktifkan aja (is_active: false) daripada bikin seluruh save gagal.
    for (const v of variants) {
      const payload = {
        product_id: productId,
        name: v.name,
        attributes: v.attributes,
        price: v.price,
        stock: v.stock,
        sku: v.sku,
        is_active: v.is_active,
      };
      if (v.id) {
        await supabase.from('product_variants').update(payload).eq('id', v.id);
      } else {
        await supabase.from('product_variants').insert(payload);
      }
    }

    const skippedDeletes = [];
    for (const variantId of removedVariantIds) {
      const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
      if (error) {
        if (error.code === FK_VIOLATION) {
          // Varian ini pernah dipakai di order — jangan dihapus, nonaktifkan aja
          await supabase.from('product_variants').update({ is_active: false }).eq('id', variantId);
          skippedDeletes.push(variantId);
        } else {
          throw new Error('Gagal menghapus salah satu varian.');
        }
      }
    }

    setShowForm(false);
    setEditingProduct(null);
    await fetchProducts();

    if (skippedDeletes.length > 0) {
      setActionError(
        `${skippedDeletes.length} varian gak bisa dihapus karena pernah dipesan customer — otomatis dinonaktifkan aja.`
      );
    }
  };

  // Ekstrak path Storage dari public URL, buat keperluan .remove()
  const extractStoragePath = (url, productId) => {
    const marker = '/product-images/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
  };

  const mapSlugError = (error) => {
    if (error.code === '23505' && error.message?.includes('slug')) {
      return 'Slug ini udah dipakai produk lain. Ganti slug-nya, ya.';
    }
    return null;
  };

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setActionError(null);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      if (error.code === FK_VIOLATION) {
        setActionError('Produk ini pernah dipesan customer, jadi gak bisa dihapus. Nonaktifkan aja produknya.');
      } else {
        setActionError('Gagal menghapus produk.');
      }
      return;
    }
    fetchProducts();
  };

  const handleBulkDelete = async () => {
    setActionError(null);
    const targetIds = [...selectedProducts];
    let failedCount = 0;

    for (const id of targetIds) {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) failedCount += 1;
    }

    setSelectedProducts([]);
    fetchProducts();

    if (failedCount > 0) {
      setActionError(
        `${failedCount} produk gak bisa dihapus karena pernah dipesan customer. Nonaktifkan aja produk itu secara manual.`
      );
    }
  };

  const handleStatusChange = async (id, isActive) => {
    setActionError(null);
    const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id);
    if (error) {
      setActionError('Gagal update status produk.');
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)));
  };

  const handleBulkStatusChange = async (isActive) => {
    setActionError(null);
    const { error } = await supabase.from('products').update({ is_active: isActive }).in('id', selectedProducts);
    if (error) {
      setActionError('Gagal update status produk yang dipilih.');
      return;
    }
    setProducts((prev) => prev.map((p) => (selectedProducts.includes(p.id) ? { ...p, is_active: isActive } : p)));
    setSelectedProducts([]);
  };

  const csvField = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'Category', 'Base Price', 'Total Stock', 'Status', 'Variant Count'].join(','),
      ...products.map((p) =>
        [
          csvField(p.id),
          csvField(p.name),
          csvField(p.category),
          p.base_price,
          p.stock,
          csvField(p.is_active ? 'active' : 'inactive'),
          p.variants.length,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
  const lowStockCount = products.filter((p) => (p.stock || 0) < 5 && p.is_active).length;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Products</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">Manage your product catalog</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#e8ecf4]">
            <Package className="w-5 h-5 text-[#c9a96e]" />
            <div>
              <span className="text-[0.9rem] font-bold text-[#1a1d2b]">{products.length}</span>
              <span className="text-[0.75rem] text-[#9ca3af] ml-1">products</span>
            </div>
          </div>
          {lowStockCount > 0 && (
            <div className="flex items-center gap-2 bg-red-50 px-4 py-2 rounded-xl border border-red-100">
              <span className="text-[0.8rem] font-medium text-red-600">{lowStockCount} low stock</span>
            </div>
          )}
        </div>
      </div>

      {(fetchError || actionError) && (
        <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-[0.85rem]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {fetchError || actionError}
        </div>
      )}

      {/* Filters */}
      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        onRefresh={fetchProducts}
        onAddProduct={() => { setEditingProduct(null); setShowForm(true); }}
        onExport={handleExport}
        selectedCount={selectedProducts.length}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkDelete={handleBulkDelete}
      />

      {/* Table */}
      <ProductsTable
        products={products}
        loading={loading}
        selectedProducts={selectedProducts}
        onSelectProduct={handleSelectProduct}
        onSelectAll={handleSelectAll}
        onEdit={(product) => { setEditingProduct(product); setShowForm(true); }}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      {/* Product Form Modal */}
      {showForm && (
        <ProductForm
          product={editingProduct}
          onSave={handleSaveProduct}
          onCancel={() => { setShowForm(false); setEditingProduct(null); }}
        />
      )}
    </div>
  );
};

export default ProductsPage;