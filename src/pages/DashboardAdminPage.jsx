// src/pages/DashboardAdminPage.jsx
// ============================================================================
// DashboardAdminPage — Full dashboard with KPI + alerts + pipeline
// ============================================================================
// Phase 4: KPI cards + alerts + order pipeline + top products + activity
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const DATE_RANGES = [
  { value: 'today', label: 'Hari Ini' },
  { value: '7d', label: '7 Hari Terakhir' },
  { value: '30d', label: '30 Hari Terakhir' },
  { value: 'month', label: 'Bulan Ini' },
  { value: '3month', label: '3 Bulan Terakhir' },
];

const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

const DashboardAdminPage = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'team_dev' || profile?.role === 'master';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30d');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { setError('Sesi berakhir'); setLoading(false); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date_range: dateRange }),
      });

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || 'Gagal memuat data');
      }
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh setiap 60 detik
  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <AdminLayout title="Dashboard" subtitle="Overview EGLUX After-Sales">
      <div className="space-y-6">
        {/* Header: Date Range + Refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer bg-white"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
            {error}
            <button onClick={fetchData} className="ml-2 underline cursor-pointer">Coba lagi</button>
          </div>
        ) : data ? (
          <>
            {/* === KPI CARDS === */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Revenue — only for team_dev/master */}
              {isAdmin && (
                <div className="bg-gradient-to-br from-eglux-primary to-gray-800 rounded-xl p-4 text-white">
                  <div className="text-[0.65rem] uppercase tracking-wider text-white/60 mb-1">💰 Revenue</div>
                  <div className="text-xl font-bold">{rupiah(data.kpis.revenue)}</div>
                  <div className="text-[0.65rem] text-white/50 mt-1">{data.kpis.paid_count} paid orders</div>
                </div>
              )}
              {/* Orders */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">📦 Orders</div>
                <div className="text-xl font-bold text-eglux-primary">{data.kpis.orders_count}</div>
                <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis.paid_count} paid</div>
              </div>
              {/* Shipping */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🚚 Shipping</div>
                <div className="text-xl font-bold text-eglux-primary">{data.kpis.shipping_on_time_rate}%</div>
                <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis.delivered_count} delivered</div>
              </div>
              {/* Points — only for team_dev/master */}
              {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">⭐ Points Active</div>
                  <div className="text-xl font-bold text-eglux-primary">{(data.kpis.points_active || 0).toLocaleString('id-ID')}</div>
                  <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis.points_transactions} transactions</div>
                </div>
              )}
              {/* Vouchers */}
              {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🎫 Vouchers Used</div>
                  <div className="text-xl font-bold text-eglux-primary">{data.kpis.vouchers_used}</div>
                  <div className="text-[0.65rem] text-gray-400 mt-1">This period</div>
                </div>
              )}
            </div>

            {/* === REVENUE CHART (team_dev/master only) === */}
            {isAdmin && data.revenue_chart && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-700">💰 Revenue Trend</h3>
                  <div className="flex items-center gap-3 text-[0.65rem] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-eglux-secondary"></span> Revenue</span>
                    <span>Total: {rupiah(data.kpis.revenue)}</span>
                  </div>
                </div>
                {/* CSS Bar Chart — gak butuh library */}
                <div className="flex items-end gap-[2px] h-40 overflow-x-auto pb-2">
                  {data.revenue_chart.map((d, i) => {
                    const maxRev = Math.max(...data.revenue_chart.map((x) => x.revenue), 1);
                    const heightPct = d.revenue > 0 ? Math.max((d.revenue / maxRev) * 100, 3) : 0;
                    return (
                      <div key={i} className="flex-shrink-0 group relative" style={{ width: '20px' }}>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap bg-gray-900 text-white text-[0.6rem] px-2 py-1 rounded">
                          {d.label}: {rupiah(d.revenue)} ({d.orders} orders)
                        </div>
                        {/* Bar */}
                        <div
                          className={`rounded-t-sm transition-all ${d.revenue > 0 ? 'bg-eglux-secondary hover:bg-eglux-secondary/80' : 'bg-gray-100'}`}
                          style={{ height: `${heightPct}%`, minHeight: d.revenue > 0 ? '3px' : '0' }}
                        ></div>
                      </div>
                    );
                  })}
                </div>
                {/* X-axis labels (first, middle, last) */}
                <div className="flex justify-between mt-2 text-[0.6rem] text-gray-400">
                  <span>{data.revenue_chart[0]?.label || ''}</span>
                  {data.revenue_chart.length > 2 && <span>{data.revenue_chart[Math.floor(data.revenue_chart.length / 2)]?.label || ''}</span>}
                  <span>{data.revenue_chart[data.revenue_chart.length - 1]?.label || ''}</span>
                </div>
              </div>
            )}

            {/* === ALERTS + ORDER PIPELINE === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Alerts */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  ⚠️ Perlu Perhatian
                  {(data.alerts.pending_orders_count + data.alerts.pending_claims_count + data.alerts.shipping_delays_count) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[0.65rem] font-bold">
                      {data.alerts.pending_orders_count + data.alerts.pending_claims_count + data.alerts.shipping_delays_count}
                    </span>
                  )}
                </h3>
                <div className="space-y-2">
                  {data.alerts.pending_orders_count > 0 && (
                    <a href="/orders-admin" className="flex items-center gap-2 p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors no-underline">
                      <span className="text-red-500">🔴</span>
                      <span className="text-xs text-gray-700">{data.alerts.pending_orders_count} order pending >23 jam (akan expire)</span>
                    </a>
                  )}
                  {data.alerts.pending_claims_count > 0 && (
                    <a href="/points-admin" className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors no-underline">
                      <span className="text-amber-500">🟡</span>
                      <span className="text-xs text-gray-700">{data.alerts.pending_claims_count} klaim poin menunggu verifikasi</span>
                    </a>
                  )}
                  {data.alerts.shipping_delays_count > 0 && (
                    <a href="/orders-admin" className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors no-underline">
                      <span className="text-orange-500">🟠</span>
                      <span className="text-xs text-gray-700">{data.alerts.shipping_delays_count} paket shipping delay (>3 hari)</span>
                    </a>
                  )}
                  {data.alerts.pending_orders_count === 0 && data.alerts.pending_claims_count === 0 && data.alerts.shipping_delays_count === 0 && (
                    <p className="text-xs text-gray-400 py-2 text-center">✅ Semua aman, tidak ada alert.</p>
                  )}
                </div>
              </div>

              {/* Order Pipeline */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Order Pipeline</h3>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {[
                    { label: 'Pending', count: data.order_pipeline.pending, color: 'bg-amber-100 text-amber-700' },
                    { label: 'Processing', count: data.order_pipeline.processing, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Dikirim', count: data.order_pipeline.shipped, color: 'bg-purple-100 text-purple-700' },
                    { label: 'Selesai', count: data.order_pipeline.delivered, color: 'bg-green-100 text-green-700' },
                    { label: 'Batal', count: data.order_pipeline.cancelled, color: 'bg-red-100 text-red-700' },
                  ].map((stage, i) => (
                    <div key={stage.label} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`rounded-lg px-3 py-2 text-center min-w-[70px] ${stage.color}`}>
                        <p className="text-lg font-bold">{stage.count}</p>
                        <p className="text-[0.6rem] uppercase tracking-wide">{stage.label}</p>
                      </div>
                      {i < 4 && <span className="text-gray-300">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* === TOP PRODUCTS + RECENT ACTIVITY === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Products */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">🏆 Produk Terlaris</h3>
                {data.top_products.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Belum ada penjualan di periode ini.</p>
                ) : (
                  <div className="space-y-2">
                    {data.top_products.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-full bg-eglux-accent text-eglux-primary font-bold flex items-center justify-center text-[0.6rem] flex-shrink-0">{i + 1}</span>
                          <span className="text-gray-700 truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                          <span className="text-gray-500">{p.sold} terjual</span>
                          {isAdmin && <span className="text-eglux-secondary font-medium">{rupiah(p.revenue)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Activity */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Aktivitas Terakhir</h3>
                {data.recent_activity.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Belum ada aktivitas.</p>
                ) : (
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                    {data.recent_activity.map((act, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                        <span className="flex-shrink-0">
                          {act.type === 'payment' ? '💰' : act.type === 'shipping' ? '🚚' : act.type === 'points' ? '⭐' : '📦'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-700 truncate">{act.description}</p>
                          <p className="text-gray-400 text-[0.65rem]">
                            {new Date(act.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* === CUSTOMER INSIGHTS + SHIPPING PERFORMANCE === */}
            {isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Customer Insights */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">👥 Customer Insights</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Total Customer</p>
                      <p className="text-lg font-bold text-gray-700">{(data.customer_insights.total_customers || 0).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">New (period)</p>
                      <p className="text-lg font-bold text-green-700">{data.customer_insights.new_customers || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Repeat Rate</p>
                      <p className="text-lg font-bold text-blue-700">{data.customer_insights.repeat_rate}%</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Avg Order Value</p>
                      <p className="text-lg font-bold text-amber-700">{rupiah(data.customer_insights.aov)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 col-span-2">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Newsletter Subscribers</p>
                      <p className="text-lg font-bold text-purple-700">
                        {data.customer_insights.newsletter_subscribers || 0}
                        <span className="text-xs font-normal text-gray-400 ml-2">({data.customer_insights.wa_subscribers || 0} WA)</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Shipping Performance */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🚚 Shipping Performance</h3>
                  {data.shipping_performance.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">Belum ada data shipping.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.shipping_performance.map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                          <span className="text-gray-700 uppercase font-medium">{s.courier}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">{s.total} paket</span>
                            <span className={`font-bold ${s.rate >= 90 ? 'text-green-600' : s.rate >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{s.rate}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};

export default DashboardAdminPage;
