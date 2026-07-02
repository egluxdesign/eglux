// src/components/admin/dashboard/DashboardOverview.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { 
  ShoppingBag, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  Truck, 
  XCircle,
  AlertTriangle,
} from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const STAT_CONFIG = [
  { 
    id: 'total_revenue', 
    label: 'Total Revenue (Paid)', 
    icon: TrendingUp, 
    color: 'emerald',
    prefix: 'Rp '
  },
  { 
    id: 'total_orders', 
    label: 'Total Orders', 
    icon: ShoppingBag, 
    color: 'blue',
    prefix: ''
  },
  { 
    id: 'pending', 
    label: 'Pending Orders', 
    icon: Clock, 
    color: 'amber',
    prefix: ''
  },
  { 
    id: 'paid', 
    label: 'Paid Orders', 
    icon: CheckCircle, 
    color: 'emerald',
    prefix: ''
  },
  { 
    id: 'shipped', 
    label: 'Shipped', 
    icon: Truck, 
    color: 'violet',
    prefix: ''
  },
  { 
    id: 'cancelled', 
    label: 'Cancelled', 
    icon: XCircle, 
    color: 'red',
    prefix: ''
  },
];

const COLOR_MAP = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500', border: 'border-emerald-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', icon: 'text-blue-500', border: 'border-blue-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-500', border: 'border-amber-100' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-600', icon: 'text-violet-500', border: 'border-violet-100' },
  red: { bg: 'bg-red-50', text: 'text-red-600', icon: 'text-red-500', border: 'border-red-100' },
};

// Trend dihitung dari data asli (30 hari terakhir vs 30 hari sebelumnya),
// bukan angka acak. Kalau tidak ada data pembanding, badge trend disembunyikan.
const StatCard = ({ config, value, trend }) => {
  const colors = COLOR_MAP[config.color];
  const Icon = config.icon;
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(trend);
  const isPositive = hasTrend && trend >= 0;

  return (
    <div className={`bg-white rounded-2xl p-5 border ${colors.border} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`w-10 h-10 ${colors.bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.icon}`} />
        </div>
        {hasTrend && (
          <div className={`flex items-center gap-1 text-[0.75rem] font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? '↑' : '↓'} {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-[0.8rem] text-[#9ca3af] font-medium mb-1">{config.label}</p>
      <p className={`text-[1.5rem] font-bold ${colors.text}`}>
        {config.prefix}{typeof value === 'number' ? value.toLocaleString('id-ID') : value}
      </p>
    </div>
  );
};

const REVENUE_STATUSES = ['paid', 'shipped']; // status yang dihitung sebagai revenue nyata

const calcRevenue = (orderList) =>
  orderList
    .filter((o) => REVENUE_STATUSES.includes(o.status))
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

const pctChange = (current, previous) => {
  if (!previous) return null; // gak ada data pembanding, jangan tampilkan trend palsu
  return Math.round(((current - previous) / previous) * 100);
};

const DashboardOverview = ({ onNavigate }) => {
  const [stats, setStats] = useState({
    total_revenue: 0,
    total_orders: 0,
    pending: 0,
    paid: 0,
    shipped: 0,
    cancelled: 0,
  });
  const [trends, setTrends] = useState({ total_revenue: null, total_orders: null });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);

    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*, customers(name, phone)')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('Gagal memuat data dashboard. Coba refresh halaman.');
      setLoading(false);
      return;
    }

    const orderList = orders || [];

    const newStats = {
      total_revenue: calcRevenue(orderList),
      total_orders: orderList.length,
      pending: orderList.filter((o) => o.status === 'pending').length,
      paid: orderList.filter((o) => o.status === 'paid').length,
      shipped: orderList.filter((o) => o.status === 'shipped').length,
      cancelled: orderList.filter((o) => o.status === 'cancelled').length,
    };

    // Bandingkan 30 hari terakhir vs 30 hari sebelumnya untuk trend asli
    const now = Date.now();
    const day30 = 30 * 24 * 60 * 60 * 1000;
    const last30 = orderList.filter((o) => now - new Date(o.created_at).getTime() <= day30);
    const prev30 = orderList.filter((o) => {
      const age = now - new Date(o.created_at).getTime();
      return age > day30 && age <= day30 * 2;
    });

    setTrends({
      total_revenue: pctChange(calcRevenue(last30), calcRevenue(prev30)),
      total_orders: pctChange(last30.length, prev30.length),
    });

    setStats(newStats);
    setRecentOrders(orderList.slice(0, 5));
    setLoading(false);
  };

  const getStatusStyle = (status) => {
    const styles = {
      pending: 'bg-amber-50 text-amber-600 border-amber-100',
      confirmed: 'bg-blue-50 text-blue-600 border-blue-100',
      paid: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      shipped: 'bg-violet-50 text-violet-600 border-violet-100',
      cancelled: 'bg-red-50 text-red-600 border-red-100',
    };
    return styles[status] || styles.pending;
  };

  const toWIB = (iso) =>
    new Date(iso).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Dashboard</h1>
        <p className="text-[0.85rem] text-[#9ca3af] mt-1">Overview of your store performance</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-[0.85rem]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-[#e8ecf4] animate-pulse">
              <div className="w-10 h-10 bg-gray-200 rounded-xl mb-4" />
              <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-32" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STAT_CONFIG.map((config) => (
            <StatCard 
              key={config.id}
              config={config}
              value={stats[config.id]}
              trend={trends[config.id]}
            />
          ))}
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-[#e8ecf4] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8ecf4] flex items-center justify-between">
          <div>
            <h2 className="text-[1rem] font-bold text-[#1a1d2b]">Recent Orders</h2>
            <p className="text-[0.8rem] text-[#9ca3af]">Latest 5 orders from your store</p>
          </div>
          <button
            onClick={() => onNavigate?.('orders')}
            className="text-[0.8rem] text-[#c9a96e] font-medium hover:underline"
          >
            View All
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-32" />
                  <div className="h-2 bg-gray-200 rounded w-24" />
                </div>
                <div className="h-3 bg-gray-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingBag className="w-12 h-12 text-[#e8ecf4] mx-auto mb-3" />
            <p className="text-[0.9rem] text-[#9ca3af]">No orders yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f3f4f6]">
            {recentOrders.map((order) => (
              <div key={order.id} className="px-6 py-4 flex items-center gap-4 hover:bg-[#f8f9fc] transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#c9a96e]/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag className="w-4 h-4 text-[#c9a96e]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[0.85rem] font-semibold text-[#1a1d2b] truncate">
                    {order.customers?.name || 'Unknown Customer'}
                  </p>
                  <p className="text-[0.75rem] text-[#9ca3af]">{toWIB(order.created_at)}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[0.75rem] font-medium border capitalize ${getStatusStyle(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-[0.85rem] font-bold text-[#1a1d2b] whitespace-nowrap">
                  {rupiah(order.total_amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardOverview;