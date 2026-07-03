// src/components/admin/products/ProductsTable.jsx
import { useState, useEffect } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  MoreHorizontal,
  Image as ImageIcon,
  AlertTriangle
} from 'lucide-react';
import ProductStatusBadge from './ProductStatusBadge';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const ProductsTable = ({ 
  products, 
  loading, 
  selectedProducts, 
  onSelectProduct, 
  onSelectAll,
  onEdit,
  onDelete,
  onStatusChange,
  sortConfig,
  onSort
}) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('[data-product-action-menu]')) setActionMenuOpen(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalPages = Math.ceil(products.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedProducts = products.slice(startIndex, startIndex + rowsPerPage);
  const allSelected = paginatedProducts.length > 0 && paginatedProducts.every(p => selectedProducts.includes(p.id));

  const handleSort = (key) => onSort(key);

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3.5 h-3.5 text-[#9ca3af]" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-[#c9a96e]" />
      : <ArrowDown className="w-3.5 h-3.5 text-[#c9a96e]" />;
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      setActionMenuOpen(null);
    }
  };

  const handleDelete = (product) => {
    setDeleteConfirm(product);
    setActionMenuOpen(null);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      onDelete(deleteConfirm.id);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
        <div className="p-8 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div className="w-12 h-12 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-200 rounded w-24" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-6 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-12 text-center">
        <div className="w-16 h-16 bg-[#f8f9fc] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="w-8 h-8 text-[#d1d5db]" />
        </div>
        <h3 className="text-[1rem] font-semibold text-[#1a1d2b] mb-1">No products found</h3>
        <p className="text-[0.85rem] text-[#9ca3af]">Try adjusting your filters or add a new product</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-[#e8ecf4]">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onSelectAll(paginatedProducts.map(p => p.id), e.target.checked)}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#c9a96e] focus:ring-[#c9a96e] cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Product</th>
                <th 
                  className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center gap-1">Category {getSortIcon('category')}</div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                  onClick={() => handleSort('base_price')}
                >
                  <div className="flex items-center gap-1">Base Price {getSortIcon('base_price')}</div>
                </th>
                <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">
                  Stock
                </th>
                <th 
                  className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                  onClick={() => handleSort('is_active')}
                >
                  <div className="flex items-center gap-1">Status {getSortIcon('is_active')}</div>
                </th>
                <th className="px-4 py-3 text-right text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {paginatedProducts.map((product) => (
                <tr 
                  key={product.id} 
                  className={`hover:bg-[#f8f9fc] transition-colors ${selectedProducts.includes(product.id) ? 'bg-[#c9a96e]/5' : ''}`}
                >
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={(e) => onSelectProduct(product.id, e.target.checked)}
                      className="w-4 h-4 rounded border-[#d1d5db] text-[#c9a96e] focus:ring-[#c9a96e] cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#f8f9fc] rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {product.primaryImage ? (
                          <img src={product.primaryImage} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-[#d1d5db]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[0.85rem] font-medium text-[#1a1d2b] truncate">{product.name}</p>
                        <p className="text-[0.75rem] text-[#9ca3af]">{product.variants?.length || 0} variant(s)</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[0.8rem] text-[#6b7280] capitalize">{product.category || 'N/A'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{rupiah(product.base_price)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[0.85rem] font-medium ${(product.stock || 0) < 5 ? 'text-red-500' : 'text-[#1a1d2b]'}`}>
                        {product.stock || 0}
                      </span>
                      {(product.stock || 0) < 5 && (
                        <AlertTriangle className="w-4 h-4 text-red-500" title="Low stock" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <ProductStatusBadge isActive={product.is_active} size="sm" />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(product)}
                        className="p-1.5 hover:bg-[#f8f9fc] rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-[#6b7280]" />
                      </button>
                      <button
                        onClick={() => handleDelete(product)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                      <div className="relative" data-product-action-menu>
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === product.id ? null : product.id)}
                          className="p-1.5 hover:bg-[#f8f9fc] rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4 text-[#6b7280]" />
                        </button>
                        {actionMenuOpen === product.id && (
                          <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-[#e8ecf4] py-1 z-10">
                            <button
                              onClick={() => { onStatusChange(product.id, !product.is_active); setActionMenuOpen(null); }}
                              className="w-full text-left px-4 py-2 text-[0.8rem] text-[#6b7280] hover:bg-[#f8f9fc] hover:text-[#1a1d2b] transition-colors"
                            >
                              Mark as {product.is_active ? 'Inactive' : 'Active'}
                            </button>
                            <div className="border-t border-[#f3f4f6] my-1" />
                            <button
                              onClick={() => handleDelete(product)}
                              className="w-full text-left px-4 py-2 text-[0.8rem] text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Delete Product
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8ecf4] flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[0.8rem] text-[#6b7280]">
              Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, products.length)} of {products.length} products
            </span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              className="px-2 py-1 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.8rem] outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => handlePageChange(1)} disabled={page === 1} className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors">
              <ChevronsLeft className="w-4 h-4 text-[#6b7280]" />
            </button>
            <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4 text-[#6b7280]" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              return (
                <button key={pageNum} onClick={() => handlePageChange(pageNum)}
                  className={`w-8 h-8 rounded-lg text-[0.8rem] font-medium transition-colors ${page === pageNum ? 'bg-[#1a1d2b] text-white' : 'text-[#6b7280] hover:bg-[#f8f9fc]'}`}>
                  {pageNum}
                </button>
              );
            })}
            <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4 text-[#6b7280]" />
            </button>
            <button onClick={() => handlePageChange(totalPages)} disabled={page === totalPages} className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors">
              <ChevronsRight className="w-4 h-4 text-[#6b7280]" />
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] p-6">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-[1.1rem] font-bold text-[#1a1d2b] text-center mb-2">Delete Product?</h3>
            <p className="text-[0.85rem] text-[#6b7280] text-center mb-6">
              Are you sure you want to delete <strong>{deleteConfirm.name}</strong>? This action cannot be undone.
              Kalau produk ini pernah dipesan customer, penghapusan bakal ditolak otomatis.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 bg-[#f8f9fc] text-[#1a1d2b] rounded-xl text-[0.85rem] font-medium hover:bg-[#f0f1f5] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-[0.85rem] font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductsTable;