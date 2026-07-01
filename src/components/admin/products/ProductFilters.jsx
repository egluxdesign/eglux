// src/components/admin/products/ProductFilters.jsx
import { useState } from 'react';
import { Search, Filter, Plus, Download, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Categories' },
  { value: 'sofa', label: 'Sofa' },
  { value: 'table', label: 'Table' },
  { value: 'chair', label: 'Chair' },
  { value: 'bed', label: 'Bed' },
  { value: 'storage', label: 'Storage' },
  { value: 'lighting', label: 'Lighting' },
  { value: 'decor', label: 'Decor' },
];

const ProductFilters = ({ 
  searchQuery, 
  onSearchChange, 
  statusFilter, 
  onStatusChange,
  categoryFilter,
  onCategoryChange,
  onRefresh,
  onAddProduct,
  onExport,
  selectedCount,
  onBulkStatusChange,
  onBulkDelete
}) => {
  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] p-4 mb-4">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by product name, SKU..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all placeholder-[#9ca3af]"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <select
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all appearance-none cursor-pointer min-w-[160px]"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all appearance-none cursor-pointer min-w-[140px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl hover:bg-[#f0f1f5] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[#6b7280]" />
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl
                       text-[0.85rem] text-[#1a1d2b] hover:bg-[#f0f1f5] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={onAddProduct}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#c9a96e] text-white rounded-xl text-[0.85rem]
                       font-medium hover:bg-[#b8985e] transition-colors shadow-lg shadow-[#c9a96e]/20"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="mt-3 pt-3 border-t border-[#e8ecf4] flex items-center gap-3">
          <span className="text-[0.8rem] text-[#6b7280]">{selectedCount} product(s) selected</span>
          <div className="h-4 w-px bg-[#e8ecf4]" />
          <select
            onChange={(e) => { if (e.target.value) { onBulkStatusChange(e.target.value); e.target.value = ''; } }}
            className="px-3 py-1.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.8rem] outline-none"
            defaultValue=""
          >
            <option value="" disabled>Update Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <button
            onClick={onBulkDelete}
            className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-[0.8rem]
                       hover:bg-red-100 transition-colors"
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductFilters;