// src/components/admin/customers/CustomersTable.jsx
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
  Phone,
  Mail,
  ShoppingBag
} from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const CustomersTable = ({ 
  customers, 
  loading, 
  onViewDetail,
  sortConfig,
  onSort
}) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const totalPages = Math.ceil(customers.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedCustomers = customers.slice(startIndex, startIndex + rowsPerPage);

  const handleSort = (key) => onSort(key);

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3.5 h-3.5 text-[#9ca3af]" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-[#c9a96e]" />
      : <ArrowDown className="w-3.5 h-3.5 text-[#c9a96e]" />;
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
        <div className="p-8 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-200 rounded w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-12 text-center">
        <div className="w-16 h-16 bg-[#f8f9fc] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-[#d1d5db]" />
        </div>
        <h3 className="text-[1rem] font-semibold text-[#1a1d2b] mb-1">No customers found</h3>
        <p className="text-[0.85rem] text-[#9ca3af]">Customers will appear here when they place orders</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f8f9fc] border-b border-[#e8ecf4]">
              <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Customer</th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('phone')}
              >
                <div className="flex items-center gap-1">Contact {getSortIcon('phone')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('order_count')}
              >
                <div className="flex items-center gap-1">Orders {getSortIcon('order_count')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('total_spent')}
              >
                <div className="flex items-center gap-1">Total Spent {getSortIcon('total_spent')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('last_order')}
              >
                <div className="flex items-center gap-1">Last Order {getSortIcon('last_order')}</div>
              </th>
              <th className="px-4 py-3 text-right text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {paginatedCustomers.map((customer) => (
              <tr 
                key={customer.id} 
                className="hover:bg-[#f8f9fc] transition-colors"
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#c9a96e]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[0.85rem] font-bold text-[#c9a96e]">
                        {(customer.name || 'A').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-[0.85rem] font-medium text-[#1a1d2b]">{customer.name || 'N/A'}</p>
                      <p className="text-[0.75rem] text-[#9ca3af]">{customer.email || 'No email'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="space-y-1">
                    {customer.phone && (
                      <div className="flex items-center gap-1.5 text-[0.8rem] text-[#6b7280]">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-1.5 text-[0.8rem] text-[#6b7280]">
                        <Mail className="w-3 h-3" />
                        {customer.email}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-[#9ca3af]" />
                    <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{customer.order_count || 0}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{rupiah(customer.total_spent || 0)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.8rem] text-[#6b7280]">
                    {customer.last_order 
                      ? new Date(customer.last_order).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Never'
                    }
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <button
                    onClick={() => onViewDetail(customer)}
                    className="p-1.5 hover:bg-[#f8f9fc] rounded-lg transition-colors"
                    title="View Detail"
                  >
                    <Eye className="w-4 h-4 text-[#6b7280]" />
                  </button>
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
            Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, customers.length)} of {customers.length} customers
          </span>
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            className="px-2 py-1 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.8rem] outline-none"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
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
  );
};

export default CustomersTable;