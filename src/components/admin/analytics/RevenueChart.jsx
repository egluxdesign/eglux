// src/components/admin/analytics/RevenueChart.jsx
import { useState, useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const DATE_RANGES = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: '1 Year', days: 365 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-[#e8ecf4] p-3">
        <p className="text-[0.8rem] font-semibold text-[#1a1d2b] mb-1">{label}</p>
        <p className="text-[0.85rem] text-[#c9a96e] font-bold">
          Revenue: {rupiah(payload[0].value)}
        </p>
        {payload[1] && (
          <p className="text-[0.8rem] text-blue-500">
            Orders: {payload[1].value}
          </p>
        )}
      </div>
    );
  }
  return null;
};

const RevenueChart = ({ orders }) => {
  const [range, setRange] = useState(30);
  const [chartType, setChartType] = useState('area'); // 'line' or 'area'

  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - range);

    // Group orders by date
    const dailyData = {};

    // Initialize all dates in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      dailyData[dateStr] = { date: dateStr, revenue: 0, orders: 0 };
    }

    // Fill with actual data
    orders.forEach(order => {
      const orderDate = new Date(order.created_at);
      if (orderDate >= startDate && orderDate <= endDate) {
        const dateStr = orderDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        if (dailyData[dateStr]) {
          dailyData[dateStr].revenue += order.total_amount || 0;
          dailyData[dateStr].orders += 1;
        }
      }
    });

    return Object.values(dailyData);
  }, [orders, range]);

  const totalRevenue = chartData.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = chartData.reduce((sum, d) => sum + d.orders, 0);
  const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-[1rem] font-bold text-[#1a1d2b] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#c9a96e]" />
            Revenue Trend
          </h3>
          <p className="text-[0.8rem] text-[#9ca3af] mt-0.5">Sales performance over time</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Pills */}
          {DATE_RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`px-3 py-1.5 rounded-full text-[0.75rem] font-medium transition-all
                ${range === r.days 
                  ? 'bg-[#1a1d2b] text-white' 
                  : 'bg-[#f8f9fc] text-[#6b7280] hover:bg-[#e8ecf4]'
                }`}
            >
              {r.label}
            </button>
          ))}

          {/* Chart Type Toggle */}
          <div className="flex items-center bg-[#f8f9fc] rounded-lg p-0.5 ml-2">
            <button
              onClick={() => setChartType('area')}
              className={`px-2.5 py-1 rounded-md text-[0.7rem] font-medium transition-all
                ${chartType === 'area' ? 'bg-white text-[#1a1d2b] shadow-sm' : 'text-[#9ca3af]'}`}
            >
              Area
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2.5 py-1 rounded-md text-[0.7rem] font-medium transition-all
                ${chartType === 'line' ? 'bg-white text-[#1a1d2b] shadow-sm' : 'text-[#9ca3af]'}`}
            >
              Line
            </button>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#f8f9fc] rounded-xl p-3">
          <p className="text-[0.7rem] text-[#9ca3af] uppercase tracking-wider">Total Revenue</p>
          <p className="text-[1.1rem] font-bold text-[#1a1d2b]">{rupiah(totalRevenue)}</p>
        </div>
        <div className="bg-[#f8f9fc] rounded-xl p-3">
          <p className="text-[0.7rem] text-[#9ca3af] uppercase tracking-wider">Total Orders</p>
          <p className="text-[1.1rem] font-bold text-[#1a1d2b]">{totalOrders}</p>
        </div>
        <div className="bg-[#f8f9fc] rounded-xl p-3">
          <p className="text-[0.7rem] text-[#9ca3af] uppercase tracking-wider">Avg Order</p>
          <p className="text-[1.1rem] font-bold text-[#1a1d2b]">{rupiah(avgOrderValue)}</p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c9a96e" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#c9a96e" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={{ stroke: '#e8ecf4' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => 'Rp ' + (value / 1000000).toFixed(0) + 'M'}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#c9a96e" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
              />
              <Line 
                type="monotone" 
                dataKey="orders" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={false}
                yAxisId={1}
              />
            </AreaChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={{ stroke: '#e8ecf4' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => 'Rp ' + (value / 1000000).toFixed(0) + 'M'}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                stroke="#c9a96e" 
                strokeWidth={2}
                dot={{ fill: '#c9a96e', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#c9a96e', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="orders" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                strokeDasharray="5 5"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChart;