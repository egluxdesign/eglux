// src/components/admin/analytics/ProductPerformanceChart.jsx
import { useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Package } from 'lucide-react';

const rupiah = (n) => 'Rp ' + Number(n).toLocaleString('id-ID');

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-[#e8ecf4] p-3">
        <p className="text-[0.8rem] font-semibold text-[#1a1d2b] mb-1">{label}</p>
        <p className="text-[0.85rem] text-[#c9a96e] font-bold">
          Revenue: {rupiah(payload[0].value)}
        </p>
        <p className="text-[0.8rem] text-blue-500">
          Sold: {payload[0].payload.quantity} units
        </p>
      </div>
    );
  }
  return null;
};

const ProductPerformanceChart = ({ orderItems }) => {
  const chartData = useMemo(() => {
    // Group by product and sum revenue
    const productMap = {};

    orderItems.forEach(item => {
      const name = item.product_name_snapshot || 'Unknown';
      if (!productMap[name]) {
        productMap[name] = { name, revenue: 0, quantity: 0 };
      }
      productMap[name].revenue += item.subtotal || 0;
      productMap[name].quantity += item.quantity || 0;
    });

    return Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10
  }, [orderItems]);

  const COLORS = ['#c9a96e', '#d4b87a', '#dfc78a', '#e9d69a', '#f0e2aa', 
                  '#3b82f6', '#60a5fa', '#93c5fd', '#ef4444', '#f87171'];

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-[1rem] font-bold text-[#1a1d2b] flex items-center gap-2">
            <Package className="w-5 h-5 text-[#c9a96e]" />
            Top Products
          </h3>
          <p className="text-[0.8rem] text-[#9ca3af] mt-0.5">Best performing products by revenue</p>
        </div>
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis 
              type="number" 
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => 'Rp ' + (value / 1000000).toFixed(1) + 'M'}
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={120}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ProductPerformanceChart;