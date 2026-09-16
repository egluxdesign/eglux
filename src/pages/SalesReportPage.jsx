// src/pages/SalesReportPage.jsx
// ============================================================================
// SalesReportPage — Shopee-style full sales report page
// ============================================================================
// Halaman dedicated untuk accounting/sales report. Mirip dengan Shopee Seller
// Center "Penjualan" page, dengan breakdown:
//   - Summary cards (Gross Revenue, Refund Amount, Net Revenue, Refund Rate)
//   - Filter period (today / 7d / 30d / month / 3month / custom)
//   - Table breakdown per order status (paid / cancelled / refund / completed)
//   - Table breakdown per product (sold, revenue, refund count, refund amount)
//   - Export CSV button (untuk accounting)
//
// Data source:
//   - RPC get_sales_report(p_from, p_to) — SQL 064 (sudah update ke Shopee-style)
//   - Direct query untuk product breakdown
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

const DATE_RANGES = [
  { value: 'today', label: 'Hari Ini' },
  { value: 'yesterday', label: 'Kemarin' },
  { value: '7d', label: '7 Hari' },
  { value: '30d', label: '30 Hari' },
  { value: 'month', label: 'Bulan Ini' },
  { value: '3month', label: '3 Bulan' },
];

function getRange(range) {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  let from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (range) {
    case 'today':
      break;
    case 'yesterday':
      from = new Date(now);
      from.setDate(now.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      const yEnd = new Date(from);
      yEnd.setHours(23, 59, 59, 999);
      return { from: from.toISOString(), to: yEnd.toISOString() };
    case '7d':
      from.setDate(now.getDate() - 6);
      break;
    case '30d':
      from.setDate(now.getDate() - 29);
      break;
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case '3month':
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    default:
      from.setDate(now.getDate() - 6);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

const SalesReportPage = () => {
  const [range, setRange] = useState('30d');
  const [salesReport, setSalesReport] = useState(null);
  const [productBreakdown, setProductBreakdown] = useState([]);
  const [statusBreakdown, setStatusBreakdown] = useState({ paid: 0, cancelled: 0, refund: 0, completed: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { from, to } = getRange(range);

      // 1. Fetch sales report via RPC (SQL 064 — Shopee-style)
      const { data: reportData, error: reportErr } = await supabase
        .rpc('get_sales_report', { p_from: from, p_to: to });
      if (reportErr) throw reportErr;
      setSalesReport(reportData);

      // 2. Fetch status breakdown (count orders per status in period)
      const { data: statusData, error: statusErr } = await supabase
        .from('orders')
        .select('id, status, payment_status')
        .gte('created_at', from)
        .lte('created_at', to);
      if (statusErr) throw statusErr;

      // ⭐ v3.1: Fetch refund orders dari order_returns (source of truth)
      // Bukan dari orders.status='refund' (yang gak sync kalau SQL 084 belum jalan)
      const { data: refundReturns, error: refundErr } = await supabase
        .from('order_returns')
        .select('order_id, status, admin_resolution, refund_amount, completed_at, resolved_at')
        .eq('status', 'completed')
        .in('admin_resolution', ['full_refund', 'partial_refund'])
        .gt('refund_amount', 0);
      if (refundErr) throw refundErr;

      // Build set of order_ids yang ada refund (untuk period ini)
      const refundedOrderIds = new Set(
        (refundReturns || [])
          .filter(r => {
            const refundDate = r.completed_at || r.resolved_at;
            return refundDate && refundDate >= from && refundDate <= to;
          })
          .map(r => r.order_id)
      );

      const breakdown = { paid: 0, cancelled: 0, refund: 0, completed: 0, total: 0 };
      (statusData || []).forEach(o => {
        breakdown.total++;
        if (o.payment_status !== 'paid') return; // exclude unpaid
        // ⭐ v3.1: refund detection via order_returns (bukan orders.status)
        if (refundedOrderIds.has(o.id)) {
          breakdown.refund++;
        } else if (o.status === 'cancelled' || o.status === 'expired') {
          breakdown.cancelled++;
        } else if (o.status === 'completed' || o.status === 'delivered') {
          breakdown.completed++;
        } else if (o.status === 'pending' || o.status === 'processing' || o.status === 'shipped') {
          breakdown.paid++;
        }
      });
      setStatusBreakdown(breakdown);

      // 3. Fetch product breakdown (top products by revenue in period)
      // ⭐ v3.1: hapus refund_amount dari select orders (tidak dipakai lagi)
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select(`
          product_id,
          product_name,
          quantity,
          subtotal,
          order:orders!inner(id, status, payment_status, created_at, total_amount)
        `)
        .gte('order.created_at', from)
        .lte('order.created_at', to)
        .eq('order.payment_status', 'paid');
      if (itemsErr) throw itemsErr;

      // ⭐ v3.1: Build map refund per order_id dari order_returns (source of truth)
      const refundPerOrder = {};
      (refundReturns || []).forEach(r => {
        const refundDate = r.completed_at || r.resolved_at;
        if (refundDate && refundDate >= from && refundDate <= to) {
          refundPerOrder[r.order_id] = {
            amount: Number(r.refund_amount || 0),
            resolution: r.admin_resolution,
          };
        }
      });

      const productMap = {};
      (items || []).forEach(it => {
        const pid = it.product_id;
        if (!productMap[pid]) {
          productMap[pid] = {
            name: it.product_name || 'Unknown',
            sold: 0,
            revenue: 0,
            refund_count: 0,
            refund_amount: 0,
          };
        }
        productMap[pid].sold += Number(it.quantity || 0);
        productMap[pid].revenue += Number(it.subtotal || 0);

        // ⭐ v3.1: Cek refund dari order_returns (bukan orders.refund_amount)
        const orderRefund = refundPerOrder[it.order?.id];
        if (orderRefund) {
          productMap[pid].refund_count++;
          // Approximate: proporsional refund berdasarkan subtotal item / total order
          // (simplification — actual refund bisa beda untuk partial refund)
          const orderTotal = Number(it.order?.total_amount || it.subtotal || 1);
          productMap[pid].refund_amount += orderRefund.amount * (Number(it.subtotal) / orderTotal);
        }
      });
      const topProducts = Object.entries(productMap)
        .map(([pid, p]) => ({ id: pid, ...p }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
      setProductBreakdown(topProducts);
    } catch (e) {
      console.error('[SalesReportPage] fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Export CSV function
  const handleExportCSV = () => {
    if (!salesReport) return;
    const rows = [
      ['Metric', 'Value'],
      ['Period', `${range} (${getRange(range).from} to ${getRange(range).to})`],
      ['Total Pesanan', salesReport.jumlah_pesanan || 0],
      ['Pesanan Valid', salesReport.pesanan_valid || 0],
      ['Pesanan Dibatalkan', salesReport.pesanan_dibatalkan || 0],
      ['Pesanan Refund', salesReport.pesanan_pengembalian_dana || 0],
      ['Dana Penjualan (Gross)', salesReport.dana_penjualan || 0],
      ['Dana Penjualan Produk', salesReport.dana_penjualan_produk || 0],
      ['Pendapatan Kotor (Net)', salesReport.pendapatan_kotor || 0],
      ['Cancelled Amount', salesReport.detail?.cancelled_amount || 0],
      ['Refund Amount (actual)', salesReport.detail?.refund_amount || 0],
      ['Refund Rate (amount)', `${salesReport.detail?.refund_rate_amount || 0}%`],
      ['Refund Rate (count)', `${salesReport.detail?.refund_rate_count || 0}%`],
      ['Shipping Collected', salesReport.detail?.shipping_collected || 0],
      ['Cancel Rate', `${salesReport.detail?.cancel_rate || 0}%`],
      ['SKU Sold', salesReport.penjualan_produk_sku || 0],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_report_${range}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <AdminLayout title="Laporan Penjualan" subtitle="Memuat data...">
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Laporan Penjualan" subtitle="Error">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          ⚠️ {error}
        </div>
      </AdminLayout>
    );
  }

  const detail = salesReport?.detail || {};

  return (
    <AdminLayout title="Laporan Penjualan" subtitle="Shopee-style sales report">
      <div className="space-y-6">
        {/* Filter period */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 uppercase font-semibold">Periode:</span>
              <div className="flex gap-1.5 flex-wrap">
                {DATE_RANGES.map(r => (
                  <button key={r.value} onClick={() => setRange(r.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                      range === r.value
                        ? 'bg-eglux-primary text-white border-eglux-primary'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-eglux-secondary'
                    }`}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg cursor-pointer border-none flex items-center gap-1.5">
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* Summary cards (4 cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Gross Revenue */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl p-5 text-white">
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60 mb-1">📊 Gross Revenue</div>
            <div className="text-2xl font-bold mb-1">{rupiah(salesReport?.dana_penjualan || 0)}</div>
            <div className="text-[0.65rem] text-white/50">Total transaksi paid (incl refund)</div>
            <div className="text-[0.65rem] text-white/50 mt-1">{salesReport?.jumlah_pesanan || 0} orders</div>
          </div>

          {/* Refund Amount */}
          <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-xl p-5 text-white">
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60 mb-1">💸 Refund Amount</div>
            <div className="text-2xl font-bold mb-1">{rupiah(detail.refund_amount || 0)}</div>
            <div className="text-[0.65rem] text-white/50">{salesReport?.pesanan_pengembalian_dana || 0} orders di-refund</div>
            <div className="text-[0.65rem] text-white/50 mt-1">Refund Rate: <strong>{detail.refund_rate_amount || 0}%</strong> (amount-based)</div>
          </div>

          {/* Net Revenue */}
          <div className="bg-gradient-to-br from-green-600 to-green-800 rounded-xl p-5 text-white">
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60 mb-1">💰 Net Revenue</div>
            <div className="text-2xl font-bold mb-1">{rupiah(salesReport?.pendapatan_kotor || 0)}</div>
            <div className="text-[0.65rem] text-white/50">Gross - Refund - Cancelled + Voucher</div>
            <div className="text-[0.65rem] text-white/50 mt-1">{salesReport?.pesanan_valid || 0} valid orders</div>
          </div>

          {/* Cancelled Amount */}
          <div className="bg-gradient-to-br from-gray-600 to-gray-800 rounded-xl p-5 text-white">
            <div className="text-[0.65rem] uppercase tracking-wider text-white/60 mb-1">🚫 Cancelled</div>
            <div className="text-2xl font-bold mb-1">{rupiah(detail.cancelled_amount || 0)}</div>
            <div className="text-[0.65rem] text-white/50">{salesReport?.pesanan_dibatalkan || 0} orders cancelled</div>
            <div className="text-[0.65rem] text-white/50 mt-1">Cancel Rate: <strong>{detail.cancel_rate || 0}%</strong></div>
          </div>
        </div>

        {/* Status breakdown table */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">📋 Breakdown per Status Pesanan</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                  <th className="text-right px-3 py-2 font-semibold">Jumlah</th>
                  <th className="text-right px-3 py-2 font-semibold">Persentase</th>
                  <th className="text-left px-3 py-2 font-semibold">Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Pending/Paid</span></td>
                  <td className="px-3 py-2 text-right font-medium">{statusBreakdown.paid}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{statusBreakdown.total > 0 ? ((statusBreakdown.paid / statusBreakdown.total) * 100).toFixed(1) : 0}%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">Order paid, belum delivered</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span> Completed/Delivered</span></td>
                  <td className="px-3 py-2 text-right font-medium">{statusBreakdown.completed}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{statusBreakdown.total > 0 ? ((statusBreakdown.completed / statusBreakdown.total) * 100).toFixed(1) : 0}%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">Order delivered ke customer</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span> Refund</span></td>
                  <td className="px-3 py-2 text-right font-medium">{statusBreakdown.refund}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{statusBreakdown.total > 0 ? ((statusBreakdown.refund / statusBreakdown.total) * 100).toFixed(1) : 0}%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">Order dengan refund (uang keluar)</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500"></span> Cancelled/Expired</span></td>
                  <td className="px-3 py-2 text-right font-medium">{statusBreakdown.cancelled}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{statusBreakdown.total > 0 ? ((statusBreakdown.cancelled / statusBreakdown.total) * 100).toFixed(1) : 0}%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">Order dibatalkan/expired (tidak ada transaksi)</td>
                </tr>
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right">{statusBreakdown.total}</td>
                  <td className="px-3 py-2 text-right">100%</td>
                  <td className="px-3 py-2 text-xs text-gray-500">Semua orders di period ini</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Top products breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">🏆 Top 10 Produk (by Revenue)</h3>
          {productBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Tidak ada data produk di period ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                    <th className="text-left px-3 py-2 font-semibold">#</th>
                    <th className="text-left px-3 py-2 font-semibold">Produk</th>
                    <th className="text-right px-3 py-2 font-semibold">Terjual</th>
                    <th className="text-right px-3 py-2 font-semibold">Revenue</th>
                    <th className="text-right px-3 py-2 font-semibold">Refund Count</th>
                    <th className="text-right px-3 py-2 font-semibold">Refund Amount</th>
                    <th className="text-right px-3 py-2 font-semibold">Net Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {productBreakdown.map((p, i) => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{p.name}</td>
                      <td className="px-3 py-2 text-right">{p.sold}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-600">{rupiah(p.revenue)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{p.refund_count}</td>
                      <td className="px-3 py-2 text-right text-red-600">{rupiah(p.refund_amount)}</td>
                      <td className="px-3 py-2 text-right font-bold text-eglux-primary">{rupiah(p.revenue - p.refund_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Daily chart (if available) */}
        {salesReport?.daily_chart && salesReport.daily_chart.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-3">📈 Daily Revenue Chart</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 uppercase">
                    <th className="text-left px-2 py-1.5">Tanggal</th>
                    <th className="text-right px-2 py-1.5">Orders</th>
                    <th className="text-right px-2 py-1.5">Revenue</th>
                    <th className="text-right px-2 py-1.5">Cancelled</th>
                    <th className="text-right px-2 py-1.5">Refund Count</th>
                    <th className="text-right px-2 py-1.5">Refund Amount</th>
                    <th className="text-right px-2 py-1.5">Net Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.daily_chart.slice().reverse().map((d, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-2 py-1.5 font-medium">{d.label}</td>
                      <td className="px-2 py-1.5 text-right">{d.orders || 0}</td>
                      <td className="px-2 py-1.5 text-right text-green-600 font-medium">{rupiah(d.revenue || 0)}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{d.cancelled || 0}</td>
                      <td className="px-2 py-1.5 text-right text-red-500">{d.refund || 0}</td>
                      <td className="px-2 py-1.5 text-right text-red-600 font-medium">{rupiah(d.refund_amount || 0)}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-eglux-primary">{rupiah((d.revenue || 0) - (d.refund_amount || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="text-center text-[0.7rem] text-gray-400 italic">
          Laporan ini mengikuti standar Shopee Seller Center. Period filter refund pakai refunded_at (saat refund terjadi), bukan created_at.
        </div>
      </div>
    </AdminLayout>
  );
};

export default SalesReportPage;
