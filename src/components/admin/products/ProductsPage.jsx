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
  const handleSaveProduct = async (formData) => {
  const { 
    productInfo, images, removedImageIds, 
    variants, removedVariantIds, removedVariantImageIds 
  } = formData;

  try {
    let productId = editingProduct?.id;

    // 1. Insert / Update Produk Utama
    if (productId) {
      const { error } = await supabase.from('products').update(productInfo).eq('id', productId);
      if (error) throw new Error(`Gagal update produk: ${error.message}`);
    } else {
      const { data, error } = await supabase.from('products').insert(productInfo).select('id').single();
      if (error) throw new Error(`Gagal buat produk: ${error.message}`);
      productId = data.id;
    }

    // 2. Hapus Gambar Produk Lama yang Dihapus User
    if (removedImageIds.length > 0) {
      const { error } = await supabase.from('product_images').delete().in('id', removedImageIds);
      if (error) throw new Error(`Gagal hapus gambar lama: ${error.message}`);
    }

    // 3. Hapus Gambar Varian Lama yang Dihapus User
    if (removedVariantImageIds.length > 0) {
      const { error } = await supabase.from('product_images').delete().in('id', removedVariantImageIds);
      if (error) throw new Error(`Gagal hapus gambar varian: ${error.message}`);
    }

    // 4. Hapus Varian yang Dihapus User
    if (removedVariantIds.length > 0) {
      const { error } = await supabase.from('product_variants').delete().in('id', removedVariantIds);
      if (error) throw new Error(`Gagal hapus varian: ${error.message}`);
    }

    // 5. Looping Varian (Insert/Update + Upload Gambar Varian)
    for (const v of variants) {
      let variantId = v.id;
      const variantPayload = {
        product_id: productId,
        name: v.name,
        attributes: v.attributes,
        price: v.price,
        stock: v.stock,
        sku: v.sku,
        is_active: v.is_active,
      };

      if (variantId) {
        const { error } = await supabase.from('product_variants').update(variantPayload).eq('id', variantId);
        if (error) throw new Error(`Gagal update varian "${v.name}": ${error.message}`);
      } else {
        const { data, error } = await supabase.from('product_variants').insert(variantPayload).select('id').single();
        if (error) throw new Error(`Gagal buat varian "${v.name}": ${error.message}`);
        variantId = data.id;
      }

      // Kalau varian punya gambar baru, upload ke Storage lalu insert ke DB
      if (v.image?.isNew && v.image.file) {
        const fileExt = v.image.file.name.split('.').pop();
        const filePath = `products/${productId}/variants/${variantId}-${Date.now()}.${fileExt}`;
        
        const { error: uploadErr } = await supabase.storage
          .from('product-images') // Pastikan nama bucket ini sama dengan yang lu pakai
          .upload(filePath, v.image.file);
          
        if (uploadErr) throw new Error(`Gagal upload gambar varian "${v.name}": ${uploadErr.message}`);

        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath);

        const { error: dbErr } = await supabase.from('product_images').insert({
          product_id: productId,
          variant_id: variantId, // <-- Disinilah gunanya kolom baru
          url: urlData.publicUrl,
          is_primary: false,
          position: 0,
        });
        if (dbErr) throw new Error(`Gagal simpan data gambar varian: ${dbErr.message}`);
      }
    }

    // 6. Looping Gambar Produk Utama (Bukan Varian)
    for (const img of images) {
      if (img.isNew && img.file) {
        const fileExt = img.file.name.split('.').pop();
        const filePath = `products/${productId}/${Date.now()}-${img._key}.${fileExt}`;
        
        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(filePath, img.file);
          
        if (uploadErr) throw new Error(`Gagal upload gambar produk: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(filePath);

        const { error: dbErr } = await supabase.from('product_images').insert({
          product_id: productId,
          variant_id: null, // Null karena ini gambar level produk
          url: urlData.publicUrl,
          is_primary: img.isPrimary,
          position: img.position,
        });
        if (dbErr) throw new Error(`Gagal simpan data gambar produk: ${dbErr.message}`);
        
      } else if (!img.isNew && img.isPrimary) {
        // Kalau gambar lama yang di-set jadi primary
        await supabase.from('product_images').update({ is_primary: true }).eq('id', img.id);
      }
    }

    // 7. Selesai, refresh data & tutup modal
    await fetchProducts(); // Ganti dengan function fetch lu sendiri
    setShowForm(false);
    setEditingProduct(null);

  } catch (err) {
    // Error ini bakal ditangkap oleh ProductForm.jsx dan ditampilkan di layar
    throw new Error(err.message); 
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