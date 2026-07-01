// src/components/admin/analytics/AnalyticsPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import RevenueChart from './RevenueChart';
import ProductPerformanceChart from './ProductPerformanceChart';
import StatusDistributionChart from './StatusDistributionChart';
import { BarChart3, TrendingUp, ShoppingBag, Users, CreditCard, Calendar } from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const AnalyticsPage = () => {
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch all data in parallel
    const [ordersRes, itemsRes, customersRes, paymentsRes] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*'),
      supabase.from('customers').select('*'),
      supabase.from('payments').select('*'),
    ]);

    setOrders(ordersRes.data || []);
    setOrderItems(itemsRes.data || []);
    setCustomers(customersRes.data || []);
    setPayments(paymentsRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter orders by date range
  const filteredOrders = orders.filter(order => {
    if (!dateRange.start && !dateRange.end) return true;
    const orderDate = new Date(order.created_at);
    const start = dateRange.start ? new Date(dateRange.start) : new Date('2000-01-01');
    const end = dateRange.end ? new Date(dateRange.end + 'T23:59:59') : new Date('2099-12-31');
    return orderDate >= start && orderDate <= end;
  });

  // Calculate stats
  const totalRevenue = filteredOrders
    .filter(o => o.status === 'paid' || o.status === 'shipped')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const totalOrders = filteredOrders.length;
  const totalCustomers = customers.length;
  const totalProductsSold = orderItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const conversionRate = totalCustomers > 0 
    ? ((totalOrders / totalCustomers) * 100).toFixed(1) 
    : 0;

  const avgOrderValue = totalOrders > 0 
    ? Math.round(totalRevenue / totalOrders) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b] flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-[#c9a96e]" />
            Analytics
          </h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">
            Insights and performance metrics
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-[#e8ecf4]">
          <Calendar className="w-4 h-4 text-[#9ca3af]" />
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="bg-transparent text-[0.8rem] text-[#1a1d2b] outline-none"
          />
          <span className="text-[#9ca3af]">—</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="bg-transparent text-[0.8rem] text-[#1a1d2b] outline-none"
          />
          {(dateRange.start || dateRange.end) && (
            <button
              onClick={() => setDateRange({ start: '', end: '' })}
              className="text-[0.75rem] text-[#9ca3af] hover:text-red-500 transition-colors ml-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
          </div>
          <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Total Revenue</p>
          <p className="text-[1.4rem] font-bold text-[#1a1d2b]">{rupiah(totalRevenue)}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-blue-500" />
            </div>
          </div>
          <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Total Orders</p>
          <p className="text-[1.4rem] font-bold text-[#1a1d2b]">{totalOrders}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-violet-500" />
            </div>
          </div>
          <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Customers</p>
          <p className="text-[1.4rem] font-bold text-[#1a1d2b]">{totalCustomers}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-amber-500" />
            </div>
          </div>
          <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Avg Order Value</p>
          <p className="text-[1.4rem] font-bold text-[#1a1d2b]">{rupiah(avgOrderValue)}</p>
        </div>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6 h-[400px] animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
            <div className="h-[300px] bg-gray-100 rounded-xl" />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Revenue Trend */}
          <RevenueChart orders={filteredOrders} />

          {/* Two Column Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProductPerformanceChart orderItems={orderItems} />
            <StatusDistributionChart orders={filteredOrders} />
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
              <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Conversion Rate</p>
              <p className="text-[1.5rem] font-bold text-[#1a1d2b]">{conversionRate}%</p>
              <p className="text-[0.75rem] text-[#9ca3af] mt-1">Orders per customer</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
              <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Products Sold</p>
              <p className="text-[1.5rem] font-bold text-[#1a1d2b]">{totalProductsSold}</p>
              <p className="text-[0.75rem] text-[#9ca3af] mt-1">Total units sold</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#e8ecf4]">
              <p className="text-[0.78rem] text-[#9ca3af] uppercase tracking-[0.5px] mb-1">Payment Success</p>
              <p className="text-[1.5rem] font-bold text-emerald-600">
                {payments.length > 0 
                  ? ((payments.filter(p => p.status === 'paid').length / payments.length) * 100).toFixed(1) 
                  : 0}%
              </p>
              <p className="text-[0.75rem] text-[#9ca3af] mt-1">Successful transactions</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;