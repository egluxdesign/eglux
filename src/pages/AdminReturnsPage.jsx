// src/pages/admin/AdminReturnsPage.jsx
// ============================================================================
// AdminReturnsPage v3 FULL REWRITE — Manage return/refund + exchange + partial refund
// ============================================================================
// Page ini untuk admin manage return/refund customer dengan flow v3:
//
// FLOW:
//   1. Customer submit return → status: pending
//   2. Admin: "Proses" → status: processing → admin kontak customer via WA
//   3. Admin input nominal (Propose Refund) → status: awaiting_customer_confirmation
//   4. Customer buka ReturnModal Mode Konfirmasi → konfirmasi nominal
//      → status: customer_confirmed
//   5. Admin: "Final Approve" → status: approved
//      Pilih resolusi: full_refund / exchange / partial_refund
//   6. Customer kirim balik barang → status: shipping_back
//   7. Admin: "Konfirmasi Diterima" → status: received
//   8. Admin: "Selesaikan Return" → status: completed
//      Order status jadi 'refund' + refunded_at set + refund_amount synced
//
// FEATURES:
//   ✅ 10 status tabs (pending, processing, awaiting_confirmation, customer_confirmed,
//      approved, shipping_back, received, completed, rejected, all)
//   ✅ Per-status panel with conditional rendering
//   ✅ Mutually exclusive button logic (no dead code blocks)
//   ✅ Resolution type selector: full_refund / exchange / partial_refund
//   ✅ Exchange: search produk pengganti + variant + price difference + skip return shipping
//   ✅ Partial refund: nominal locked dari customer_refund_amount (no manual input)
//   ✅ Full refund: nominal locked dari customer_refund_amount
//   ✅ Edit Nominal (re-propose) — admin bisa ubah nominal sebelum final approve
//      Customer harus konfirmasi ulang (status balik ke awaiting_customer_confirmation)
//   ✅ Paksa Setujui — skip konfirmasi customer, langsung final approve (untuk return urgent)
//   ✅ Realtime tab counts dari allReturns (gak reload per tab switch)
//   ✅ WA link ke customer dengan pre-filled message
//
// SECURITY (di edge function submit-return-request):
//   - Untuk customer_confirmed status: nominal di-LOCK ke customer_refund_amount
//     Admin gak bisa ubah nominal saat final approve (anti manipulasi)
//     Kalau mau ubah nominal, gunakan "Edit Nominal" → customer konfirmasi ulang
//   - Untuk awaiting_customer_confirmation status: nominal di-LOCK ke refund_amount
//     (yang admin kirim ke customer via Propose Refund)
//
// BACKEND DEPENDENCIES:
//   - Edge function: supabase/functions/submit-return-request/index.ts
//     Actions: process, propose_refund, approve, reject, confirm_received, complete, force_approve
//   - Tables: order_returns (columns: admin_resolution, refund_amount,
//     customer_refund_amount, replacement_product_id, partial_refund_amount, dll)
//   - SQL 090 trigger: sync refund_amount ke orders.refund_amount + set orders.status='refund'
//     saat order_returns.status='completed'
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_TABS = [
  { key: 'pending',                       label: 'Menunggu' },
  { key: 'processing',                    label: 'Diproses' },
  { key: 'awaiting_customer_confirmation', label: 'Menunggu Konfirmasi' },
  { key: 'customer_confirmed',            label: 'Siap Approve' },
  { key: 'approved',                      label: 'Disetujui' },
  { key: 'shipping_back',                 label: 'Dikirim Balik' },
  { key: 'received',                      label: 'Diterima' },
  { key: 'completed',                     label: 'Selesai' },
  { key: 'rejected',                      label: 'Ditolak' },
  { key: 'all',                           label: 'Semua' },
];

const REASON_LABELS = {
  damaged: 'Produk Rusak',
  missing_item: 'Barang Kurang',
  wrong_item: 'Salah Kirim',
};

const RESOLUTION_LABELS = {
  refund: 'Refund',
  refund_return: 'Refund + Return',
};

const ADMIN_RESOLUTION_LABELS = {
  full_refund: 'Full Refund',
  exchange: 'Exchange (Ganti Barang)',
  partial_refund: 'Partial Refund',
};

