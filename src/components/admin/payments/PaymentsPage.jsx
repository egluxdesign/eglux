// src/components/admin/payments/PaymentsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import PaymentsTable from './PaymentsTable';
import { CreditCard, Search, RefreshCw, TrendingUp, TrendingDown, Clock } from 'lucide-react';

const PaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });

  const fetchPayments = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from('payments')
      .select('*')
      .order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    let result = data || [];

    // Client-side search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.id.toLowerCase().includes(q) ||
        p.order_id?.toLowerCase().includes(q) ||
        p.transaction_id?.toLowerCase().includes(q)
      );
    }

    setPayments(result);
    setLoading(false);
  }, [statusFilter, searchQuery, sortConfig]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Stats
  const totalPayments = payments.length;
  const totalRevenue = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingAmount = payments
    .filter(p => p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const failedCount = payments.filter(p => p.status === 'failed').length;

  const STATUS_OPTIONS = [
    { value: 'all', label: 'All Payments', color: 'bg-[#1a1d2b]' },
    { value: 'pending', label: 'Pending', color: 'bg-amber-500' },
    { value: 'paid', label: 'Paid', color: 'bg-emerald-500' },
    { value: 'failed', label: 'Failed', color: 'bg-red-500' },
    { value: 'expired', label: 'Expired', color: 'bg-gray-500' },
    { value: 'refunded', label: 'Refunded', color: 'bg-blue-500' },
  ];

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Payments</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">
            Track and manage payment transactions
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#e8ecf4]">
          <CreditCard className="w-5 h-5 text-[#c9a96e]" />
          <span className="text-[0.9rem] font-bold text-[#1a1d2b]">{totalPayments}</span>
          <span className="text-[0.75rem] text-[#9ca3af]">transactions</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.78rem] text-[#999] uppercase tracking-[0.5px]">Total Revenue</p>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-[1.5rem] font-bold text-emerald-600">{rupiah(totalRevenue)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.78rem] text-[#999] uppercase tracking-[0.5px]">Pending</p>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-[1.5rem] font-bold text-amber-600">{rupiah(pendingAmount)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[0.78rem] text-[#999] uppercase tracking-[0.5px]">Failed</p>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-[1.5rem] font-bold text-red-600">{failedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by payment ID, order ID, or transaction ID..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl text-[0.85rem]
                         text-[#1a1d2b] outline-none focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/20
                         transition-all placeholder-[#9ca3af]"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-[0.75rem] font-medium transition-all
                  ${statusFilter === opt.value 
                    ? `${opt.color} text-white` 
                    : 'bg-[#f8f9fc] text-[#6b7280] hover:bg-[#e8ecf4]'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchPayments}
            className="p-2.5 bg-[#f8f9fc] border border-[#e8ecf4] rounded-xl hover:bg-[#f0f1f5] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[#6b7280]" />
          </button>
        </div>
      </div>

      {/* Table */}
      <PaymentsTable
        payments={payments}
        loading={loading}
        sortConfig={sortConfig}
        onSort={handleSort}
      />

      {/* Midtrans Integration Note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <CreditCard className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <h4 className="text-[0.85rem] font-semibold text-blue-800 mb-1">Midtrans Integration Ready</h4>
          <p className="text-[0.8rem] text-blue-600 leading-relaxed">
            This payments table is designed to work with Midtrans payment gateway. 
            When integrated, payment status will update automatically via webhook. 
            Transaction IDs will be populated from Midtrans response.
          </p>
        </div>
      </div>
    </div>
  );
};

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

export default PaymentsPage;