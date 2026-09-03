// supabase/functions/get-dashboard-data/index.ts
// ============================================================================
// get-dashboard-data — Aggregate all dashboard metrics in 1 API call
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/get-dashboard-data
//   Headers: Authorization: Bearer <user-jwt> (admin only)
//   Body: {
//     date_range: "today" | "7d" | "30d" | "month" | "3month" | "custom",
//     custom_from?: "2026-08-01",  // kalau custom
//     custom_to?: "2026-08-31"
//   }
//
// Return:
//   {
//     kpis: { revenue, orders_count, shipping_on_time_rate, points_active, vouchers_used },
//     alerts: { pending_orders, expiring_orders, pending_claims, shipping_delays },
//     order_pipeline: { pending, paid, processing, shipped, delivered },
//     top_products: [{ name, sold, revenue }],
//     recent_activity: [{ type, description, timestamp }],
//     customer_insights: { total_customers, new_customers, repeat_rate, aov },
//     shipping_performance: [{ courier, total, on_time, delayed, rate }]
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getDateRange(range: string, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;

  switch (range) {
    case "today":
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "yesterday":
      // Yesterday 00:00 - 23:59
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return {
        from: from.toISOString(),
        to: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59).toISOString(),
      };
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "last_week":
      // Last week (Mon-Sun, Indonesian week starts Monday)
      const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=Mon, 6=Sun
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - dayOfWeek);
      thisMonday.setHours(0, 0, 0, 0);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      lastSunday.setHours(23, 59, 59, 999);
      return {
        from: lastMonday.toISOString(),
        to: lastSunday.toISOString(),
      };
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "last_month":
      // Last month 1st - last day
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return {
        from: from.toISOString(),
        to: lastDayOfLastMonth.toISOString(),
      };
    case "3month":
      from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "ytd":
      // Year to date: Jan 1 - now
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (customTo) return { from: from.toISOString(), to: new Date(customTo + "T23:59:59").toISOString() };
      break;
    default:
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { from: from.toISOString(), to };
}

// ⭐ Phase 3A.4: Calculate previous period for trend comparison
// Returns the equivalent previous period (e.g., if current = 7d, previous = 7d before that)
function getPreviousRange(from: string, to: string): { from: string; to: string } {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const duration = toMs - fromMs;
  return {
    from: new Date(fromMs - duration).toISOString(),
    to: new Date(fromMs - 1).toISOString(),
  };
}