const STATUS_BADGE = {
  pending:                       { text: 'Menunggu',           cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  processing:                    { text: 'Diproses',           cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  awaiting_customer_confirmation:{ text: 'Menunggu Konfirmasi', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  customer_confirmed:           { text: 'Siap Approve',       cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  approved:                      { text: 'Disetujui',          cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  shipping_back:                 { text: 'Dikirim Balik',      cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  received:                      { text: 'Diterima',           cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  completed:                     { text: 'Selesai',            cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected:                      { text: 'Ditolak',            cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled:                     { text: 'Dibatalkan',         cls: 'bg-gray-50 text-gray-700 border-gray-200' },
};

// ============================================================================
// HELPERS
// ============================================================================

function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ============================================================================
// AdminReturnsPage — Main Component
// ============================================================================
const AdminReturnsPage = () => {
  // ── State: data + UI ──
  const [allReturns, setAllReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [processing, setProcessing] = useState(null);

  // ── State: approval form ──
  const [adminResolution, setAdminResolution] = useState('full_refund');
  const [refundAmount, setRefundAmount] = useState('');
  const [partialRefundAmount, setPartialRefundAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [returnShippingPaidBy, setReturnShippingPaidBy] = useState('customer');
  const [forwardShippingCost, setForwardShippingCost] = useState('');
  const [skipReturnShipping, setSkipReturnShipping] = useState(false);

  // ── State: exchange product search ──
  const [searchProduct, setSearchProduct] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedReplacement, setSelectedReplacement] = useState(null);

  // ── State: edit nominal toggle (per return_id) ──
  const [showEditNominal, setShowEditNominal] = useState(null);

  // ── fetchReturns: ambil SEMUA returns (no status filter) ──
  // Supaya count tiap tab akurat, gak terpengaruh activeTab
  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_returns')
        .select(`
          id, order_id, user_id, reason, resolution, description, images, video,
          phone, status, admin_notes, admin_resolution,
          refund_amount, partial_refund_amount,
          customer_refund_amount, customer_acknowledged_cs, customer_notes,
          replacement_product_id, replacement_variant_id,
          replacement_product_name, replacement_variant_name,
          replacement_price, price_difference,
          return_shipping_paid_by, return_shipping_cost,
          forward_shipping_cost, forward_tracking_number, forward_courier,
          return_tracking_number, return_courier,
          created_at, updated_at, resolved_at
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAllReturns(data || []);
    } catch (e) {
      console.warn('[AdminReturns] fetch:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  // Filter returns for display berdasarkan activeTab (computed dari allReturns)
  const returns = activeTab === 'all'
    ? allReturns
    : allReturns.filter(r => r.status === activeTab);

  // Tab counts (computed dari allReturns)
  const tabCounts = {};
  STATUS_TABS.forEach(tab => {
    if (tab.key === 'all') {
      tabCounts[tab.key] = allReturns.length;
    } else {
      tabCounts[tab.key] = allReturns.filter(r => r.status === tab.key).length;
    }
  });

  // ── resetForm: reset semua state form ──
  const resetForm = useCallback(() => {
    setAdminResolution('full_refund');
    setRefundAmount('');
    setPartialRefundAmount('');
    setAdminNotes('');
    setReturnShippingPaidBy('customer');
    setForwardShippingCost('');
    setSkipReturnShipping(false);
    setSearchProduct('');
    setSearchResults([]);
    setSelectedReplacement(null);
    setShowEditNominal(null);
  }, []);

  // ============================================================================
  // HELPER FUNCTIONS (Exchange flow)
  // ============================================================================

  // Search products for exchange (min 2 chars)
  const handleProductSearch = async (query) => {
    setSearchProduct(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('products')
      .select(`id, name, product_variants(id, name, price, sku, is_active)`)
      .ilike('name', `%${query}%`)
      .limit(5);
    setSearchResults(data || []);
  };

  // Select replacement variant (untuk exchange)
  const handleSelectReplacement = (product, variant) => {
    setSelectedReplacement({ product, variant });
    setSearchProduct('');
    setSearchResults([]);
  };

  // Calculate price difference (positive = customer pays, negative = seller refunds)
  const calculatePriceDiff = (originalTotal, replacementPrice) => {
    const diff = Number(replacementPrice) - Number(originalTotal);
    return diff;
  };

  // ============================================================================
  // ACTION HANDLERS — call edge function submit-return-request
  // ============================================================================

  // ── Handle "Proses" — admin klik untuk mulai proses + kontak customer via WA ──
  const handleProcess = async (returnId, customerPhone) => {
    if (!confirm('Ubah status ke "Diproses"?\n\nAnda akan menghubungi customer via WhatsApp untuk arahan nominal refund.')) return;
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action: 'process' }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);

      // Open WhatsApp dengan pesan pre-filled (include nominal refund)
      const refundNominal = refundAmount ? rupiah(Number(refundAmount)) : '(set nominal)';
      const waUrl = `https://wa.me/${customerPhone?.replace(/^0/, '62').replace(/\D/g, '') || '6285111752600'}?text=${encodeURIComponent(`Halo, saya admin EGLUX mengenai return yang Anda ajukan.\n\nNominal refund: ${refundNominal}\n\nMohon konfirmasi nominal tersebut. Terima kasih.`)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Propose Refund" — admin input nominal yang akan kasih ke customer ──
  // Status: processing → awaiting_customer_confirmation
  // Customer akan buka ReturnModal Mode Konfirmasi → konfirmasi nominal
  const handleProposeRefund = async (returnId) => {
    if (!refundAmount || Number(refundAmount) <= 0) {
      alert('Isi nominal refund yang akan dikasih ke customer');
      return;
    }
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_id: returnId,
          action: 'propose_refund',
          refund_amount: Number(refundAmount),
          admin_notes: adminNotes,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message + '\n\nCustomer akan buka return form lagi untuk konfirmasi nominal.');
      setSelectedReturn(null);
      resetForm();
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Paksa Setujui" — skip konfirmasi customer, langsung final approve ──
  // Untuk return urgent / customer gak respon dalam X hari
  // Status: awaiting_customer_confirmation → approved (skip customer_confirmed)
  const handleForceApprove = async (returnId) => {
    if (!refundAmount || Number(refundAmount) <= 0) {
      alert('Isi nominal refund dulu sebelum paksa setujui');
      return;
    }
    if (!confirm('⚠️ Paksa setujui?\n\nIni akan skip konfirmasi customer dan langsung approve dengan nominal yang Anda set.\n\nPastikan nominal sudah benar — customer gak akan konfirmasi ulang.')) return;
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_id: returnId,
          action: 'approve',
          admin_resolution: 'full_refund', // default; admin bisa edit lagi di tab "Disetujui"
          refund_amount: Number(refundAmount),
          admin_notes: adminNotes,
          force_skip_customer_confirmation: true,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);
      setSelectedReturn(null);
      resetForm();
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Final Approve" — admin approve dengan resolution type ──
  // Status: customer_confirmed → approved (atau completed kalau partial_refund / exchange + skip_return)
  const handleApprove = async (returnId, orderTotal) => {
    setProcessing(returnId);
    try {
      const payload = {
        return_id: returnId,
        action: 'approve',
        admin_resolution: adminResolution,
        admin_notes: adminNotes,
        return_shipping_paid_by: returnShippingPaidBy,
      };

      if (adminResolution === 'full_refund') {
        // Untuk customer_confirmed: backend auto-lock dari customer_refund_amount
        // Untuk pending/awaiting: kirim body.refund_amount kalau ada
        if (refundAmount) payload.refund_amount = Number(refundAmount);
      } else if (adminResolution === 'exchange') {
        if (!selectedReplacement) {
          alert('Pilih produk pengganti dulu (search di field "Cari produk pengganti")');
          setProcessing(null);
          return;
        }
        payload.replacement_product_id = selectedReplacement.product.id;
        payload.replacement_variant_id = selectedReplacement.variant.id;
        payload.replacement_product_name = selectedReplacement.product.name;
        payload.replacement_variant_name = selectedReplacement.variant.name;
        payload.replacement_price = Number(selectedReplacement.variant.price);
        payload.price_difference = calculatePriceDiff(orderTotal, selectedReplacement.variant.price);
        if (forwardShippingCost) payload.forward_shipping_cost = Number(forwardShippingCost);
        if (skipReturnShipping) payload.skip_return_shipping = true;
      } else if (adminResolution === 'partial_refund') {
        // Untuk customer_confirmed: backend auto-lock dari customer_refund_amount
        // Untuk pending legacy: kirim body.partial_refund_amount kalau ada
        if (partialRefundAmount) {
          payload.partial_refund_amount = Number(partialRefundAmount);
        }
      }

      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error || 'Gagal approve');

      alert('✅ ' + result.message);
      setSelectedReturn(null);
      resetForm();
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Tolak" — admin reject return ──
  const handleReject = async (returnId) => {
    if (!adminNotes) {
      alert('Isi alasan di Admin Notes (wajib untuk reject)');
      return;
    }
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_id: returnId,
          action: 'reject',
          admin_notes: adminNotes,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('❌ Return ditolak');
      setSelectedReturn(null);
      resetForm();
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Konfirmasi Diterima" — untuk shipping_back status ──
  const handleConfirmReceived = async (returnId) => {
    if (!confirm('Konfirmasi barang sudah diterima di gudang?')) return;
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_id: returnId,
          action: 'confirm_received',
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);
      setSelectedReturn(null);
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ── Handle "Selesaikan Return" — untuk received status ──
  // Status: received → completed (trigger SQL 090 sync refund ke orders table)
  const handleComplete = async (returnId, orderId) => {
    if (!confirm('Selesaikan return ini?\n\nPastikan refund sudah ditransfer / barang pengganti sudah dikirim.')) return;
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_id: returnId,
          action: 'complete',
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);
      setSelectedReturn(null);
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <AdminLayout activeTab="returns">
      <div className="p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-eglux-primary">Returns & Refunds</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage customer return requests</p>
          </div>
          <button
            onClick={fetchReturns}
            disabled={loading}
            className="px-3 py-1.5 bg-eglux-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
          >
            {loading ? '⏳ Loading...' : '↻ Refresh'}
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1 no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border
                ${activeTab === tab.key
                  ? 'bg-eglux-primary text-white border-eglux-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-eglux-secondary'}`}
            >
              {tab.label}
              {tabCounts[tab.key] > 0 && (
                <span className={`ml-1.5 ${activeTab === tab.key ? 'text-white/80' : 'text-gray-400'}`}>
                  ({tabCounts[tab.key]})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!loading && returns.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-gray-700 font-medium mb-1">
              Tidak ada return dengan status "{STATUS_TABS.find(t => t.key === activeTab)?.label}"
            </p>
            <p className="text-sm text-gray-400 mb-5">Customer yang ajukan return akan muncul di sini</p>
          </div>
        )}

        {/* Returns List */}
        {!loading && returns.length > 0 && (
          <div className="space-y-3">
            {returns.map((r) => {
              const cfg = STATUS_BADGE[r.status] || { cls: 'bg-gray-100 text-gray-700 border-gray-200', text: r.status };
              const adminRes = r.admin_resolution || 'full_refund';

              return (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">#{shortId(r.id)}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border ${cfg.cls}`}>
                          {cfg.text}
                        </span>
                        {r.admin_resolution && r.admin_resolution !== 'full_refund' && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            {ADMIN_RESOLUTION_LABELS[r.admin_resolution] || r.admin_resolution}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {REASON_LABELS[r.reason] || r.reason} · {RESOLUTION_LABELS[r.resolution] || r.resolution}
                      </p>
                      <p className="text-[0.7rem] text-gray-400 mt-0.5">
                        Order #{shortId(r.order_id)} · {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.65rem] text-gray-400 uppercase">Refund Amount</p>
                      <p className="text-sm font-bold text-eglux-secondary">
                        {r.refund_amount ? rupiah(Number(r.refund_amount)) : '-'}
                      </p>
                      {r.customer_refund_amount && (
                        <p className="text-[0.65rem] text-teal-600 font-medium mt-0.5">
                          Confirmed: {rupiah(Number(r.customer_refund_amount))}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Body — Customer info + description */}
                  <div className="px-4 py-3 space-y-2">
                    {r.description && (
                      <p className="text-xs text-gray-700 leading-relaxed">{r.description}</p>
                    )}
                    {r.phone && (
                      <p className="text-xs text-gray-600">📞 {r.phone}</p>
                    )}
                    {r.customer_notes && (
                      <p className="text-xs text-gray-600 italic">
                        <strong>Customer notes:</strong> {r.customer_notes}
                      </p>
                    )}
                    {r.admin_notes && (
                      <p className="text-xs text-amber-700 italic">
                        <strong>Admin notes:</strong> {r.admin_notes}
                      </p>
                    )}
                    {r.replacement_product_name && (
                      <p className="text-xs text-purple-700">
                        ↩️ Pengganti: {r.replacement_product_name} {r.replacement_variant_name ? `(${r.replacement_variant_name})` : ''}
                      </p>
                    )}

                    {/* Images preview */}
                    {r.images && Array.isArray(r.images) && r.images.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {r.images.slice(0, 4).map((img, i) => (
                          <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={img} alt={`Bukti ${i + 1}`} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                          </a>
                        ))}
                        {r.images.length > 4 && (
                          <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[0.65rem] text-gray-500">
                            +{r.images.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ════════════════════════════════════════════════════════════════════ */}
                  {/* PER-STATUS PANELS — conditional rendering berdasarkan status             */}
                  {/* ════════════════════════════════════════════════════════════════════ */}

                  {/* ── PANEL: pending status — Proses + Tolak ── */}
                  {r.status === 'pending' && (
                    <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                      <input type="text" value={refundAmount} onChange={e => setRefundAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="Nominal refund yang akan dikasih ke customer (Rp)"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                      <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Catatan admin (opsional)..." rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                      <div className="flex gap-2">
                        <button onClick={() => handleProcess(r.id, r.phone)} disabled={processing === r.id}
                          className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 disabled:opacity-50 cursor-pointer border-none">
                          {processing === r.id ? '⏳' : '📞 Proses (Hubungi Customer)'}
                        </button>
                        <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none">
                          ❌ Tolak
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── PANEL: processing status — Propose Refund + Edit Nominal + Force Approve ── */}
                  {r.status === 'processing' && (
                    <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                      <input type="text" value={refundAmount} onChange={e => setRefundAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="Nominal refund (Rp) — akan dikirim ke customer untuk konfirmasi"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                      <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Catatan admin (opsional)..." rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                      <div className="flex gap-2">
                        <button onClick={() => handleProposeRefund(r.id)} disabled={processing === r.id || !refundAmount}
                          className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 cursor-pointer border-none">
                          {processing === r.id ? '⏳' : '📤 Kirim Nominal ke Customer'}
                        </button>
                        <button onClick={() => handleForceApprove(r.id)} disabled={processing === r.id || !refundAmount}
                          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none"
                          title="Skip konfirmasi customer — langsung approve dengan nominal di atas">
                          ⚠️ Paksa Setujui
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── PANEL: awaiting_customer_confirmation — Edit Nominal + Force Approve ── */}
                  {r.status === 'awaiting_customer_confirmation' && (
                    <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-2.5">
                        <p className="text-[0.65rem] text-amber-700 uppercase font-semibold mb-1">⏳ Menunggu Customer Konfirmasi</p>
                        <p className="text-sm font-bold text-amber-900">
                          Nominal diajukan: {r.refund_amount ? rupiah(Number(r.refund_amount)) : '-'}
                        </p>
                        <p className="text-[0.65rem] text-amber-600 mt-1">
                          Customer akan buka ReturnModal Mode Konfirmasi → input nominal yang sama → klik "Konfirmasi Nominal"
                          → status jadi "Siap Approve" (customer_confirmed)
                        </p>
                      </div>

                      {/* Toggle Edit Nominal */}
                      <button
                        onClick={() => {
                          setSelectedReturn(r);
                          setRefundAmount(r.refund_amount ? String(r.refund_amount) : '');
                          setAdminNotes(r.admin_notes || '');
                          setShowEditNominal(showEditNominal === r.id ? null : r.id);
                        }}
                        className="w-full py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 cursor-pointer">
                        ✏️ Edit Nominal (re-propose — customer konfirmasi ulang)
                      </button>

                      {showEditNominal === r.id && (
                        <div className="bg-amber-50/60 border border-amber-200 rounded-md p-3 space-y-2">
                          <p className="text-[0.7rem] font-bold text-amber-900 uppercase">Edit Nominal Refund</p>
                          <div>
                            <label className="block text-[0.65rem] text-gray-500 uppercase mb-1">Nominal Baru</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">Rp</span>
                              <input type="number" min="0" step="1000" value={refundAmount}
                                onChange={e => setRefundAmount(e.target.value)}
                                placeholder="15000"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                            </div>
                          </div>
                          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                            placeholder="Catatan admin (opsional)..." rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                          <div className="flex gap-2">
                            <button onClick={() => { setShowEditNominal(null); resetForm(); }}
                              className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium hover:bg-gray-200 cursor-pointer border-none">
                              Batal
                            </button>
                            <button onClick={() => handleProposeRefund(r.id)}
                              disabled={processing === r.id || !refundAmount}
                              className="flex-1 py-1.5 bg-amber-600 text-white rounded-md text-xs font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer border-none">
                              {processing === r.id ? '⏳' : 'Kirim Nominal Baru'}
                            </button>
                          </div>
                          <p className="text-[0.6rem] text-amber-700 italic">
                            ⚠️ Customer harus konfirmasi nominal baru. Status akan balik ke "Menunggu Konfirmasi".
                          </p>
                        </div>
                      )}

                      <button onClick={() => handleForceApprove(r.id)} disabled={processing === r.id || !refundAmount}
                        className="w-full py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                        title="Skip konfirmasi customer — langsung approve dengan nominal di atas">
                        ⚠️ Paksa Setujui (skip konfirmasi customer)
                      </button>
                    </div>
                  )}

                  {/* ── PANEL: customer_confirmed — Final Approve with Resolution ── */}
                  {/* ⭐ v3 FIX: Conditional fields (Exchange search + Partial input) ADA di sini */}
                  {/* Sebelumnya bug: conditional fields cuma di pending_legacy block yang gak pernah render */}
                  {r.status === 'customer_confirmed' && (
                    <div className="px-4 py-3 border-t border-gray-100 space-y-3">
                      {/* Display nominal customer (LOCKED - tidak bisa edit) */}
                      <div className="bg-teal-50 border border-teal-200 rounded-md p-2.5">
                        <p className="text-[0.65rem] text-teal-700 uppercase font-semibold mb-1">Customer Sudah Konfirmasi</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-[0.6rem] text-gray-500">Nominal admin (proposed)</p>
                            <p className="font-bold text-amber-700">{r.refund_amount ? rupiah(Number(r.refund_amount)) : '-'}</p>
                          </div>
                          <div>
                            <p className="text-[0.6rem] text-gray-500">Nominal customer (confirmed)</p>
                            <p className="font-bold text-teal-700">{r.customer_refund_amount ? rupiah(Number(r.customer_refund_amount)) : '-'}</p>
                          </div>
                        </div>
                        {r.customer_notes && (
                          <p className="text-[0.65rem] text-gray-600 mt-1.5"><strong>Catatan customer:</strong> {r.customer_notes}</p>
                        )}
                      </div>

                      {/* SECURITY: Nominal final LOCKED = customer confirmed amount */}
                      <div className="bg-green-50 border border-green-200 rounded-md p-2.5">
                        <p className="text-[0.65rem] text-green-700 uppercase font-semibold mb-1">🔒 Nominal Final (Locked)</p>
                        <p className="text-lg font-bold text-green-700">
                          {r.customer_refund_amount ? rupiah(Number(r.customer_refund_amount)) : '-'}
                        </p>
                        <p className="text-[0.65rem] text-green-600 mt-1 leading-relaxed">
                          Nominal final = nominal yang customer konfirmasi. Tidak dapat diubah saat final approve untuk hindari manipulasi. Jika perlu mengubah nominal, gunakan tombol "Edit Nominal" di bawah (customer harus konfirmasi ulang).
                        </p>
                      </div>

                      {/* Resolution type selector */}
                      <div>
                        <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-2">Pilih Resolusi Final</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button type="button" onClick={() => setAdminResolution('full_refund')}
                            className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'full_refund' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                            💰 Full Refund
                          </button>
                          <button type="button" onClick={() => setAdminResolution('exchange')}
                            className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'exchange' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                            🔄 Exchange
                          </button>
                          <button type="button" onClick={() => setAdminResolution('partial_refund')}
                            className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'partial_refund' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                            ✂️ Partial
                          </button>
                        </div>
                      </div>

                      {/* ⭐ Conditional fields per resolution type */}

                      {/* Full refund fields — untuk customer_confirmed, nominal LOCKED */}
                      {adminResolution === 'full_refund' && (
                        <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs">
                          <p className="text-[0.65rem] text-gray-500 uppercase font-semibold mb-1">Nominal Refund (Locked)</p>
                          <p className="text-base font-bold text-gray-800">
                            {r.customer_refund_amount ? rupiah(Number(r.customer_refund_amount)) : (r.refund_amount ? rupiah(Number(r.refund_amount)) : '-')}
                          </p>
                          <p className="text-[0.6rem] text-gray-500 mt-1">
                            Nominal final = nominal yang customer konfirmasi. Backend akan otomatis pakai nilai locked ini.
                          </p>
                        </div>
                      )}

                      {/* Exchange fields — search + select replacement product */}
                      {adminResolution === 'exchange' && (
                        <div className="space-y-2">
                          <input type="text" value={searchProduct} onChange={e => handleProductSearch(e.target.value)}
                            placeholder="Cari produk pengganti..." className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                          {searchResults.length > 0 && (
                            <div className="border border-gray-200 rounded-lg max-h-[200px] overflow-y-auto">
                              {searchResults.map(p => (
                                <div key={p.id}>
                                  <p className="px-3 py-1 text-[0.65rem] text-gray-400 uppercase bg-gray-50">{p.name}</p>
                                  {(p.product_variants || []).filter(v => v.is_active).map(v => (
                                    <button key={v.id} type="button" onClick={() => handleSelectReplacement(p, v)}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-eglux-accent/30 border-none bg-transparent cursor-pointer">
                                      {v.name} — {rupiah(v.price)} {v.sku ? `(${v.sku})` : ''}
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedReplacement && (
                            <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs">
                              <p className="font-semibold text-purple-700">
                                Pengganti: {selectedReplacement.product.name} — {selectedReplacement.variant.name}
                              </p>
                              <p>Harga: {rupiah(selectedReplacement.variant.price)}</p>
                              <p>Selisih: {calculatePriceDiff(r.customer_refund_amount || r.refund_amount || 0, selectedReplacement.variant.price) > 0 ? 'Customer bayar' : 'Seller refund'} {rupiah(Math.abs(calculatePriceDiff(r.customer_refund_amount || r.refund_amount || 0, selectedReplacement.variant.price)))}</p>
                              <button type="button" onClick={() => setSelectedReplacement(null)}
                                className="mt-1 text-[0.65rem] text-red-500 hover:underline cursor-pointer border-none bg-transparent">
                                Hapus pilihan
                              </button>
                            </div>
                          )}
                          <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={skipReturnShipping} onChange={e => setSkipReturnShipping(e.target.checked)} className="cursor-pointer" />
                            Customer tidak perlu kirim balik (langsung kirim pengganti)
                          </label>
                          <input type="text" value={forwardShippingCost} onChange={e => setForwardShippingCost(e.target.value.replace(/\D/g, ''))}
                            placeholder="Ongkir kirim pengganti (Rp, opsional)" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                        </div>
                      )}

                      {/* Partial refund fields — untuk customer_confirmed, nominal LOCKED */}
                      {adminResolution === 'partial_refund' && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                          <p className="text-xs text-amber-700">Customer simpan barang. Refund sebagian. Order tetap 'completed'.</p>
                          <div>
                            <p className="text-[0.65rem] text-amber-700 uppercase font-semibold mb-1">Nominal Partial Refund (Locked)</p>
                            <p className="text-base font-bold text-amber-900">
                              {r.customer_refund_amount ? rupiah(Number(r.customer_refund_amount)) : (r.refund_amount ? rupiah(Number(r.refund_amount)) : '-')}
                            </p>
                            <p className="text-[0.6rem] text-amber-600 mt-1">
                              Nominal partial refund = nominal yang customer konfirmasi. Backend akan otomatis pakai nilai locked ini.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Return Shipping selector — common untuk semua resolution */}
                      <div>
                        <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Return Shipping</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setReturnShippingPaidBy('customer')}
                            className={`px-3 py-1.5 rounded-lg text-xs border-2 cursor-pointer ${returnShippingPaidBy === 'customer' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                            Customer bayar
                          </button>
                          <button type="button" onClick={() => setReturnShippingPaidBy('seller')}
                            className={`px-3 py-1.5 rounded-lg text-xs border-2 cursor-pointer ${returnShippingPaidBy === 'seller' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>
                            Seller bayar
                          </button>
                        </div>
                      </div>

                      <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                        placeholder="Catatan admin (opsional)..." rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(r.id, r.customer_refund_amount || r.refund_amount || 0)}
                          disabled={processing === r.id}
                          className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none">
                          {processing === r.id ? '⏳' : '✅ Final Approve'}
                        </button>
                        <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                          className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none">
                          ❌ Tolak
                        </button>
                      </div>

                      {/* ⭐ Tombol re-propose (kalau admin mau ubah nominal) */}
                      <button
                        onClick={() => {
                          setSelectedReturn(r);
                          setRefundAmount(r.refund_amount ? String(r.refund_amount) : '');
                          setAdminNotes(r.admin_notes || '');
                          setShowEditNominal(showEditNominal === r.id ? null : r.id);
                        }}
                        disabled={processing === r.id}
                        className="w-full py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-50 cursor-pointer">
                        ✏️ Edit Nominal (re-propose — customer konfirmasi ulang)
                      </button>

                      {showEditNominal === r.id && (
                        <div className="bg-amber-50/60 border border-amber-200 rounded-md p-3 space-y-2">
                          <p className="text-[0.7rem] font-bold text-amber-900 uppercase">Edit Nominal Refund</p>
                          <div>
                            <label className="block text-[0.65rem] text-gray-500 uppercase mb-1">Nominal Baru</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">Rp</span>
                              <input type="number" min="0" step="1000" value={refundAmount}
                                onChange={e => setRefundAmount(e.target.value)}
                                placeholder="15000"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                            </div>
                          </div>
                          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                            placeholder="Catatan admin (opsional)..." rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                          <div className="flex gap-2">
                            <button onClick={() => { setShowEditNominal(null); resetForm(); }}
                              disabled={processing === r.id}
                              className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none">
                              Batal
                            </button>
                            <button onClick={() => handleProposeRefund(r.id)}
                              disabled={processing === r.id || !refundAmount}
                              className="flex-1 py-1.5 bg-amber-600 text-white rounded-md text-xs font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer border-none">
                              {processing === r.id ? '⏳' : 'Kirim Nominal Baru'}
                            </button>
                          </div>
                          <p className="text-[0.6rem] text-amber-700 italic">
                            ⚠️ Customer harus konfirmasi nominal baru. Status akan balik ke "Menunggu Konfirmasi".
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── PANEL: approved — Konfirmasi Diterima (kalau customer sudah kirim balik) ── */}
                  {r.status === 'approved' && (
                    <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-xs">
                        <p className="font-semibold text-blue-700">✅ Disetujui — Resolusi: {ADMIN_RESOLUTION_LABELS[adminRes] || adminRes}</p>
                        <p className="text-[0.65rem] text-blue-600 mt-1">
                          {adminRes === 'full_refund' && 'Tunggu customer kirim balik barang, lalu klik "Konfirmasi Diterima" di bawah.'}
                          {adminRes === 'exchange' && 'Tunggu customer kirim balik barang, lalu kirim pengganti + klik "Konfirmasi Diterima".'}
                          {adminRes === 'partial_refund' && 'Auto-complete — customer simpan barang. Transfer refund ke customer via bank.'}
                        </p>
                      </div>
                      {adminRes !== 'partial_refund' && (
                        <button onClick={() => handleConfirmReceived(r.id)} disabled={processing === r.id}
                          className="w-full py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 cursor-pointer border-none">
                          {processing === r.id ? '⏳' : '📦 Konfirmasi Diterima'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── PANEL: shipping_back — Konfirmasi Diterima ── */}
                  {r.status === 'shipping_back' && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <div className="mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Sebelum menyelesaikan:</p>
                        {adminRes === 'full_refund' && <p className="text-[0.7rem] text-amber-600">Transfer refund {r.refund_amount ? rupiah(r.refund_amount) : '(set amount)'} ke customer via bank</p>}
                        {adminRes === 'exchange' && <p className="text-[0.7rem] text-amber-600">Siapkan barang pengganti untuk dikirim ke customer</p>}
                        <p className="text-[0.7rem] text-amber-600">📞 {r.phone || '-'}</p>
                      </div>
                      <button onClick={() => handleConfirmReceived(r.id)} disabled={processing === r.id}
                        className="w-full py-2 bg-indigo-500 text-white rounded-lg text-xs font-bold hover:bg-indigo-600 disabled:opacity-50 cursor-pointer border-none">
                        {processing === r.id ? '⏳' : '📦 Konfirmasi Diterima'}
                      </button>
                    </div>
                  )}

                  {/* ── PANEL: received — Selesaikan Return ── */}
                  {r.status === 'received' && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <button onClick={() => handleComplete(r.id, r.order_id)} disabled={processing === r.id}
                        className="w-full py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none">
                        {processing === r.id ? '⏳' : '✅ Selesaikan Return'}
                      </button>
                    </div>
                  )}

                  {/* ── PANEL: completed/rejected/cancelled — Final state (no actions) ── */}
                  {(r.status === 'completed' || r.status === 'rejected' || r.status === 'cancelled') && (
                    <div className="px-4 py-3 border-t border-gray-100">
                      <div className={`p-2 rounded-md text-xs text-center ${
                        r.status === 'completed' ? 'bg-green-50 text-green-700' :
                        r.status === 'rejected' ? 'bg-red-50 text-red-700' :
                        'bg-gray-50 text-gray-700'
                      }`}>
                        {r.status === 'completed' && '🎉 Return selesai. Refund telah diproses.'}
                        {r.status === 'rejected' && '❌ Return ditolak.'}
                        {r.status === 'cancelled' && '🚫 Return dibatalkan.'}
                        {r.resolved_at && (
                          <p className="text-[0.65rem] mt-1 opacity-75">Selesai: {formatDateTime(r.resolved_at)}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminReturnsPage;
