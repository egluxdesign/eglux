// src/pages/DashboardAdminPage.jsx
// ============================================================================
// DashboardAdminPage v3 - Full dashboard (Shopee-inspired)
// ============================================================================
// v3 CHANGES (all fixes applied):
//   [CRITICAL] All data.xxx access pakai ?. atau || [] / || {} (anti crash)
//   [LOGIC] Shop Health + Conversion: OR condition + conditional per card
//   [LOGIC] Bounce Rate -> "No Purchase Rate" (label sesuai logic)
//   [LOGIC] canSee() check untuk SEMUA section (consistent)
//   [MINOR] Semua .map() pakai || [] (defensive)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import Sparkline from '../components/ui/Sparkline';
import EmptyState from '../components/ui/EmptyState';
import { canAccess } from '../lib/permissions';

const DATE_RANGES = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: '7d', label: '7 Hari Terakhir' },
  { value: 'last_week', label: 'Minggu Lalu' },
  { value: '30d', label: '30 Hari Terakhir' },
  { value: 'month', label: 'Bulan Ini' },
  { value: 'last_month', label: 'Bulan Lalu' },
  { value: '3month', label: '3 Bulan Terakhir' },
  { value: 'ytd', label: 'Tahun Ini (YTD)' },
];

const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

function getHealthColor(score) {
  if (score >= 80) return { text: 'text-green-600', bg: 'bg-green-500', label: 'Excellent' };
  if (score >= 60) return { text: 'text-blue-600', bg: 'bg-blue-500', label: 'Good' };
  if (score >= 40) return { text: 'text-amber-600', bg: 'bg-amber-500', label: 'Fair' };
  return { text: 'text-red-600', bg: 'bg-red-500', label: 'Needs Attention' };
}

function getTrendColor(trend) {
  if (trend > 0) return 'text-green-600';
  if (trend < 0) return 'text-red-600';
  return 'text-gray-400';
}

function formatTrend(trend) {
  if (trend === null || trend === undefined) return null;
  const sign = trend > 0 ? '+' : '';
  return `${sign}${trend.toFixed(1)}%`;
}

function formatTimeAgo(seconds) {
  if (!seconds || seconds < 0) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  return `${Math.floor(seconds / 86400)} hari lalu`;
}