// ⭐ Phase 3A.4: Calculate trend percentage
function calcTrend(current: number, previous: number): number | null {
  if (previous === 0 || previous === null || previous === undefined) {
    return current > 0 ? 100 : 0; // 100% growth if from 0
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

const rupiah = (n: number) => n || 0;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const t0 = Date.now();
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json().catch(() => ({}));
    const range = body.date_range || "30d";
    const { from, to } = getDateRange(range, body.custom_from, body.custom_to);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Fetch ALL orders in date range (primary query — needed for KPIs, pipeline, chart) ──
    const tOrders = Date.now();
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("id, status, payment_status, total_amount, subtotal, shipping_cost, created_at, courier_code, biteship_status, biteship_order_id")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false });
    if (ordersErr) console.warn("[get-dashboard-data] orders query error:", ordersErr.message);
    console.log("[get-dashboard-data] orders query:", `${Date.now() - tOrders}ms`, `(${(orders || []).length} rows)`);

    const allOrders = orders || [];
    const paidOrders = allOrders.filter((o: any) => o.payment_status === "paid");
    const totalRevenue = paidOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const totalOrders = allOrders.length;
    const paidCount = paidOrders.length;

    // Shipping on-time rate (computed from allOrders — no DB query needed)
    const deliveredOrders = allOrders.filter((o: any) => o.status === "delivered" || o.status === "completed");
    const shippingRate = deliveredOrders.length > 0 ? 100 : 0;

    // Order Pipeline (computed from allOrders — no DB query needed)
    // ⭐ Added 'return' & 'refund' buckets untuk Phase 1.4
    const pipeline = {
      pending: allOrders.filter((o: any) => o.status === "pending").length,
      paid: allOrders.filter((o: any) => o.status === "processing" && o.payment_status === "paid" && !o.biteship_order_id).length,
      processing: allOrders.filter((o: any) => o.status === "processing").length,
      shipped: allOrders.filter((o: any) => o.status === "shipped").length,
      delivered: deliveredOrders.length,
      return: allOrders.filter((o: any) => o.status === "return").length,
      refund: allOrders.filter((o: any) => o.status === "refund").length,
      cancelled: allOrders.filter((o: any) => o.status === "cancelled" || o.status === "expired").length,
    };

    // Revenue chart data (computed from paidOrders — no DB query needed)
    const revenueChart: { date: string; label: string; revenue: number; orders: number }[] = [];
    const chartMap: Record<string, { revenue: number; orders: number }> = {};
    paidOrders.forEach((o: any) => {
      const d = new Date(o.created_at);
      const dateKey = d.toISOString().split("T")[0];
      if (!chartMap[dateKey]) chartMap[dateKey] = { revenue: 0, orders: 0 };
      chartMap[dateKey].revenue += Number(o.total_amount) || 0;
      chartMap[dateKey].orders += 1;
    });
    const start = new Date(from);
    const end = new Date(to);
    const dayCount = Math.min(Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)), 90);
    for (let i = 0; i <= dayCount; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateKey = d.toISOString().split("T")[0];
      const chartData = chartMap[dateKey] || { revenue: 0, orders: 0 };
      revenueChart.push({
        date: dateKey,
        label: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
        revenue: chartData.revenue,
        orders: chartData.orders,
      });
    }

    // ── 2. ALL remaining queries in PARALLEL (Promise.all) ──
    // Sebelumnya: 12 sequential queries × ~200ms = ~2.4s
    // Sekarang: 1 parallel batch × ~200ms = ~200ms (12x faster)
    const orderIds = paidOrders.map((o: any) => o.id);
    const tParallel = Date.now();
    const parallelResults = await Promise.all([
      // Points count
      supabase.from("point_transactions").select("*", { count: "exact", head: true }).eq("type", "earn").gt("amount", 0),
      // Points balance
      supabase.from("user_points").select("balance").gte("updated_at", from),
      // Vouchers used (column is `used_at`, NOT `created_at`)
      supabase.from("voucher_usages").select("*", { count: "exact", head: true }).gte("used_at", from),
      // Pending orders (>23h)
      supabase.from("orders").select("id, created_at, total_amount").eq("status", "pending").eq("payment_status", "unpaid").lt("created_at", new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString()).order("created_at", { ascending: true }).limit(10),
      // Pending claims
      supabase.from("marketplace_claims").select("id, name, marketplace, order_id, created_at").eq("status", "pending").order("created_at", { ascending: true }).limit(10),
      // Shipping delays
      supabase.from("orders").select("id, courier_code, courier_service, tracking_number, created_at").eq("status", "shipped").lt("updated_at", new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()).order("updated_at", { ascending: true }).limit(10),
      // Order items for top products
      orderIds.length > 0
        ? supabase.from("order_items").select("product_name_snapshot, quantity, subtotal").in("order_id", orderIds).limit(500)
        : Promise.resolve({ data: [], error: null }),
      // Recent orders
      supabase.from("orders").select("id, status, payment_status, total_amount, created_at, customer:customers(name)").order("created_at", { ascending: false }).limit(10),
      // Recent points
      supabase.from("point_transactions").select("id, amount, source, description, created_at").order("created_at", { ascending: false }).limit(5),
      // Total customers
      supabase.from("customers").select("*", { count: "exact", head: true }),
      // New customers
      supabase.from("customers").select("*", { count: "exact", head: true }).gte("created_at", from),
      // Customer order counts (for repeat rate)
      supabase.from("orders").select("customer_id").gte("created_at", from),
      // Newsletter subscribers
      supabase.from("newsletter_subscribers").select("*", { count: "exact", head: true }).eq("status", "active"),
      // WA subscribers
      supabase.from("newsletter_subscribers").select("*", { count: "exact", head: true }).eq("status", "active").eq("marketing_wa_opt_in", true),
      // ⭐ Phase 1.1: Page views (untuk conversion rate)
      supabase.from("page_views").select("*", { count: "exact", head: true }).gte("created_at", from).lte("created_at", to),
      // ⭐ Phase 1.1: Product page views (lebih spesifik untuk conversion)
      supabase.from("page_views").select("*", { count: "exact", head: true }).eq("page_type", "product").gte("created_at", from).lte("created_at", to),
      // ⭐ Phase 2.1: Active vouchers (marketing center)
      supabase.from("vouchers").select("id, code, discount_type, discount_value, is_active, end_at").eq("is_active", true).order("end_at", { ascending: true }).limit(5),
      // ⭐ Phase 2.1: Active point rewards (marketing center)
      supabase.from("point_rewards").select("id, name, points_cost, is_active").eq("is_active", true).order("points_cost", { ascending: true }).limit(5),
    ]);
    const [pointsCountRes, pointsBalanceRes, vouchersRes, pendingOrdersRes, pendingClaimsRes, shippingDelaysRes, itemsRes, recentOrdersRes, recentPointsRes, totalCustRes, newCustRes, custOrderCountsRes, newsletterRes, waSubsRes, pageViewsRes, productViewsRes, activeVouchersRes, activeRewardsRes] = parallelResults;
    console.log("[get-dashboard-data] parallel batch:", `${Date.now() - tParallel}ms`);
    // Surface per-query errors so they don't silently zero out KPIs
    const errs = parallelResults.map((r: any, i: number) => r?.error ? `[${i}] ${r.error.message}` : null).filter(Boolean);
    if (errs.length) console.warn("[get-dashboard-data] query errors:", errs.join(" | "));

    // ── 3. Process parallel results ──
    const totalPointsActive = (pointsBalanceRes.data || []).reduce((s: number, p: any) => s + (p.balance || 0), 0);
    const pendingOrders = pendingOrdersRes.data || [];
    const pendingClaims = pendingClaimsRes.data || [];
    const shippingDelays = shippingDelaysRes.data || [];

    // Top products
    let topProducts: any[] = [];
    const productMap: Record<string, { name: string; sold: number; revenue: number }> = {};
    (itemsRes.data || []).forEach((it: any) => {
      const name = it.product_name_snapshot || "Unknown";
      if (!productMap[name]) productMap[name] = { name, sold: 0, revenue: 0 };
      productMap[name].sold += Number(it.quantity) || 1;
      productMap[name].revenue += Number(it.subtotal) || 0;
    });
    topProducts = Object.values(productMap).sort((a, b) => b.sold - a.sold).slice(0, 5);

    // ── 4. Recent Activity (from parallel results — no extra queries needed) ──
    const recentOrdersData = recentOrdersRes.data || [];
    const recentPointsData = recentPointsRes.data || [];

    const recentActivity = [
      ...recentOrdersData.map((o: any) => ({
        type: o.payment_status === "paid" ? "payment" : o.status === "shipped" ? "shipping" : "order",
        description: `${o.customer?.name || "Customer"} — #${(o.id || "").slice(0, 8).toUpperCase()} — Rp ${rupiah(Number(o.total_amount)).toLocaleString("id-ID")}`,
        timestamp: o.created_at,
      })),
      ...recentPointsData.map((p: any) => ({
        type: "points",
        description: `${p.amount > 0 ? "+" : ""}${p.amount} poin — ${p.description || p.source}`,
        timestamp: p.created_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15);

    // ── 9. Customer Insights (from parallel results — no extra queries) ──
    const totalCustomers = totalCustRes.count || 0;
    const newCustomers = newCustRes.count || 0;
    const customerOrderCounts = custOrderCountsRes.data || [];
    const uniqueCustomers = new Set(customerOrderCounts.map((c: any) => c.customer_id));
    const repeatCustomers = (customerOrderCounts || []).reduce((acc: Record<string, number>, c: any) => {
      acc[c.customer_id] = (acc[c.customer_id] || 0) + 1;
      return acc;
    }, {});
    const repeatCount = Object.values(repeatCustomers).filter((c: number) => c > 1).length;
    const repeatRate = uniqueCustomers.size > 0 ? Math.round((repeatCount / uniqueCustomers.size) * 100) : 0;

    const aov = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0;

    // ── 10. Shipping Performance ──
    const courierStats: Record<string, { courier: string; total: number; on_time: number; delayed: number }> = {};
    deliveredOrders.forEach((o: any) => {
      const courier = o.courier_code || "unknown";
      if (!courierStats[courier]) courierStats[courier] = { courier, total: 0, on_time: 0, delayed: 0 };
      courierStats[courier].total++;
      courierStats[courier].on_time++;
    });
    (shippingDelays || []).forEach((o: any) => {
      const courier = o.courier_code || "unknown";
      if (!courierStats[courier]) courierStats[courier] = { courier, total: 0, on_time: 0, delayed: 0 };
      courierStats[courier].delayed++;
    });
    const shippingPerformance = Object.values(courierStats).map((s) => ({
      ...s,
      rate: s.total > 0 ? Math.round((s.on_time / s.total) * 100) : 0,
    }));

    // ── 11. Newsletter subscribers (from parallel results) ──
    const newsletterCount = newsletterRes.count || 0;
    const waSubscribers = waSubsRes.count || 0;

    // ── 12. ⭐ Phase 1.1: Conversion Funnel ──
    const totalViews = pageViewsRes.count || 0;
    const productViews = productViewsRes.count || 0;
    const conversionRate = totalViews > 0 ? Math.round((paidCount / totalViews) * 1000) / 10 : 0; // 1 decimal place
    const productConversionRate = productViews > 0 ? Math.round((paidCount / productViews) * 1000) / 10 : 0;

    // ── 13. ⭐ Phase 1.2: Shop Health Score (composite 0-100) ──
    // Formula:
    //   shipping_on_time (40%) — based on delivered vs delayed
    //   cancel_rate (30%) — lower is better, invert: (100 - cancel_rate)
    //   fulfillment_rate (20%) — paid orders vs total orders
    //   base_score (10%) — flat 10 points
    const cancelledOrExpired = allOrders.filter((o: any) => ["cancelled", "expired"].includes(o.status)).length;
    const returnedCount = allOrders.filter((o: any) => o.status === "return").length;
    const cancelRate = totalOrders > 0 ? Math.round(((cancelledOrExpired + returnedCount) / totalOrders) * 100) : 0;
    const fulfillmentRate = totalOrders > 0 ? Math.round((paidCount / totalOrders) * 100) : 0;
    const shippingOnTimeRaw = (deliveredOrders.length + shippingDelays.length) > 0
      ? Math.round((deliveredOrders.length / (deliveredOrders.length + shippingDelays.length)) * 100)
      : 100;
    const healthScore = Math.min(100, Math.max(0, Math.round(
      (shippingOnTimeRaw * 0.4) +
      ((100 - cancelRate) * 0.3) +
      (fulfillmentRate * 0.2) +
      10  // base score
    )));

    const healthBreakdown = {
      shipping_on_time: shippingOnTimeRaw,
      cancel_rate: cancelRate,
      fulfillment_rate: fulfillmentRate,
      response_time_hours: null, // TODO: add when ticket system has response tracking
    };

    // ── 14. ⭐ Phase 2.1: Marketing Center summary ──
    const activeVouchers = (activeVouchersRes.data || []).map((v: any) => ({
      id: v.id,
      code: v.code,
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      valid_until: v.valid_until,
    }));
    const activeRewards = (activeRewardsRes.data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      points_cost: r.points_cost,
    }));

    // ── 14.75. ⭐ Visitor Analytics via RPC (aggregasi di PostgreSQL, bukan JS) ──
    let visitorStats: any = { total_views: 0, unique_visitors: 0, unique_sessions: 0, logged_in_visitors: 0, anonymous_visitors: 0 };
    let topPages: any[] = [];
    let visitsChart: any[] = [];
    try {
      const [visitorStatsRes, topPagesRes, visitsChartRes] = await Promise.all([
        supabase.rpc("get_visitor_stats", { p_from: from, p_to: to }),
        supabase.rpc("get_top_pages", { p_from: from, p_to: to, p_limit: 10 }),
        supabase.rpc("get_visits_chart", { p_from: from, p_to: to }),
      ]);

      if (visitorStatsRes.data) visitorStats = visitorStatsRes.data;
      if (topPagesRes.data) topPages = topPagesRes.data as any[];
      if (visitsChartRes.data) visitsChart = visitsChartRes.data as any[];

      // Log errors if any (don't crash, just warn)
      if (visitorStatsRes.error) console.warn("[get-dashboard-data] visitor_stats RPC error:", visitorStatsRes.error.message);
      if (topPagesRes.error) console.warn("[get-dashboard-data] top_pages RPC error:", topPagesRes.error.message);
      if (visitsChartRes.error) console.warn("[get-dashboard-data] visits_chart RPC error:", visitsChartRes.error.message);
    } catch (e) {
      console.warn("[get-dashboard-data] Visitor analytics RPC failed:", e?.message);
    }

    // ── 14.5. ⭐ Phase 3A.4: Previous period data untuk trend comparison ──
    // Query 1 extra: orders di previous period (untuk calc trend revenue & orders)
    const prevRange = getPreviousRange(from, to);
    const { data: prevOrdersData } = await supabase
      .from("orders")
      .select("id, payment_status, total_amount")
      .gte("created_at", prevRange.from)
      .lte("created_at", prevRange.to);
    const prevOrders = prevOrdersData || [];
    const prevPaidOrders = prevOrders.filter((o: any) => o.payment_status === "paid");
    const prevRevenue = prevPaidOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    const prevPaidCount = prevPaidOrders.length;
    const prevTotalOrders = prevOrders.length;

    // Calculate trends
    const revenueTrend = calcTrend(totalRevenue, prevRevenue);
    const ordersTrend = calcTrend(totalOrders, prevTotalOrders);
    const paidOrdersTrend = calcTrend(paidCount, prevPaidCount);

    // ⭐ Phase 3A.1: Build sparkline data dari revenue_chart (last 10 days)
    const revChart = revenueChart || [];
    const sparklineData = revChart.slice(-10).map((d: any) => d.revenue || 0);
    const sparklineOrders = revChart.slice(-10).map((d: any) => d.orders || 0);

    // ── 15. ⭐ Phase 2.3: Finance Summary ──
    // Compute dari data orders yang sudah ada (tanpa extra query)
    const totalTax = paidOrders.reduce((s: number, o: any) => s + Number(o.tax_amount || 0), 0);
    const totalShipping = paidOrders.reduce((s: number, o: any) => s + Number(o.shipping_cost || 0), 0);
    const totalSubtotal = paidOrders.reduce((s: number, o: any) => s + Number(o.subtotal || 0), 0);
    const refundOrders = allOrders.filter((o: any) => o.status === "refund");
    const totalRefund = refundOrders.reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);
    // Estimasi fee Midtrans (MDR 0.7% + Rp 2000 per transaksi)
    const estimatedMdrFee = Math.round(totalRevenue * 0.007);
    const estimatedFixedFee = paidCount * 2000;
    const estimatedNetIncome = totalRevenue - estimatedMdrFee - estimatedFixedFee - totalRefund;

    const financeSummary = {
      gross_revenue: totalRevenue,
      product_subtotal: totalSubtotal,
      tax_collected: totalTax,
      shipping_collected: totalShipping,
      refund_amount: totalRefund,
      refund_count: refundOrders.length,
      estimated_mdr_fee: estimatedMdrFee,
      estimated_fixed_fee: estimatedFixedFee,
      estimated_net_income: estimatedNetIncome,
      mdr_rate: 0.7, // percentage
    };

    // ── 16. ⭐ Phase 2.4 & 2.5: Sales by Category + Traffic Sources (RPC calls) ──
    // Pakai RPC function yang sudah dibuat di SQL 058 (SECURITY DEFINER, bypass RLS)
    let salesByCategory: any[] = [];
    let trafficSources: any[] = [];
    try {
      const [catResult, trafficResult] = await Promise.all([
        supabase.rpc("get_sales_by_category", { p_from: from, p_to: to }),
        supabase.rpc("get_traffic_sources", { p_from: from, p_to: to }),
      ]);
      salesByCategory = (catResult.data || []) as any[];
      trafficSources = (trafficResult.data || []) as any[];
    } catch (e) {
      console.warn("[get-dashboard-data] RPC category/traffic error:", e?.message);
    }

    // ── 17. ⭐ Phase 4: Team Activity + Online Admins ──
    let teamActivity: any[] = [];
    let onlineAdmins: any[] = [];
    try {
      const [activityResult, onlineResult] = await Promise.all([
        supabase.rpc("get_team_activity", { p_limit: 15 }),
        supabase.rpc("get_online_admins"),
      ]);
      teamActivity = (activityResult.data || []) as any[];
      onlineAdmins = (onlineResult.data || []) as any[];
    } catch (e) {
      console.warn("[get-dashboard-data] RPC team/online error:", e?.message);
    }

    // ── 17.5. ⭐ Customer Activity + Online Customers + Stats ──
    let customerActivity: any[] = [];
    let onlineCustomers: any[] = [];
    let customerStats: any = null;
    try {
      const [custActivityResult, onlineCustResult, custStatsResult] = await Promise.all([
        supabase.rpc("get_customer_activity", { p_limit: 20, p_role_filter: null }),
        supabase.rpc("get_online_customers"),
        supabase.rpc("get_customer_activity_stats"),
      ]);
      customerActivity = (custActivityResult.data || []) as any[];
      onlineCustomers = (onlineCustResult.data || []) as any[];
      customerStats = custStatsResult.data;
    } catch (e) {
      console.warn("[get-dashboard-data] RPC customer activity error:", e?.message);
    }

    // ── 18. ⭐ 5-Stage Conversion Funnel ──
    let conversionFunnel: any = null;
    let salesReport: any = null;
    try {
      const [funnelResult, salesResult] = await Promise.all([
        supabase.rpc("get_conversion_funnel", { p_from: from, p_to: to }),
        supabase.rpc("get_sales_report", { p_from: from, p_to: to }),
      ]);
      conversionFunnel = funnelResult.data;
      salesReport = salesResult.data;
      if (funnelResult.error) console.warn("[get-dashboard-data] funnel RPC error:", funnelResult.error.message);
      if (salesResult.error) console.warn("[get-dashboard-data] sales report RPC error:", salesResult.error.message);
    } catch (e) {
      console.warn("[get-dashboard-data] funnel/sales RPC failed:", e?.message);
    }

    // ── Assemble response ──
    console.log("[get-dashboard-data] total:", `${Date.now() - t0}ms`);
    return json({
      success: true,
      date_range: { from, to, label: range },
      kpis: {
        revenue: totalRevenue,
        orders_count: totalOrders,
        paid_count: paidCount,
        shipping_on_time_rate: shippingRate,
        delivered_count: deliveredOrders.length,
        points_active: totalPointsActive,
        points_transactions: pointsCountRes.count || 0,
        vouchers_used: vouchersRes.count || 0,
        // ⭐ Phase 1.1: Conversion metrics
        page_views: totalViews,
        product_views: productViews,
        conversion_rate: conversionRate,
        product_conversion_rate: productConversionRate,
        // ⭐ Phase 1.2: Health score
        health_score: healthScore,
        cancel_rate: cancelRate,
        fulfillment_rate: fulfillmentRate,
        // ⭐ Phase 3A.4: Trend indicators (vs previous period)
        trends: {
          revenue: revenueTrend,
          orders: ordersTrend,
          paid_orders: paidOrdersTrend,
        },
        // ⭐ Phase 3A.1: Sparkline data (last 10 days)
        sparkline: {
          revenue: sparklineData,
          orders: sparklineOrders,
        },
      },
      // ⭐ Phase 1.2: Shop Health breakdown
      shop_health: healthBreakdown,
      // ⭐ Phase 2.1: Marketing Center
      marketing: {
        active_vouchers: activeVouchers,
        active_rewards: activeRewards,
      },
      // ⭐ Phase 2.3: Finance Summary
      finance: financeSummary,
      // ⭐ Phase 2.4: Sales by Category
      sales_by_category: salesByCategory,
      // ⭐ Phase 2.5: Traffic Sources
      traffic_sources: trafficSources,
      // ⭐ Visitor Analytics (unique visitors + top pages + visits chart)
      visitor_stats: visitorStats,
      top_pages: topPages,
      visits_chart: visitsChart,
      // ⭐ Phase 4: Team Activity + Online Admins
      team_activity: teamActivity,
      online_admins: onlineAdmins,
      // ⭐ Customer Activity (pro/verified)
      customer_activity: customerActivity,
      online_customers: onlineCustomers,
      customer_stats: customerStats,
      // ⭐ 5-Stage Conversion Funnel
      conversion_funnel: conversionFunnel,
      // ⭐ Sales Report (Shopee-style)
      sales_report: salesReport,
      alerts: {
        pending_orders: pendingOrders || [],
        pending_orders_count: pendingOrders?.length || 0,
        pending_claims: pendingClaims || [],
        pending_claims_count: pendingClaims?.length || 0,
        shipping_delays: shippingDelays || [],
        shipping_delays_count: shippingDelays?.length || 0,
      },
      order_pipeline: pipeline,
      revenue_chart: revenueChart,
      top_products: topProducts,
      recent_activity: recentActivity,
      customer_insights: {
        total_customers: totalCustomers || 0,
        new_customers: newCustomers || 0,
        repeat_rate: repeatRate,
        aov,
        newsletter_subscribers: newsletterCount || 0,
        wa_subscribers: waSubscribers || 0,
      },
      shipping_performance: shippingPerformance,
    });
  } catch (e) {
    console.error("[get-dashboard-data] Error:", e);
    return json({ error: e.message }, 500);
  }
});
