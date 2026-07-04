// src/components/admin/products/ProductsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ProductFilters from './ProductFilters';
import ProductsTable from './ProductsTable';
import ProductForm from './ProductForm';
import { Package, AlertTriangle } from 'lucide-react';

const FK_VIOLATION = '23503';
const STORAGE_BUCKET = 'product-images';

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
      console.error('[Products] fetch failed:', error);
      setFetchError(`Gagal memuat produk: ${error.message}`);
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
        (p.product_images || []).find((img) => img.is_primary && !img.variant_id)?.url ||
        (p.product_images || []).find((img) => !img.variant_id)?.url ||
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

  // ── Storage helper ──────────────────────────────────────────
  // Satu fungsi upload dipakai buat gambar produk maupun gambar varian,
  // biar kalau ada error upload, sumbernya jelas dan gampang dilacak.
  const uploadImageFile = async (file, folder) => {
    const ext = file.name.split('.').pop();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('[Products] Storage upload failed:', error);
      throw new Error(`Gagal upload gambar ke Storage: ${error.message}`);
    }

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const extractStoragePath = (url) => {
    const marker = `/${STORAGE_BUCKET}/`;
    const idx = url.indexOf(marker);
    return idx === -1 ? null : url.slice(idx + marker.length);
  };

  const deleteImageRows = async (ids) => {
    if (ids.length === 0) return;
    const { data: toDelete, error: fetchErr } = await supabase
      .from('product_images')
      .select('id, url')
      .in('id', ids);
    if (fetchErr) {
      console.error('[Products] Failed to look up images for deletion:', fetchErr);
      throw new Error(`Gagal mencari data gambar yang mau dihapus: ${fetchErr.message}`);
    }

    for (const img of toDelete || []) {
      const path = extractStoragePath(img.url);
      if (path) {
        const { error: storageErr } = await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        if (storageErr) console.error('[Products] Failed to delete storage object (non-fatal):', storageErr);
      }
    }

    const { error: deleteErr } = await supabase.from('product_images').delete().in('id', ids);
    if (deleteErr) {
      console.error('[Products] Failed to delete product_images rows:', deleteErr);
      throw new Error(`Gagal menghapus data gambar: ${deleteErr.message}`);
    }
  };

  const mapKnownError = (error) => {
    if (error.code === '23505' && error.message?.includes('slug')) {
      return 'Slug ini udah dipakai produk lain. Ganti slug-nya, ya.';
    }
    return error.message || 'Terjadi kesalahan.';
  };

  // ── Save (create/update) ───────────────────────────────────
  const handleSaveProduct = async ({
    productInfo, images, removedImageIds,
    variants, removedVariantIds, removedVariantImageIds,
  }) => {
    let productId = editingProduct?.id;

    // 1) Simpan baris produk dulu — semua yang lain butuh product_id yang valid.
    if (editingProduct) {
      const { error } = await supabase.from('products').update(productInfo).eq('id', productId);
      if (error) {
        console.error('[Products] update product failed:', error);
        throw new Error(mapKnownError(error));
      }
    } else {
      const { data: newProduct, error } = await supabase
        .from('products').insert(productInfo).select().single();
      if (error) {
        console.error('[Products] insert product failed:', error);
        throw new Error(mapKnownError(error));
      }
      productId = newProduct.id;
    }

    // 2) Gambar level produk: hapus yang di-remove, upload yang baru, update posisi/primary yang lama
    await deleteImageRows(removedImageIds);

    for (const img of images) {
      if (img.isNew) {
        const url = await uploadImageFile(img.file, `${productId}/product`);
        const { error } = await supabase.from('product_images').insert({
          product_id: productId,
          variant_id: null,
          url,
          is_primary: img.isPrimary,
          position: img.position,
        });
        if (error) {
          console.error('[Products] insert product_images failed:', error);
          throw new Error(`Gagal menyimpan data gambar produk: ${error.message}`);
        }
      } else if (img.id) {
        const { error } = await supabase
          .from('product_images')
          .update({ is_primary: img.isPrimary, position: img.position })
          .eq('id', img.id);
        if (error) {
          console.error('[Products] update product_images failed:', error);
          throw new Error(`Gagal update data gambar produk: ${error.message}`);
        }
      }
    }

    // 3) Varian: hapus gambar varian yang di-remove duluan (baik yang variannya dihapus atau cuma ganti foto)
    await deleteImageRows(removedVariantImageIds);

    // 4) Upsert tiap varian, lalu proses fotonya (butuh variant id yang sudah pasti valid)
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

      let variantId = v.id;
      if (v.id) {
        const { error } = await supabase.from('product_variants').update(payload).eq('id', v.id);
        if (error) {
          console.error('[Products] update variant failed:', error, payload);
          throw new Error(`Gagal update varian "${v.name}": ${error.message}`);
        }
      } else {
        const { data: newVariant, error } = await supabase
          .from('product_variants').insert(payload).select().single();
        if (error) {
          console.error('[Products] insert variant failed:', error, payload);
          throw new Error(`Gagal membuat varian "${v.name}": ${error.message}`);
        }
        variantId = newVariant.id;
      }

      if (v.image?.isNew) {
        const url = await uploadImageFile(v.image.file, `${productId}/variants/${variantId}`);
        const { error } = await supabase.from('product_images').insert({
          product_id: productId,
          variant_id: variantId,
          url,
          is_primary: true,
          position: 0,
        });
        if (error) {
          console.error('[Products] insert variant image failed:', error);
          throw new Error(`Gagal menyimpan foto varian "${v.name}": ${error.message}`);
        }
      }
    }

    // 5) Hapus varian yang di-remove admin. Kalau ketolak FK (pernah dipesan), nonaktifin aja.
    const skippedDeletes = [];
    for (const variantId of removedVariantIds) {
      const { error } = await supabase.from('product_variants').delete().eq('id', variantId);
      if (error) {
        if (error.code === FK_VIOLATION) {
          await supabase.from('product_variants').update({ is_active: false }).eq('id', variantId);
          skippedDeletes.push(variantId);
        } else {
          console.error('[Products] delete variant failed:', error);
          throw new Error(`Gagal menghapus salah satu varian: ${error.message}`);
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

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setActionError(null);
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      console.error('[Products] delete product failed:', error);
      if (error.code === FK_VIOLATION) {
        setActionError('Produk ini pernah dipesan customer, jadi gak bisa dihapus. Nonaktifkan aja produknya.');
      } else {
        setActionError(`Gagal menghapus produk: ${error.message}`);
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
      console.error('[Products] update status failed:', error);
      setActionError(`Gagal update status produk: ${error.message}`);
      return;
    }
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)));
  };

  const handleBulkStatusChange = async (isActive) => {
    setActionError(null);
    const { error } = await supabase.from('products').update({ is_active: isActive }).in('id', selectedProducts);
    if (error) {
      console.error('[Products] bulk update status failed:', error);
      setActionError(`Gagal update status produk yang dipilih: ${error.message}`);
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
          csvField(p.id), csvField(p.name), csvField(p.category),
          p.base_price, p.stock, csvField(p.is_active ? 'active' : 'inactive'), p.variants.length,
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

  const lowStockCount = products.filter((p) => (p.stock || 0) < 5 && p.is_active).length;

  return (
    <div className="space-y-4 min-w-0">
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