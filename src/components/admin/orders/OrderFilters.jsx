// src/components/admin/orders/OrderFilters.jsx
import { useState } from 'react';
import { Search, Filter, Calendar, ChevronDown, Download, RefreshCw } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'paid', label: 'Paid' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
];

const OrderFilters = ({ 
  searchQuery, 
  onSearchChange, 
  statusFilter, 
  onStatusChange,
  dateRange,
  onDateRangeChange,
  onRefresh,
  selectedCount,
  onBulkStatusChange,
  onExport
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

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
            placeholder="Search by customer name, phone, or order ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all placeholder-[#9ca3af]"
          />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="pl-10 pr-8 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                       text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                       transition-all appearance-none cursor-pointer min-w-[160px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af] pointer-events-none" />
        </div>

        {/* Date Range */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl
                       text-[0.85rem] text-[#1a1d2b] hover:bg-[#f0f1f5] transition-colors"
          >
            <Calendar className="w-4 h-4 text-[#9ca3af]" />
            <span>{dateRange.start ? dateRange.start : 'Start Date'} — {dateRange.end ? dateRange.end : 'End Date'}</span>
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-[#e8ecf4] p-4 z-50 w-[320px]">
              <div className="space-y-3">
                <div>
                  <label className="text-[0.75rem] font-medium text-[#6b7280] mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                    className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[0.75rem] font-medium text-[#6b7280] mb-1 block">End Date</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => onDateRangeChange({ ...dateRange, end: e.target.value })}
                    className="w-full px-3 py-2 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.85rem] outline-none"
                  />
                </div>
                <button
                  onClick={() => { onDateRangeChange({ start: '', end: '' }); setShowDatePicker(false); }}
                  className="w-full py-2 text-[0.8rem] text-[#9ca3af] hover:text-[#1a1d2b] transition-colors"
                >
                  Clear Dates
                </button>
              </div>
            </div>
          )}
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
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1d2b] text-white rounded-xl text-[0.85rem]
                       font-medium hover:bg-[#2d3142] transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="mt-3 pt-3 border-t border-[#e8ecf4] flex items-center gap-3">
          <span className="text-[0.8rem] text-[#6b7280]">{selectedCount} order(s) selected</span>
          <div className="h-4 w-px bg-[#e8ecf4]" />
          <select
            onChange={(e) => { if (e.target.value) { onBulkStatusChange(e.target.value); e.target.value = ''; } }}
            className="px-3 py-1.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-lg text-[0.8rem] outline-none"
            defaultValue=""
          >
            <option value="" disabled>Update Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="paid">Paid</option>
            <option value="shipped">Shipped</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      )}
    </div>
  );
};

export default OrderFilters;