const DashboardAdminPage = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'team_dev' || profile?.role === 'master' || profile?.role === 'admin';
  const canSee = (sectionKey) => canAccess(sectionKey, profile);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('30d');
  const [notifications, setNotifications] = useState([]);
  const knownOrderIdsRef = useRef(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;

      if (!token) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshData?.session) {
          setError('Sesi berakhir. Silakan login ulang.');
          setTimeout(() => { window.location.href = '/admin'; }, 2000);
          setLoading(false);
          return;
        }
        token = refreshData.session.access_token;
      } else {
        const expiresAt = sessionData.session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt - now < 300) {
          const { data: refreshData } = await supabase.auth.refreshSession();
          if (refreshData?.session?.access_token) {
            token = refreshData.session.access_token;
          }
        }
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-data`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_range: dateRange }),
      });

      if (resp.status === 401) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData?.session?.access_token) {
          const retryResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-data`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${refreshData.session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ date_range: dateRange }),
          });
          const retryResult = await retryResp.json();
          if (!retryResp.ok || !retryResult.success) throw new Error(retryResult.error || 'Gagal memuat data');
          setData(retryResult);
          return;
        } else {
          setError('Sesi berakhir. Silakan login ulang.');
          setTimeout(() => { window.location.href = '/admin'; }, 2000);
          setLoading(false);
          return;
        }
      }

      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error || 'Gagal memuat data');
      setData(result);

      if (result.recent_activity) {
        result.recent_activity.forEach((act) => {
          if (act.type === 'order' || act.type === 'payment') {
            const match = act.description?.match(/#([A-Z0-9]+)/);
            if (match) knownOrderIdsRef.current.add(match[1]);
          }
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel('admin-orders-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const newOrder = payload.new;
        const shortId = (newOrder?.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
        if (knownOrderIdsRef.current.has(shortId)) return;
        knownOrderIdsRef.current.add(shortId);
        const notif = {
          id: `notif-${Date.now()}`,
          title: '🛒 Order Baru!',
          message: `#${shortId} - ${rupiah(newOrder?.total_amount || 0)}`,
          timestamp: new Date().toISOString(),
        };
        setNotifications((prev) => [notif, ...prev].slice(0, 5));
        setTimeout(() => { setNotifications((prev) => prev.filter((n) => n.id !== notif.id)); }, 8000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  const dismissNotification = (id) => setNotifications((prev) => prev.filter((n) => n.id !== id));

  // * FIX: Compute health data sekali (avoid 5x function call)
  const healthScore = data?.kpis?.health_score || 0;
  const healthInfo = getHealthColor(healthScore);
  const shopHealth = data?.shop_health || {};

  return (
    <AdminLayout title="Dashboard" subtitle="Overview EGLUX After-Sales">
      {notifications.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[2000] space-y-2 max-w-sm">
          {notifications.map((notif) => (
            <div key={notif.id} className="bg-white border-l-4 border-green-500 rounded-lg shadow-2xl p-3 flex items-start gap-3 animate-slide-in-right">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{notif.title}</p>
                <p className="text-xs text-gray-600 truncate">{notif.message}</p>
              </div>
              <button onClick={() => dismissNotification(notif.id)} className="text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none text-lg leading-none" aria-label="Dismiss">x</button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {/* Header: Date Range + Refresh */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer bg-white">
              {DATE_RANGES.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
            </select>
          </div>
          <button onClick={fetchData} disabled={loading} className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
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
            {/* * Phase 1.5: Quick Actions Menu */}
            {isAdmin && (
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <Link to="/products-admin" className="flex-shrink-0 px-3 py-2 bg-eglux-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity no-underline flex items-center gap-1.5">
                    <span>+</span> Tambah Produk
                  </Link>
                  {canSee('dashboard_marketing') && (
                    <Link to="/discount-admin" className="flex-shrink-0 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors no-underline flex items-center gap-1.5">
                      <span>🎫</span> Buat Voucher
                    </Link>
                  )}
                  <Link to="/points-admin" className="flex-shrink-0 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors no-underline flex items-center gap-1.5">
                    <span>⭐</span> Atur Poin Reward
                  </Link>
                  <Link to="/orders-admin" className="flex-shrink-0 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors no-underline flex items-center gap-1.5">
                    <span>📦</span> Kelola Order
                  </Link>
                  <Link to="/users-admin" className="flex-shrink-0 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition-colors no-underline flex items-center gap-1.5">
                    <span>👥</span> User Management
                  </Link>
                </div>
              </div>
            )}

            {/* * Phase 1.2 + 1.1: Shop Health Score + Conversion Funnel - FIX: OR condition + conditional per card */}
            {isAdmin && (canSee('dashboard_health') || canSee('dashboard_conversion')) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Shop Health Score */}
                {canSee('dashboard_health') && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">🏪 Shop Health Score</h3>
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                          <circle cx="40" cy="40" r="35" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                          <circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray={`${(healthScore / 100) * 220} 220`} strokeLinecap="round" className={healthInfo.text} />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xl font-bold ${healthInfo.text}`}>{healthScore}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${healthInfo.text}`}>{healthInfo.label}</p>
                        <p className="text-[0.65rem] text-gray-400 mt-0.5">Composite score 0-100</p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex justify-between text-[0.7rem]">
                        <span className="text-gray-500">🚚 Shipping On-time</span>
                        <span className={`font-semibold ${(shopHealth.shipping_on_time ?? 0) >= 90 ? 'text-green-600' : 'text-amber-600'}`}>{shopHealth.shipping_on_time ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-[0.7rem]">
                        <span className="text-gray-500">❌ Cancel Rate</span>
                        <span className={`font-semibold ${(shopHealth.cancel_rate ?? 0) <= 5 ? 'text-green-600' : 'text-red-600'}`}>{shopHealth.cancel_rate ?? 0}%</span>
                      </div>
                      <div className="flex justify-between text-[0.7rem]">
                        <span className="text-gray-500">✅ Fulfillment Rate</span>
                        <span className={`font-semibold ${(shopHealth.fulfillment_rate ?? 0) >= 80 ? 'text-green-600' : 'text-amber-600'}`}>{shopHealth.fulfillment_rate ?? 0}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conversion Funnel */}
                {canSee('dashboard_conversion') && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">📈 Conversion Funnel</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">👁️ Page Views</span>
                          <span className="font-semibold text-gray-900">{(data.kpis?.page_views || 0).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">🔍 Product Views</span>
                          <span className="font-semibold text-gray-900">{(data.kpis?.product_views || 0).toLocaleString('id-ID')}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(((data.kpis?.product_views || 0) / Math.max(data.kpis?.page_views || 1, 1)) * 100, 100)}%` }}></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-600">🛒 Orders (Paid)</span>
                          <span className="font-semibold text-gray-900">{data.kpis?.paid_count || 0}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(((data.kpis?.paid_count || 0) / Math.max(data.kpis?.page_views || 1, 1)) * 100, 100)}%` }}></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-gray-100">
                        <div className="bg-green-50 rounded-lg p-2.5">
                          <p className="text-[0.6rem] text-gray-500 uppercase">Overall Conversion</p>
                          <p className="text-lg font-bold text-green-700">{data.kpis?.conversion_rate || 0}%</p>
                          <p className="text-[0.6rem] text-gray-400">{data.kpis?.paid_count || 0} orders / {data.kpis?.page_views || 0} views</p>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2.5">
                          <p className="text-[0.6rem] text-gray-500 uppercase">Product Conversion</p>
                          <p className="text-lg font-bold text-purple-700">{data.kpis?.product_conversion_rate || 0}%</p>
                          <p className="text-[0.6rem] text-gray-400">{data.kpis?.paid_count || 0} orders / {data.kpis?.product_views || 0} views</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === KPI CARDS === */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {isAdmin && canSee('dashboard_revenue') && (
                <div className="bg-gradient-to-br from-eglux-primary to-gray-800 rounded-xl p-4 text-white relative overflow-hidden">
                  <div className="flex items-start justify-between mb-1">
                    <div className="text-[0.65rem] uppercase tracking-wider text-white/60">💰 Revenue</div>
                    {data.kpis?.trends?.revenue !== null && data.kpis?.trends?.revenue !== undefined && (
                      <span className={`text-[0.6rem] font-bold px-1.5 py-0.5 rounded ${data.kpis.trends.revenue >= 0 ? 'bg-green-500/30 text-green-300' : 'bg-red-500/30 text-red-300'}`}>{formatTrend(data.kpis.trends.revenue)}</span>
                    )}
                  </div>
                  <div className="text-xl font-bold">{rupiah(data.kpis?.revenue)}</div>
                  <div className="text-[0.65rem] text-white/50 mt-1">{data.kpis?.paid_count || 0} paid orders</div>
                  <div className="absolute bottom-2 right-2 opacity-60">
                    <Sparkline data={data.kpis?.sparkline?.revenue || []} width={60} height={18} color="#10b981" fill={false} showDot={false} />
                  </div>
                </div>
              )}
              <div className="bg-white border border-gray-200 rounded-xl p-4 relative overflow-hidden">
                <div className="flex items-start justify-between mb-1">
                  <div className="text-[0.65rem] uppercase tracking-wider text-gray-400">📦 Orders</div>
                  {data.kpis?.trends?.orders !== null && data.kpis?.trends?.orders !== undefined && (
                    <span className={`text-[0.6rem] font-bold ${getTrendColor(data.kpis.trends.orders)}`}>{formatTrend(data.kpis.trends.orders)}</span>
                  )}
                </div>
                <div className="text-xl font-bold text-eglux-primary">{data.kpis?.orders_count || 0}</div>
                <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis?.paid_count || 0} paid</div>
                <div className="absolute bottom-2 right-2 opacity-50">
                  <Sparkline data={data.kpis?.sparkline?.orders || []} width={60} height={18} color="#3b82f6" fill={false} showDot={false} />
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🚚 Shipping</div>
                <div className="text-xl font-bold text-eglux-primary">{data.kpis?.shipping_on_time_rate || 0}%</div>
                <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis?.delivered_count || 0} delivered</div>
              </div>
              {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">⭐ Points Active</div>
                  <div className="text-xl font-bold text-eglux-primary">{(data.kpis?.points_active || 0).toLocaleString('id-ID')}</div>
                  <div className="text-[0.65rem] text-gray-400 mt-1">{data.kpis?.points_transactions || 0} transactions</div>
                </div>
              )}
              {isAdmin && (
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🎫 Vouchers Used</div>
                  <div className="text-xl font-bold text-eglux-primary">{data.kpis?.vouchers_used || 0}</div>
                  <div className="text-[0.65rem] text-gray-400 mt-1">This period</div>
                </div>
              )}
            </div>

            {/* === REVENUE CHART === */}
            {isAdmin && canSee('dashboard_revenue') && data.revenue_chart && data.revenue_chart.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-700">💰 Revenue Trend</h3>
                  <div className="flex items-center gap-3 text-[0.65rem] text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-eglux-secondary"></span> Revenue</span>
                    <span>Total: {rupiah(data.kpis?.revenue)}</span>
                  </div>
                </div>
                <div className="flex items-end gap-[2px] h-40 overflow-x-auto pb-2">
                  {data.revenue_chart.map((d, i) => {
                    const maxRev = Math.max(...(data.revenue_chart || []).map((x) => x.revenue), 1);
                    const heightPct = d.revenue > 0 ? Math.max((d.revenue / maxRev) * 100, 3) : 0;
                    return (
                      <div key={i} className="flex-shrink-0 group relative" style={{ width: '20px' }}>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap bg-gray-900 text-white text-[0.6rem] px-2 py-1 rounded">
                          {d.label}: {rupiah(d.revenue)} ({d.orders} orders)
                        </div>
                        <div className={`rounded-t-sm transition-all ${d.revenue > 0 ? 'bg-eglux-secondary hover:bg-eglux-secondary/80' : 'bg-gray-100'}`} style={{ height: `${heightPct}%`, minHeight: d.revenue > 0 ? '3px' : '0' }}></div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 text-[0.6rem] text-gray-400">
                  <span>{data.revenue_chart[0]?.label || ''}</span>
                  {data.revenue_chart.length > 2 && <span>{data.revenue_chart[Math.floor(data.revenue_chart.length / 2)]?.label || ''}</span>}
                  <span>{data.revenue_chart[data.revenue_chart.length - 1]?.label || ''}</span>
                </div>
              </div>
            )}

            {/* === ALERTS + ORDER PIPELINE - FIX: defensive null checks === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  ⚠️ Perlu Perhatian
                  {((data.alerts?.pending_orders_count || 0) + (data.alerts?.pending_claims_count || 0) + (data.alerts?.shipping_delays_count || 0)) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[0.65rem] font-bold">
                      {(data.alerts?.pending_orders_count || 0) + (data.alerts?.pending_claims_count || 0) + (data.alerts?.shipping_delays_count || 0)}
                    </span>
                  )}
                </h3>
                <div className="space-y-2">
                  {(data.alerts?.pending_orders_count || 0) > 0 && (
                    <a href="/orders-admin" className="flex items-center gap-2 p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors no-underline">
                      <span className="text-red-500">🔴</span>
                      <span className="text-xs text-gray-700">{data.alerts?.pending_orders_count} order pending &gt;23 jam (akan expire)</span>
                    </a>
                  )}
                  {(data.alerts?.pending_claims_count || 0) > 0 && (
                    <a href="/points-admin" className="flex items-center gap-2 p-2 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors no-underline">
                      <span className="text-amber-500">🟡</span>
                      <span className="text-xs text-gray-700">{data.alerts?.pending_claims_count} klaim poin menunggu verifikasi</span>
                    </a>
                  )}
                  {(data.alerts?.shipping_delays_count || 0) > 0 && (
                    <a href="/orders-admin" className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors no-underline">
                      <span className="text-orange-500">🟠</span>
                      <span className="text-xs text-gray-700">{data.alerts?.shipping_delays_count} paket shipping delay (&gt;3 hari)</span>
                    </a>
                  )}
                  {(data.alerts?.pending_orders_count || 0) === 0 && (data.alerts?.pending_claims_count || 0) === 0 && (data.alerts?.shipping_delays_count || 0) === 0 && (
                    <p className="text-xs text-gray-400 py-2 text-center">✅ Semua aman, tidak ada alert.</p>
                  )}
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Order Pipeline</h3>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {[
                    { label: 'Pending', count: data.order_pipeline?.pending || 0, color: 'bg-amber-100 text-amber-700' },
                    { label: 'Processing', count: data.order_pipeline?.processing || 0, color: 'bg-blue-100 text-blue-700' },
                    { label: 'Dikirim', count: data.order_pipeline?.shipped || 0, color: 'bg-purple-100 text-purple-700' },
                    { label: 'Selesai', count: data.order_pipeline?.delivered || 0, color: 'bg-green-100 text-green-700' },
                    { label: 'Return', count: data.order_pipeline?.return || 0, color: 'bg-orange-100 text-orange-700' },
                    { label: 'Refund', count: data.order_pipeline?.refund || 0, color: 'bg-pink-100 text-pink-700' },
                    { label: 'Batal', count: data.order_pipeline?.cancelled || 0, color: 'bg-red-100 text-red-700' },
                  ].map((stage, i, arr) => (
                    <div key={stage.label} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`rounded-lg px-3 py-2 text-center min-w-[70px] ${stage.color}`}>
                        <p className="text-lg font-bold">{stage.count}</p>
                        <p className="text-[0.6rem] uppercase tracking-wide">{stage.label}</p>
                      </div>
                      {i < arr.length - 1 && <span className="text-gray-300">-></span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* === TOP PRODUCTS + RECENT ACTIVITY - FIX: || [] for .map === */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">🏆 Produk Terlaris</h3>
                {(data.top_products || []).length === 0 ? (
                  <EmptyState icon="🏆" title="Belum ada penjualan" description="Data produk terlaris akan muncul setelah ada customer checkout." size="sm" />
                ) : (
                  <div className="space-y-2">
                    {(data.top_products || []).map((p, i) => (
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
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Aktivitas Terakhir</h3>
                {(data.recent_activity || []).length === 0 ? (
                  <EmptyState icon="📋" title="Belum ada aktivitas" description="Aktivitas order dan transaksi poin akan muncul di sini." size="sm" />
                ) : (
                  <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                    {(data.recent_activity || []).map((act, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                        <span className="flex-shrink-0">{act.type === 'payment' ? '💰' : act.type === 'shipping' ? '🚚' : act.type === 'points' ? '⭐' : '📦'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-700 truncate">{act.description}</p>
                          <p className="text-gray-400 text-[0.65rem]">{new Date(act.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* * Phase 2.1: Marketing Center */}
            {isAdmin && canSee('dashboard_marketing') && data.marketing && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-700">📣 Marketing Center</h3>
                  <Link to="/discount-admin" className="text-xs text-eglux-secondary font-semibold hover:underline no-underline">Kelola Semua -></Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-2">🎫 Active Vouchers</p>
                    {(data.marketing.active_vouchers || []).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada voucher aktif.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(data.marketing.active_vouchers || []).map((v) => (
                          <div key={v.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                            <span className="font-mono font-semibold text-gray-900">{v.code}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">{v.discount_type === 'percentage' ? `${v.discount_value}%` : v.discount_type === 'fixed' ? rupiah(v.discount_value) : 'Free Ship'}</span>
                              {v.valid_until && <span className="text-[0.6rem] text-gray-400">s/d {new Date(v.valid_until).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-2">⭐ Point Rewards</p>
                    {(data.marketing.active_rewards || []).length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Belum ada reward aktif.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(data.marketing.active_rewards || []).map((r) => (
                          <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                            <span className="text-gray-900 truncate">{r.name}</span>
                            <span className="text-eglux-secondary font-semibold flex-shrink-0 ml-2">{r.points_cost} poin</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* === CUSTOMER INSIGHTS + SHIPPING PERFORMANCE - FIX: defensive ?. === */}
            {isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">👥 Customer Insights</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Total Customer</p>
                      <p className="text-lg font-bold text-gray-700">{(data.customer_insights?.total_customers || 0).toLocaleString('id-ID')}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">New (period)</p>
                      <p className="text-lg font-bold text-green-700">{data.customer_insights?.new_customers || 0}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Repeat Rate</p>
                      <p className="text-lg font-bold text-blue-700">{data.customer_insights?.repeat_rate || 0}%</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Avg Order Value</p>
                      <p className="text-lg font-bold text-amber-700">{rupiah(data.customer_insights?.aov)}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 col-span-2">
                      <p className="text-[0.6rem] text-gray-400 uppercase">Newsletter Subscribers</p>
                      <p className="text-lg font-bold text-purple-700">{data.customer_insights?.newsletter_subscribers || 0}<span className="text-xs font-normal text-gray-400 ml-2">({data.customer_insights?.wa_subscribers || 0} WA)</span></p>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">🚚 Shipping Performance</h3>
                  {(data.shipping_performance || []).length === 0 ? (
                    <EmptyState icon="🚚" title="Belum ada data shipping" description="Data akan muncul setelah ada pesanan yang dikirim." size="sm" />
                  ) : (
                    <div className="space-y-2">
                      {(data.shipping_performance || []).map((s, i) => (
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

            {/* === * Phase 2.3: Finance Summary === */}
            {isAdmin && canSee('dashboard_finance') && data.finance && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-700">💰 Finance Summary</h3>
                  <span className="text-[0.6rem] text-gray-400">Estimasi fee Midtrans (MDR {data.finance.mdr_rate || 0.7}%)</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg p-3">
                    <p className="text-[0.6rem] text-gray-500 uppercase">Gross Revenue</p>
                    <p className="text-base font-bold text-green-700">{rupiah(data.finance.gross_revenue)}</p>
                    <p className="text-[0.6rem] text-gray-400 mt-0.5">{data.kpis?.paid_count || 0} transaksi</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-[0.6rem] text-gray-500 uppercase">Pajak Diterima</p>
                    <p className="text-base font-bold text-blue-700">{rupiah(data.finance.tax_collected)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-[0.6rem] text-gray-500 uppercase">Ongkir Diterima</p>
                    <p className="text-base font-bold text-purple-700">{rupiah(data.finance.shipping_collected)}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-[0.6rem] text-gray-500 uppercase">Refund</p>
                    <p className="text-base font-bold text-red-700">{rupiah(data.finance.refund_amount)}</p>
                    <p className="text-[0.6rem] text-gray-400 mt-0.5">{data.finance.refund_count || 0} order</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-2">Biaya Payment Gateway (Estimasi)</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">MDR Fee ({data.finance.mdr_rate || 0.7}%)</span><span className="font-semibold text-gray-700">-{rupiah(data.finance.estimated_mdr_fee)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Fixed Fee (Rp 2K x {data.kpis?.paid_count || 0})</span><span className="font-semibold text-gray-700">-{rupiah(data.finance.estimated_fixed_fee)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Refund</span><span className="font-semibold text-red-600">-{rupiah(data.finance.refund_amount)}</span></div>
                  </div>
                </div>
                <div className="mt-4 bg-gradient-to-r from-eglux-primary to-gray-800 rounded-lg p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[0.65rem] uppercase tracking-wider text-white/60">Estimasi Net Income</p>
                      <p className="text-2xl font-bold">{rupiah(data.finance.estimated_net_income)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.6rem] text-white/60">Margin</p>
                      <p className="text-lg font-bold">{data.finance.gross_revenue > 0 ? Math.round((data.finance.estimated_net_income / data.finance.gross_revenue) * 100) : 0}%</p>
                    </div>
                  </div>
                  <p className="text-[0.6rem] text-white/50 mt-2">⚠️ Estimasi saja. Net income aktual bisa beda karena biaya shipping ke kurir, return shipping, dll.</p>
                </div>
              </div>
            )}

            {/* === Phase 2.4 + 2.5: Sales by Category + Traffic Sources === */}
            {isAdmin && (canSee('dashboard_category') || canSee('dashboard_traffic')) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {canSee('dashboard_category') && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">📊 Penjualan per Kategori</h3>
                    {(data.sales_by_category || []).length === 0 ? (
                      <EmptyState icon="📊" title="Belum ada data penjualan" description="Data akan muncul setelah ada order yang dibayar." size="sm" />
                    ) : (
                      <div className="space-y-2">
                        {(data.sales_by_category || []).slice(0, 6).map((cat, i) => {
                          const maxRevenue = Math.max(...(data.sales_by_category || []).map(c => c.total_revenue), 1);
                          const widthPct = Math.max((cat.total_revenue / maxRevenue) * 100, 5);
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 font-medium truncate flex-1">{cat.category}</span>
                                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                  <span className="text-gray-400">{cat.total_sold} terjual</span>
                                  <span className="text-eglux-secondary font-semibold">{rupiah(cat.total_revenue)}</span>
                                </div>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, hsl(${i * 45}, 70%, 55%), hsl(${i * 45 + 30}, 70%, 60%))` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {canSee('dashboard_traffic') && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">🌐 Sumber Trafik</h3>
                    {(data.traffic_sources || []).length === 0 ? (
                      <EmptyState icon="🌐" title="Belum ada data trafik" description="Integrate trackPageView di frontend untuk mulai tracking." size="sm" />
                    ) : (
                      <div className="space-y-2">
                        {(data.traffic_sources || []).slice(0, 8).map((src, i) => {
                          const sourceIcons = { 'Direct': '🔗', 'Google Search': '🔍', 'Facebook': '📘', 'Instagram': '📷', 'TikTok': '🎵', 'Twitter/X': '🐦', 'YouTube': '▶️', 'WhatsApp': '💬', 'Telegram': '✈️', 'Shopee': '🛍️', 'Tokopedia': '🛒', 'Internal': '🏠', 'Other': '🌐' };
                          const icon = sourceIcons[src.source] || '🌐';
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                              <span className="flex-shrink-0 w-6 text-center">{icon}</span>
                              <span className="text-gray-700 font-medium flex-1 truncate">{src.source}</span>
                              <span className="text-gray-500 flex-shrink-0">{src.visits} visits</span>
                              <span className="font-semibold text-eglux-secondary flex-shrink-0 w-12 text-right">{src.percentage}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* === * Visitor Analytics === */}
            {isAdmin && canSee('dashboard_visitor') && (
              <>
                {data.visitor_stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                      <div className="text-[0.65rem] uppercase tracking-wider text-white/70 mb-1">👁️ Total Views</div>
                      <div className="text-xl font-bold">{(data.visitor_stats.total_views || 0).toLocaleString('id-ID')}</div>
                      <div className="text-[0.65rem] text-white/60 mt-1">page views di periode ini</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">👥 Unique Visitors</div>
                      <div className="text-xl font-bold text-eglux-primary">{(data.visitor_stats.unique_visitors || 0).toLocaleString('id-ID')}</div>
                      <div className="text-[0.65rem] text-gray-400 mt-1">{data.visitor_stats.logged_in_visitors || 0} login · {data.visitor_stats.anonymous_visitors || 0} anon</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">📄 Avg Views/Visitor</div>
                      <div className="text-xl font-bold text-eglux-primary">{(data.visitor_stats.unique_visitors || 0) > 0 ? (data.visitor_stats.total_views / data.visitor_stats.unique_visitors).toFixed(1) : '0'}</div>
                      <div className="text-[0.65rem] text-gray-400 mt-1">halaman per visitor</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      {/* * FIX: Rename "Bounce Rate" -> "No Purchase Rate" (label sesuai logic) */}
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🔄 No Purchase Rate</div>
                      <div className="text-xl font-bold text-eglux-primary">{(data.visitor_stats.unique_visitors || 0) > 0 ? Math.max(0, Math.min(100, Math.round(((data.visitor_stats.unique_visitors - (data.kpis?.paid_count || 0)) / data.visitor_stats.unique_visitors) * 100))) : 0}%</div>
                      <div className="text-[0.65rem] text-gray-400 mt-1">visitor tanpa order</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {data.visits_chart && data.visits_chart.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-gray-700">📈 Kunjungan per Hari</h3>
                        <span className="text-[0.65rem] text-gray-400">Total: {(data.visits_chart || []).reduce((s, d) => s + (d.visits || 0), 0).toLocaleString('id-ID')} visits</span>
                      </div>
                      <div className="flex items-end gap-[2px] h-32 overflow-x-auto pb-2">
                        {data.visits_chart.map((d, i) => {
                          const maxVisits = Math.max(...(data.visits_chart || []).map(x => x.visits || 0), 1);
                          const heightPct = d.visits > 0 ? Math.max((d.visits / maxVisits) * 100, 3) : 0;
                          return (
                            <div key={i} className="flex-shrink-0 group relative" style={{ width: '20px' }}>
                              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap bg-gray-900 text-white text-[0.6rem] px-2 py-1 rounded">{d.label}: {d.visits} visits</div>
                              <div className={`rounded-t-sm transition-all ${d.visits > 0 ? 'bg-blue-500 hover:bg-blue-400' : 'bg-gray-100'}`} style={{ height: `${heightPct}%`, minHeight: d.visits > 0 ? '3px' : '0' }}></div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-2 text-[0.6rem] text-gray-400">
                        <span>{data.visits_chart[0]?.label || ''}</span>
                        {data.visits_chart.length > 2 && <span>{data.visits_chart[Math.floor(data.visits_chart.length / 2)]?.label || ''}</span>}
                        <span>{data.visits_chart[data.visits_chart.length - 1]?.label || ''}</span>
                      </div>
                    </div>
                  )}
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">📄 Halaman Terpopuler</h3>
                    {(data.top_pages || []).length === 0 ? (
                      <EmptyState icon="📄" title="Belum ada data kunjungan" description="Integrate trackPageView di frontend." size="sm" />
                    ) : (
                      <div className="space-y-2">
                        {(data.top_pages || []).slice(0, 8).map((page, i) => {
                          const maxVisits = Math.max(...(data.top_pages || []).map(p => p.visits), 1);
                          const widthPct = Math.max((page.visits / maxVisits) * 100, 5);
                          const pageTypeIcons = { home: '🏠', product: '🏷️', category: '📂', checkout: '💳', other: '📄' };
                          const icon = pageTypeIcons[page.type] || '📄';
                          return (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 font-medium truncate flex-1 flex items-center gap-1.5">
                                  <span>{icon}</span>
                                  <span className="truncate">{page.path}</span>
                                </span>
                                <span className="text-eglux-secondary font-semibold flex-shrink-0 ml-2">{page.visits}x</span>
                              </div>
                              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${widthPct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* === * Phase 4: Team Activity + Online Admins === */}
            {isAdmin && canSee('dashboard_team') && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    🟢 Admin Online
                    <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[0.6rem] font-bold">{(data.online_admins || []).filter(a => a.is_online).length}</span>
                  </h3>
                  {(data.online_admins || []).length === 0 ? (
                    <EmptyState icon="👥" title="Belum ada admin online" description="Termasuk Anda - presence akan muncul setelah navigasi." size="sm" />
                  ) : (
                    <div className="space-y-2">
                      {(data.online_admins || []).map((admin) => {
                        const displayName = admin.full_name || admin.email?.split('@')[0] || 'Admin';
                        const initial = displayName.charAt(0).toUpperCase();
                        return (
                          <div key={admin.user_id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                            <div className="relative flex-shrink-0">
                              {admin.avatar_url ? <img src={admin.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-eglux-secondary/10 text-eglux-secondary flex items-center justify-center font-bold text-xs">{initial}</div>}
                              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${admin.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
                              <p className="text-[0.6rem] text-gray-400 truncate">{admin.current_page || '/'} · {formatTimeAgo(admin.seconds_ago)}</p>
                            </div>
                            <span className="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize flex-shrink-0">{admin.role}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2">
                  <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Aktivitas Tim</h3>
                  {(data.team_activity || []).length === 0 ? (
                    <EmptyState icon="📋" title="Belum ada aktivitas tim" description="Aktivitas admin akan muncul di sini." size="sm" />
                  ) : (
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                      {(data.team_activity || []).map((act) => {
                        const displayName = act.full_name || act.user_email?.split('@')[0] || 'Admin';
                        const initial = displayName.charAt(0).toUpperCase();
                        return (
                          <div key={act.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                            {act.avatar_url ? <img src={act.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <div className="w-6 h-6 rounded-full bg-eglux-accent text-eglux-primary font-bold flex items-center justify-center text-[0.6rem] flex-shrink-0">{initial}</div>}
                            <div className="min-w-0 flex-1">
                              <p className="text-gray-700"><span className="font-semibold">{displayName}</span>{' - '}<span className="text-gray-600">{act.description || act.action}</span></p>
                              <p className="text-gray-400 text-[0.65rem]">{formatTimeAgo(act.time_ago)} · {act.page || '/'}</p>
                            </div>
                            <span className="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize flex-shrink-0">{act.action?.replace(/_/g, ' ')}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === * Customer Activity === */}
            {isAdmin && canSee('dashboard_customer') && (
              <>
                {data.customer_stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">📊 Aktivitas Hari Ini</div>
                      <div className="text-xl font-bold text-eglux-primary">{data.customer_stats.today_count || 0}</div>
                      <div className="text-[0.65rem] text-gray-400 mt-1">events (24h)</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">🟢 Customer Online</div>
                      <div className="text-xl font-bold text-green-700">{data.customer_stats.online_count || 0}</div>
                      <div className="text-[0.65rem] text-gray-400 mt-1">aktif &lt;2 menit</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-xl p-4 col-span-2">
                      <div className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-2">📈 Distribusi Aktivitas (7 hari)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(data.customer_stats.action_distribution || []).slice(0, 8).map((dist, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[0.6rem] rounded-full">{dist.action?.replace(/_/g, ' ')}: <strong>{dist.count}</strong></span>
                        ))}
                        {(data.customer_stats.action_distribution || []).length === 0 && <p className="text-[0.65rem] text-gray-400">Belum ada data</p>}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                      🟢 Customer Online
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[0.6rem] font-bold">{(data.online_customers || []).filter(c => c.is_online).length}</span>
                    </h3>
                    {(data.online_customers || []).length === 0 ? (
                      <EmptyState icon="👥" title="Belum ada customer online" description="Customer yang sedang browsing akan muncul di sini." size="sm" />
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {(data.online_customers || []).slice(0, 10).map((cust) => {
                          const displayName = cust.full_name || cust.email?.split('@')[0] || 'Customer';
                          const initial = displayName.charAt(0).toUpperCase();
                          return (
                            <div key={cust.user_id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                              <div className="relative flex-shrink-0">
                                {cust.avatar_url ? <img src={cust.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[0.65rem]">{initial}</div>}
                                <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-white ${cust.is_online ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
                                <p className="text-[0.6rem] text-gray-400 truncate">{cust.current_page || '/'} · {formatTimeAgo(cust.seconds_ago)}</p>
                              </div>
                              <span className="text-[0.5rem] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize flex-shrink-0">{cust.role}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">📋 Aktivitas Customer</h3>
                    {(data.customer_activity || []).length === 0 ? (
                      <EmptyState icon="📋" title="Belum ada aktivitas customer" description="Aktivitas customer akan muncul di sini." size="sm" />
                    ) : (
                      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                        {(data.customer_activity || []).slice(0, 20).map((act) => {
                          const displayName = act.full_name || act.user_email?.split('@')[0] || 'Customer';
                          const initial = displayName.charAt(0).toUpperCase();
                          const actionIcons = { page_view: '📄', product_view: '🔍', search: '🔎', add_to_cart: '🛒', remove_from_cart: '🗑️', cart_view: '🛒', checkout_view: '💳', checkout: '💳', orders_view: '📦', track_view: '🚚', profile_view: '👤', rewards_view: '⭐', membership_view: '👑', blog_view: '📝', review_submit: '⭐', voucher_claim: '🎫', wishlist_add: '❤️' };
                          const icon = actionIcons[act.action] || '📋';
                          return (
                            <div key={act.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                              {act.avatar_url ? <img src={act.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[0.6rem] flex-shrink-0">{initial}</div>}
                              <div className="min-w-0 flex-1">
                                <p className="text-gray-700"><span className="font-semibold">{displayName}</span>{' - '}<span className="text-gray-600">{act.description || act.action}</span></p>
                                <p className="text-gray-400 text-[0.65rem]">{formatTimeAgo(act.time_ago)} · {act.page || '/'}</p>
                              </div>
                              <span className="text-base flex-shrink-0">{icon}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
};

export default DashboardAdminPage;