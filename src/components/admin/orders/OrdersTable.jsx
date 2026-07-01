// src/components/admin/orders/OrdersTable.jsx
import { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  MoreHorizontal
} from 'lucide-react';
import StatusBadge from './StatusBadge';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const OrdersTable = ({ 
  orders, 
  loading, 
  selectedOrders, 
  onSelectOrder, 
  onSelectAll,
  onViewDetail,
  onStatusChange,
  sortConfig,
  onSort
}) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [actionMenuOpen, setActionMenuOpen] = useState(null);

  const totalPages = Math.ceil(orders.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedOrders = orders.slice(startIndex, startIndex + rowsPerPage);
  const allSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedOrders.includes(o.id));

  const handleSort = (key) => {
    onSort(key);
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3.5 h-3.5 text-[#9ca3af]" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-[#c9a96e]" />
      : <ArrowDown className="w-3.5 h-3.5 text-[#c9a96e]" />;
  };

  const toWIB = (iso) =>
    new Date(iso).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
      setActionMenuOpen(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
        <div className="p-8 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-4 h-4 bg-gray-200 rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-200 rounded w-24" />
              </div>
              <div className="h-3 bg-gray-200 rounded w-20" />
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-6 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-12 text-center">
        <div className="w-16 h-16 bg-[#f8f9fc] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#d1d5db]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-[1rem] font-semibold text-[#1a1d2b] mb-1">No orders found</h3>
        <p className="text-[0.85rem] text-[#9ca3af]">Try adjusting your filters or search query</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f8f9fc] border-b border-[#e8ecf4]">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(paginatedOrders.map(o => o.id), e.target.checked)}
                  className="w-4 h-4 rounded border-[#d1d5db] text-[#c9a96e] focus:ring-[#c9a96e] cursor-pointer"
                />
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('id')}
              >
                <div className="flex items-center gap-1">Order ID {getSortIcon('id')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('customers.name')}
              >
                <div className="flex items-center gap-1">Customer {getSortIcon('customers.name')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-1">Date {getSortIcon('created_at')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('total_amount')}
              >
                <div className="flex items-center gap-1">Amount {getSortIcon('total_amount')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
              </th>
              <th className="px-4 py-3 text-right text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {paginatedOrders.map((order) => (
              <tr 
                key={order.id} 
                className={`hover:bg-[#f8f9fc] transition-colors ${selectedOrders.includes(order.id) ? 'bg-[#c9a96e]/5' : ''}`}
              >
                <td className="px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order.id)}
                    onChange={(e) => onSelectOrder(order.id, e.target.checked)}
                    className="w-4 h-4 rounded border-[#d1d5db] text-[#c9a96e] focus:ring-[#c9a96e] cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.8rem] font-mono text-[#6b7280]">#{order.id.slice(0, 8)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <div>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b]">{order.customers?.name || 'N/A'}</p>
                    <p className="text-[0.75rem] text-[#9ca3af]">{order.customers?.phone || ''}</p>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.8rem] text-[#6b7280]">{toWIB(order.created_at)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{rupiah(order.total_amount)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={order.status} size="sm" />
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onViewDetail(order.id)}
                      className="p-1.5 hover:bg-[#f8f9fc] rounded-lg transition-colors"
                      title="View Detail"
                    >
                      <Eye className="w-4 h-4 text-[#6b7280]" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={() => setActionMenuOpen(actionMenuOpen === order.id ? null : order.id)}
                        className="p-1.5 hover:bg-[#f8f9fc] rounded-lg transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4 text-[#6b7280]" />
                      </button>
                      {actionMenuOpen === order.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-[#e8ecf4] py-1 z-10">
                          {['pending', 'confirmed', 'paid', 'shipped', 'cancelled'].map((status) => (
                            <button
                              key={status}
                              onClick={() => { onStatusChange(order.id, status); setActionMenuOpen(null); }}
                              className="w-full text-left px-4 py-2 text-[0.8rem] text-[#6b7280] hover:bg-[#f8f9fc] hover:text-[#1a1d2b] transition-colors capitalize"
                            >
                              Mark as {status}
                            </button>
                          ))}
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
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8ecf4]">
        <div className="flex items-center gap-3">
          <span className="text-[0.8rem] text-[#6b7280]">
            Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, orders.length)} of {orders.length} orders
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
          <button
            onClick={() => handlePageChange(1)}
            disabled={page === 1}
            className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronsLeft className="w-4 h-4 text-[#6b7280]" />
          </button>
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-[#6b7280]" />
          </button>

          <div className="flex items-center gap-1 mx-2">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;

              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-8 h-8 rounded-lg text-[0.8rem] font-medium transition-colors
                    ${page === pageNum 
                      ? 'bg-[#1a1d2b] text-white' 
                      : 'text-[#6b7280] hover:bg-[#f8f9fc]'
                    }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-[#6b7280]" />
          </button>
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={page === totalPages}
            className="p-1.5 hover:bg-[#f8f9fc] rounded-lg disabled:opacity-30 transition-colors"
          >
            <ChevronsRight className="w-4 h-4 text-[#6b7280]" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrdersTable;