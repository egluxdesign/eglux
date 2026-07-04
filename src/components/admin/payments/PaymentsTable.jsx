// src/components/admin/payments/PaymentsTable.jsx
import { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Ban,
  RotateCcw,
  Eye
} from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

// Kunci di sini HARUS sama persis dengan nilai yang ditulis webhook Midtrans
// (mapMidtransStatus): success, pending, challenge, failed, cancelled, expired, refunded.
const PAYMENT_STATUS_CONFIG = {
  pending:   { label: 'Pending',   icon: Clock,         color: 'text-amber-500',  bg: 'bg-amber-50',   border: 'border-amber-100' },
  challenge: { label: 'Challenge', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50',  border: 'border-orange-100' },
  success:   { label: 'Success',   icon: CheckCircle,   color: 'text-emerald-500',bg: 'bg-emerald-50', border: 'border-emerald-100' },
  failed:    { label: 'Failed',    icon: XCircle,       color: 'text-red-500',    bg: 'bg-red-50',     border: 'border-red-100' },
  cancelled: { label: 'Cancelled', icon: Ban,           color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-100' },
  expired:   { label: 'Expired',   icon: AlertTriangle, color: 'text-gray-400',   bg: 'bg-gray-50',    border: 'border-gray-100' },
  refunded:  { label: 'Refunded',  icon: RotateCcw,     color: 'text-blue-500',   bg: 'bg-blue-50',    border: 'border-blue-100' },
};

const PaymentStatusBadge = ({ status }) => {
  const config = PAYMENT_STATUS_CONFIG[status] || PAYMENT_STATUS_CONFIG.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${config.bg} ${config.border} text-[0.75rem] font-medium`}>
      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      <span className={config.color}>{config.label}</span>
    </span>
  );
};

// payment_method gak ada di tabel payments — info metode bayar (qris, gopay,
// bank_transfer, dll) ada di dalam raw_payload (field payment_type dari Midtrans).
const formatMethod = (payment) => {
  const raw = payment.raw_payload?.payment_type || payment.provider;
  if (!raw) return 'N/A';
  return String(raw).replace(/_/g, ' ');
};

const PaymentsTable = ({ 
  payments, 
  loading, 
  sortConfig,
  onSort,
  onViewDetail,
}) => {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const totalPages = Math.ceil(payments.length / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const paginatedPayments = payments.slice(startIndex, startIndex + rowsPerPage);

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
              <div className="w-10 h-10 bg-gray-200 rounded-lg" />
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

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-12 text-center">
        <div className="w-16 h-16 bg-[#f8f9fc] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <CreditCard className="w-8 h-8 text-[#d1d5db]" />
        </div>
        <h3 className="text-[1rem] font-semibold text-[#1a1d2b] mb-1">No payments found</h3>
        <p className="text-[0.85rem] text-[#9ca3af]">Payments will appear here when customers complete transactions</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f8f9fc] border-b border-[#e8ecf4]">
              <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Customer / Order</th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('amount')}
              >
                <div className="flex items-center gap-1">Amount {getSortIcon('amount')}</div>
              </th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center gap-1">Status {getSortIcon('status')}</div>
              </th>
              <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Method</th>
              <th 
                className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider cursor-pointer hover:text-[#1a1d2b] transition-colors"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-1">Date {getSortIcon('created_at')}</div>
              </th>
              <th className="px-4 py-3 text-left text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Reference ID</th>
              <th className="px-4 py-3 text-right text-[0.75rem] font-semibold text-[#6b7280] uppercase tracking-wider">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {paginatedPayments.map((payment) => (
              <tr key={payment.id} className="hover:bg-[#f8f9fc] transition-colors">
                <td className="px-4 py-3.5">
                  <div>
                    <p className="text-[0.85rem] font-medium text-[#1a1d2b]">
                      {payment.orders?.customers?.name || 'Unknown Customer'}
                    </p>
                    <p className="text-[0.75rem] text-[#9ca3af] font-mono">
                      Order #{payment.order_id?.slice(0, 8) || 'N/A'}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.85rem] font-semibold text-[#1a1d2b]">{rupiah(payment.amount)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <PaymentStatusBadge status={payment.status} />
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.8rem] text-[#6b7280] capitalize">{formatMethod(payment)}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.8rem] text-[#6b7280]">
                    {new Date(payment.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[0.75rem] font-mono text-[#9ca3af]">{payment.provider_reference_id || '—'}</span>
                </td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => onViewDetail(payment)}
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
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8ecf4] flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[0.8rem] text-[#6b7280]">
            Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, payments.length)} of {payments.length} payments
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

export default PaymentsTable;