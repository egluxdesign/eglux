// src/components/admin/analytics/StatusDistributionChart.jsx
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieIcon } from 'lucide-react';

const STATUS_COLORS = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  paid: '#22c55e',
  shipped: '#8b5cf6',
  cancelled: '#ef4444',
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white rounded-xl shadow-lg border border-[#e8ecf4] p-3">
        <p className="text-[0.8rem] font-semibold text-[#1a1d2b] capitalize">{data.name}</p>
        <p className="text-[0.85rem] font-bold" style={{ color: data.color }}>
          {data.value} orders ({data.percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

const StatusDistributionChart = ({ orders }) => {
  const data = useMemo(() => {
    const counts = {};
    orders.forEach(order => {
      const status = order.status || 'pending';
      counts[status] = (counts[status] || 0) + 1;
    });

    const total = orders.length || 1;
    return Object.entries(counts).map(([status, count]) => ({
      name: status,
      value: count,
      color: STATUS_COLORS[status] || '#9ca3af',
      percentage: ((count / total) * 100).toFixed(1),
    }));
  }, [orders]);

  return (
    <div className="bg-white rounded-2xl border border-[#e8ecf4] p-6">
      <div className="mb-6">
        <h3 className="text-[1rem] font-bold text-[#1a1d2b] flex items-center gap-2">
          <PieIcon className="w-5 h-5 text-[#c9a96e]" />
          Order Status Distribution
        </h3>
        <p className="text-[0.8rem] text-[#9ca3af] mt-0.5">Breakdown by order status</p>
      </div>

      <div className="flex flex-col lg:flex-row items-center gap-6">
        {/* Pie Chart */}
        <div className="h-[250px] w-full lg:w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="w-full lg:w-1/2 space-y-3">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between p-3 bg-[#f8f9fc] rounded-xl">
              <div className="flex items-center gap-3">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-[0.85rem] font-medium text-[#1a1d2b] capitalize">{item.name}</span>
              </div>
              <div className="text-right">
                <span className="text-[0.85rem] font-bold text-[#1a1d2b]">{item.value}</span>
                <span className="text-[0.75rem] text-[#9ca3af] ml-2">({item.percentage}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StatusDistributionChart;