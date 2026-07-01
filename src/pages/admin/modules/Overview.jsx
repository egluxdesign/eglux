// src/pages/admin/modules/Overview.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLang } from '../AdminLayout';

const S = { gold: '#b8943f', goldBg: 'rgba(184,148,63,0.1)' };

const rupiah = (n) => {
  if (!n) return 'Rp 0';
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace('.', ',')} jt`;
  return 'Rp ' + Number(n).toLocaleString('id-ID');
};

const toWIB = (iso) =>
  new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit',
  }) + ' WIB';

const STATUS_STYLE = {
  pending:   { bg: 'var(--bg-warning)',  color: 'var(--text-warning)'  },
  confirmed: { bg: 'var(--bg-accent)',   color: 'var(--text-accent)'   },
  paid:      { bg: 'var(--bg-success)',  color: 'var(--text-success)'  },
  shipped:   { bg: 'var(--bg-accent)',   color: 'var(--text-accent)'   },
  cancelled: { bg: 'var(--bg-danger)',   color: 'var(--text-danger)'   },
};

const StatusPill = ({ status }) => {
  const style = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
      background: style.bg, color: style.color, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

const StatCard = ({ icon, iconStyle, value, label, trend, trendColor, accent }) => (
  <div style={{
    background: '#fff', border: '0.5px solid var(--border)', borderRadius: 10,
    padding: '14px 16px', position: 'relative', overflow: 'hidden',
  }}>
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
    <div style={{
      width: 30, height: 30, borderRadius: 8, display: 'flex',
      alignItems: 'center', justifyContent: 'center', marginBottom: 10,
      ...iconStyle,
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 15 }} aria-hidden="true" />
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
    {trend && <div style={{ fontSize: 11, marginTop: 4, color: trendColor }}>{trend}</div>}
  </div>
);

const MiniBar = ({ pct, highlight }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
    <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{
        width: '100%', height: `${pct}%`, borderRadius: '3px 3px 0 0',
        background: highlight ? S.gold : '#e8e0d0', transition: 'height 0.3s ease',
      }} />
    </div>
  </div>
);

const Overview = ({ onNavigate }) => {
  const { t } = useLang();
  const [stats,        setStats]        = useState({ orders: 0, revenue: 0, customers: 0, pending: 0 });
  const [recentOrders, setRecentOrders] = useState([]);
  const [chartData,    setChartData]    = useState([]);
  const [categories,   setCategories]   = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [ordersRes, customersRes, productsRes] = await Promise.all([
        supabase.from('orders').select('id, total_amount, status, created_at, customers(name, phone)').order('created_at', { ascending: false }),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('products').select('category').eq('is_active', true),
      ]);

      const orders = ordersRes.data ?? [];
      const pending = orders.filter((o) => o.status === 'pending').length;
      const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.total_amount || 0), 0);

      setStats({ orders: orders.length, revenue, customers: customersRes.count ?? 0, pending });
      setRecentOrders(orders.slice(0, 5));

      // Build 7-day chart
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6 - i));
        return { date: d.toDateString(), count: 0, label: d.toLocaleDateString('id-ID', { weekday: 'short' }) };
      });
      orders.forEach((o) => {
        const d = new Date(o.created_at).toDateString();
        const found = days.find((day) => day.date === d);
        if (found) found.count++;
      });
      const max = Math.max(...days.map((d) => d.count), 1);
      setChartData(days.map((d) => ({ ...d, pct: Math.round((d.count / max) * 100) })));

      // Category breakdown
      const catCount = {};
      (productsRes.data ?? []).forEach((p) => { catCount[p.category] = (catCount[p.category] || 0) + 1; });
      const total = Object.values(catCount).reduce((s, c) => s + c, 0);
      const catColors = [S.gold, 'var(--text-accent)', 'var(--text-success)', 'var(--text-warning)'];
      setCategories(
        Object.entries(catCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count], i) => ({ name, pct: Math.round((count / total) * 100), color: catColors[i] }))
      );

      setLoading(false);
    };
    load();
  }, []);

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      {t('loading')}
    </div>
  );

  const thisMonthOrders = recentOrders.filter((o) => {
    const now = new Date();
    const d = new Date(o.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const newToday = recentOrders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatCard
          icon="ti-shopping-bag" value={stats.orders} label={t('total_orders')}
          accent={S.gold} iconStyle={{ background: S.goldBg, color: S.gold }}
          trend={`↑ ${thisMonthOrders} ${t('this_month')}`} trendColor="var(--text-success)"
        />
        <StatCard
          icon="ti-cash" value={rupiah(stats.revenue)} label={t('revenue')}
          accent="var(--text-success)" iconStyle={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}
          trend={`↑ ${t('this_month')}`} trendColor="var(--text-success)"
        />
        <StatCard
          icon="ti-users" value={stats.customers} label={t('total_customers')}
          accent="var(--text-accent)" iconStyle={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}
          trend={`${newToday} ${t('new_today')}`} trendColor="var(--text-muted)"
        />
        <StatCard
          icon="ti-clock" value={stats.pending} label={t('pending_orders')}
          accent="#e05c5c" iconStyle={{ background: '#fdeaea', color: '#e05c5c' }}
          trend={stats.pending > 0 ? t('needs_action') : '—'} trendColor="#e05c5c"
        />
      </div>

      {/* Row 2: recent orders + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 14 }} className="overview-row2">
        {/* Recent Orders */}
        <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{t('recent_orders')}</span>
            <button
              onClick={() => onNavigate('orders')}
              style={{ fontSize: 11, color: S.gold, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('view_all')}
            </button>
          </div>
          {recentOrders.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>{t('no_orders')}</p>
            : recentOrders.map((order) => {
              const initials = (order.customers?.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={order.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '0.5px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', background: S.goldBg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 500, color: S.gold, flexShrink: 0,
                    }}>{initials}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {order.customers?.name || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{toWIB(order.created_at)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {rupiah(order.total_amount)}
                    </span>
                    <StatusPill status={order.status} />
                  </div>
                </div>
              );
            })
          }
        </div>

        {/* Chart + Categories */}
        <div style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 14 }}>
            {t('orders_7days')}
          </div>

          {/* Bar chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 72, marginBottom: 6 }}>
            {chartData.map((d, i) => (
              <MiniBar key={i} pct={d.pct} highlight={i === chartData.length - 1} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
            {chartData.map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                {d.label}
              </div>
            ))}
          </div>

          <div style={{ height: '0.5px', background: 'var(--border)', marginBottom: 14 }} />

          {/* Category breakdown */}
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {t('sales_by_category')}
          </div>
          {categories.map((cat) => (
            <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{cat.name}</div>
              <div style={{ height: 3, borderRadius: 2, background: 'var(--surface-0)', flex: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${cat.pct}%`, background: cat.color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', width: 28, textAlign: 'right' }}>{cat.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .overview-row2 { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default Overview;