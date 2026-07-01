// src/components/admin/products/ProductsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ProductFilters from './ProductFilters';
import ProductsTable from './ProductsTable';
import ProductForm from './ProductForm';
import { Package } from 'lucide-react';

const ProductsPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select('*, product_variants(*)')
      .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter);
    }

    const { data } = await query;
    let result = data || [];

    // Calculate total stock from variants
    result = result.map(p => ({
      ...p,
      stock: p.product_variants?.reduce((sum, v) => sum + (v.stock || 0), 0) || p.stock || 0,
      variants: p.product_variants || []
    }));

    // Client-side search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
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
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectProduct = (id, checked) => {
    setSelectedProducts(prev => 
      checked ? [...prev, id] : prev.filter(pid => pid !== id)
    );
  };

  const handleSelectAll = (ids, checked) => {
    setSelectedProducts(prev => 
      checked 
        ? [...new Set([...prev, ...ids])]
        : prev.filter(id => !ids.includes(id))
    );
  };

  const handleSaveProduct = async (productData) => {
    const { variants, ...productInfo } = productData;

    if (editingProduct) {
      // Update product
      const { data: updatedProduct } = await supabase
        .from('products')
        .update(productInfo)
        .eq('id', editingProduct.id)
        .select()
        .single();

      // Handle variants
      if (variants && variants.length > 0) {
        // Delete old variants
        await supabase.from('product_variants').delete().eq('product_id', editingProduct.id);
        // Insert new variants
        await supabase.from('product_variants').insert(
          variants.map(v => ({ ...v, product_id: editingProduct.id }))
        );
      }
    } else {
      // Create product
      const { data: newProduct } = await supabase
        .from('products')
        .insert(productInfo)
        .select()
        .single();

      // Insert variants
      if (variants && variants.length > 0 && newProduct) {
        await supabase.from('product_variants').insert(
          variants.map(v => ({ ...v, product_id: newProduct.id }))
        );
      }
    }

    setShowForm(false);
    setEditingProduct(null);
    fetchProducts();
  };

  const handleDelete = async (id) => {
    await supabase.from('products').delete().eq('id', id);
    fetchProducts();
  };

  const handleStatusChange = async (id, newStatus) => {
    await supabase.from('products').update({ status: newStatus }).eq('id', id);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
  };

  const handleBulkStatusChange = async (newStatus) => {
    await supabase.from('products').update({ status: newStatus }).in('id', selectedProducts);
    setProducts(prev => prev.map(p => selectedProducts.includes(p.id) ? { ...p, status: newStatus } : p));
    setSelectedProducts([]);
  };

  const handleBulkDelete = async () => {
    await supabase.from('products').delete().in('id', selectedProducts);
    setSelectedProducts([]);
    fetchProducts();
  };

  const handleExport = () => {
    const csv = [
      ['ID', 'Name', 'SKU', 'Category', 'Base Price', 'Stock', 'Status'].join(','),
      ...products.map(p => [
        p.id,
        `"${p.name}"`,
        p.sku,
        p.category,
        p.base_price,
        p.stock,
        p.status
      ].join(','))
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
  const lowStockCount = products.filter(p => (p.stock || 0) < 5 && p.status === 'active').length;

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Products</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">
            Manage your product catalog
          </p>
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