// src/pages/AdminReturnsPage.jsx
// ============================================================================
// AdminReturnsPage v2 — Manage return/refund + exchange + partial refund
// ============================================================================
// v2 changes:
//   - Admin can choose resolution type saat approve:
//     full_refund | exchange | partial_refund
//   - Exchange: select replacement product + variant + price difference
//   - Partial refund: set amount, customer keeps product, auto-complete
//   - Return shipping: admin decide who pays (customer/seller)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

const STATUS_TABS = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'processing', label: 'Diproses' },
  { key: 'awaiting_customer_confirmation', label: 'Menunggu Konfirmasi' },
  { key: 'customer_confirmed', label: 'Siap Approve' },
  { key: 'approved', label: 'Disetujui' },
  { key: 'shipping_back', label: 'Dikirim Balik' },
  { key: 'received', label: 'Diterima' },
  { key: 'completed', label: 'Selesai' },
  { key: 'rejected', label: 'Ditolak' },
  { key: 'all', label: 'Semua' },
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
  pending: { text: 'Menunggu', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  processing: { text: 'Diproses', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  awaiting_customer_confirmation: { text: 'Menunggu Konfirmasi', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  customer_confirmed: { text: 'Siap Approve', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  approved: { text: 'Disetujui', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  shipping_back: { text: 'Dikirim Balik', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  received: { text: 'Diterima', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { text: 'Ditolak', cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { text: 'Dibatalkan', cls: 'bg-gray-50 text-gray-700 border-gray-200' },
};

function shortId(uuid) { return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase(); }

const AdminReturnsPage = () => {
  const [allReturns, setAllReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [processing, setProcessing] = useState(null);

  // Approval form state
  const [adminResolution, setAdminResolution] = useState('full_refund');
  const [refundAmount, setRefundAmount] = useState('');
  const [partialRefundAmount, setPartialRefundAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [returnShippingPaidBy, setReturnShippingPaidBy] = useState('customer');
  const [forwardShippingCost, setForwardShippingCost] = useState('');
  const [skipReturnShipping, setSkipReturnShipping] = useState(false);

  // Exchange: product search
  const [searchProduct, setSearchProduct] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedReplacement, setSelectedReplacement] = useState(null);

  // ⭐ Toggle card edit nominal di status awaiting_customer_confirmation
  const [showEditNominal, setShowEditNominal] = useState(null);

  // Fetch ALL returns (no status filter) — supaya count tiap tab akurat
  // tidak terpengaruh oleh activeTab
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
    } catch (e) { console.warn('[AdminReturns] fetch:', e?.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  // Filter returns for display berdasarkan activeTab (computed dari allReturns)
  const returns = activeTab === 'all'
    ? allReturns
    : allReturns.filter(r => r.status === activeTab);

  // Search products for exchange
  const handleProductSearch = async (query) => {
    setSearchProduct(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const { data } = await supabase
      .from('products')
      .select(`id, name, product_variants(id, name, price, sku, is_active)`)
      .ilike('name', `%${query}%`)
      .limit(5);
    setSearchResults(data || []);
  };

  // Select replacement variant
  const handleSelectReplacement = (product, variant) => {
    setSelectedReplacement({ product, variant });
    setSearchProduct('');
    setSearchResults([]);
  };

  // Calculate price difference
  const calculatePriceDiff = (originalTotal, replacementPrice) => {
    const diff = Number(replacementPrice) - Number(originalTotal);
    return diff; // positive = customer pays, negative = seller refunds
  };

  // ⭐ NEW: Handle "Proses" — admin click untuk mulai proses + kontak customer
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

      // Open WhatsApp dengan pesan pre-filled
      const waUrl = `https://wa.me/${customerPhone?.replace(/^0/, '62').replace(/\D/g, '') || '6281234567890'}?text=${encodeURIComponent(`Halo, saya admin EGLUX mengenai return yang Anda ajukan. Berikut nominal refund yang akan kami berikan: ...`)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');

      fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  // ⭐ NEW: Handle "Propose Refund" — admin input nominal yang akan kasih ke customer
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
      setSelectedReturn(null); resetForm();
      fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  // ⭐ NEW: Handle "Paksa Setujui" — skip konfirmasi customer, langsung final approve
  // Dipakai di status awaiting_customer_confirmation kalau customer sudah konfirmasi
  // via WhatsApp tapi belum input di sistem, atau admin mau skip step konfirmasi
  const handleSkipCustomerConfirm = async (returnId, refundAmount) => {
    if (!refundAmount) { alert('Nominal refund belum di-set'); return; }
    if (!confirm('Paksa setujui return ini tanpa konfirmasi customer di sistem?\n\nPastikan customer sudah konfirmasi nominal via WhatsApp.\nStatus akan langsung berubah ke "Disetujui".')) return;
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
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);
      setSelectedReturn(null); resetForm();
      fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  // Approve with resolution
  const handleApprove = async (returnId, orderTotal) => {
    setProcessing(returnId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        return_id: returnId,
        action: 'approve',
        admin_resolution: adminResolution,
        admin_notes: adminNotes,
        return_shipping_paid_by: returnShippingPaidBy,
      };

      if (adminResolution === 'full_refund') {
        if (refundAmount) payload.refund_amount = Number(refundAmount);
      } else if (adminResolution === 'exchange') {
        if (!selectedReplacement) { alert('Pilih produk pengganti dulu'); setProcessing(null); return; }
        payload.replacement_product_id = selectedReplacement.product.id;
        payload.replacement_variant_id = selectedReplacement.variant.id;
        payload.replacement_product_name = selectedReplacement.product.name;
        payload.replacement_variant_name = selectedReplacement.variant.name;
        payload.replacement_price = Number(selectedReplacement.variant.price);
        payload.price_difference = calculatePriceDiff(orderTotal, selectedReplacement.variant.price);
        if (forwardShippingCost) payload.forward_shipping_cost = Number(forwardShippingCost);
        if (skipReturnShipping) payload.skip_return_shipping = true;
      } else if (adminResolution === 'partial_refund') {
        if (!partialRefundAmount) { alert('Isi partial refund amount'); setProcessing(null); return; }
        payload.partial_refund_amount = Number(partialRefundAmount);
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
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  const handleReject = async (returnId) => {
    if (!adminNotes) { alert('Isi alasan di Admin Notes'); return; }
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action: 'reject', admin_notes: adminNotes }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('❌ Return ditolak');
      setSelectedReturn(null); resetForm(); fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  const handleComplete = async (returnId, orderId) => {
    if (!confirm('Selesaikan return ini?\n\nPastikan refund sudah ditransfer / barang pengganti sudah dikirim.')) return;
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action: 'complete' }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error);
      alert('✅ ' + result.message);
      setSelectedReturn(null); fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  const handleConfirmReceived = async (returnId) => {
    setProcessing(returnId);
    try {
      const { data: session } = await supabase.auth.getSession();
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action: 'confirm_received' }),
      });
      fetchReturns();
    } catch (e) { alert('Error: ' + e.message); }
    finally { setProcessing(null); }
  };

  const resetForm = () => {
    setAdminResolution('full_refund');
    setRefundAmount(''); setPartialRefundAmount('');
    setAdminNotes(''); setReturnShippingPaidBy('customer');
    setForwardShippingCost(''); setSkipReturnShipping(false);
    setSelectedReplacement(null); setSearchProduct(''); setSearchResults([]);
  };

  const pendingCount = allReturns.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout title="Return & Refund" subtitle={pendingCount > 0 ? `${pendingCount} menunggu review` : 'Kelola pengembalian'}>
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? allReturns.length : allReturns.filter(r => r.status === tab.key).length;
            return (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedReturn(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-all ${
                  activeTab === tab.key ? 'bg-eglux-primary text-white border-eglux-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-eglux-secondary'}`}>
                {tab.label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && returns.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">Tidak ada return request.</p>
          </div>
        )}

        {!loading && returns.length > 0 && (
          <div className="space-y-3">
            {returns.map(r => {
              const badge = STATUS_BADGE[r.status] || { text: r.status, cls: 'bg-gray-50 text-gray-600 border-gray-200' };
              const adminRes = r.admin_resolution || 'full_refund';
              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">#{shortId(r.order_id)}</p>
                        <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>{badge.text}</span>
                        {r.admin_resolution && r.admin_resolution !== 'full_refund' && (
                          <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                            {ADMIN_RESOLUTION_LABELS[adminRes]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {REASON_LABELS[r.reason] || r.reason} · {RESOLUTION_LABELS[r.resolution] || r.resolution}
                      </p>
                      {r.phone && <p className="text-xs text-blue-600 mt-1 font-medium">📞 {r.phone}</p>}
                      <p className="text-[0.7rem] text-gray-400 mt-1">
                        {new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {r.refund_amount > 0 && <p className="text-xs font-semibold text-green-600 mt-1">Refund: {rupiah(r.refund_amount)}</p>}
                      {r.partial_refund_amount > 0 && <p className="text-xs font-semibold text-amber-600 mt-1">Partial Refund: {rupiah(r.partial_refund_amount)}</p>}
                      {r.replacement_product_name && (
                        <p className="text-xs text-purple-600 mt-1">
                          ↩️ Pengganti: {r.replacement_product_name} {r.replacement_variant_name ? `(${r.replacement_variant_name})` : ''}
                          {r.price_difference !== 0 && (
                            <span className={r.price_difference > 0 ? 'text-red-500' : 'text-green-500'}>
                              {' '}{r.price_difference > 0 ? `+${rupiah(r.price_difference)}` : rupiah(r.price_difference)} (selisih)
                            </span>
                          )}
                        </p>
                      )}
                      {r.return_tracking_number && <p className="text-xs text-purple-600 mt-1">Resi balik: {r.return_tracking_number}</p>}
                      {r.forward_tracking_number && <p className="text-xs text-indigo-600 mt-1">Resi pengganti: {r.forward_tracking_number}</p>}
                    </div>
                    <button onClick={() => { setSelectedReturn(selectedReturn?.id === r.id ? null : r); resetForm(); }}
                      className="text-xs font-semibold text-eglux-secondary hover:underline cursor-pointer border-none bg-transparent flex-shrink-0">
                      {selectedReturn?.id === r.id ? 'Tutup' : 'Detail'}
                    </button>
                  </div>

                  {/* Detail Panel */}
                  {selectedReturn?.id === r.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      {/* ⭐ Customer input (sesuai arahan CS) */}
                      {r.customer_acknowledged_cs && (
                        <div className="bg-amber-50/60 border border-amber-100 rounded-md p-3">
                          <p className="text-[0.65rem] text-amber-700 uppercase font-bold mb-1.5">Customer Input (Arahan CS)</p>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-[0.65rem] text-gray-500">Nominal refund yang diajukan</p>
                              <p className="text-sm font-bold text-amber-700">{r.customer_refund_amount ? rupiah(r.customer_refund_amount) : '—'}</p>
                            </div>
                            <div>
                              <p className="text-[0.65rem] text-gray-500">Final refund (admin set)</p>
                              <p className="text-sm font-bold text-green-700">
                                {r.refund_amount ? rupiah(r.refund_amount) : r.partial_refund_amount ? rupiah(r.partial_refund_amount) : '— (belum di-set)'}
                              </p>
                            </div>
                          </div>
                          {r.customer_refund_amount && r.refund_amount && Number(r.customer_refund_amount) !== Number(r.refund_amount) && (
                            <p className="text-[0.7rem] text-red-600 mt-2 font-medium">
                              ⚠️ Selisih: {rupiah(Math.abs(Number(r.customer_refund_amount) - Number(r.refund_amount)))} — verifikasi nominal dengan CS!
                            </p>
                          )}
                          {r.customer_notes && (
                            <p className="text-[0.65rem] text-gray-600 mt-2 leading-relaxed">
                              <strong>Catatan customer:</strong> {r.customer_notes}
                            </p>
                          )}
                        </div>
                      )}
                      {r.description && (
                        <div><p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Deskripsi</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{r.description}</p></div>
                      )}
                      {r.images?.length > 0 && (
                        <div><p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Foto</p>
                          <div className="flex gap-2">{r.images.map((img, i) => (
                            <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80">
                              <img src={img} alt={`Bukti ${i+1}`} className="w-full h-full object-cover" loading="lazy"
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  if (el.dataset.errorHandled) return;
                                  el.dataset.errorHandled = 'true';
                                  console.warn('[AdminReturns] Image failed to load:', img);
                                  el.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(
                                    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#f3f4f6"/><g fill="none" stroke="#d1d5db" stroke-width="1.5"><rect x="8" y="8" width="48" height="48" rx="4"/><circle cx="24" cy="24" r="4"/><path d="m56 40-9-9a5 5 0 0 0-7 0L16 53"/></g></svg>'
                                  );
                                }} /></a>
                          ))}</div></div>
                      )}
                      {r.video && (
                        <div><p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Video</p>
                          <a href={r.video} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-2 bg-purple-50 text-purple-600 rounded-lg text-xs font-medium hover:bg-purple-100">▶️ Lihat Video</a></div>
                      )}
                      {r.admin_notes && (
                        <div><p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Admin Notes</p>
                          <p className="text-xs text-gray-700">{r.admin_notes}</p></div>
                      )}

                      {/* ── PENDING: Tombol "Proses" untuk mulai ── */}
                      {r.status === 'pending' && (
                        <div className="pt-3 border-t border-gray-100 space-y-2">
                          <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 text-[0.7rem] text-blue-700 leading-relaxed">
                            <strong>Next step:</strong> Klik "Proses" → status jadi "Diproses" → WhatsApp customer → kasih nominal refund.
                          </div>
                          <button onClick={() => handleProcess(r.id, r.phone)} disabled={processing === r.id}
                            className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-1.5">
                            {processing === r.id ? '⏳ Memproses...' : '🔵 Proses & Chat Customer via WA'}
                          </button>
                          <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                            className="w-full py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 cursor-pointer">
                            ❌ Tolak
                          </button>
                        </div>
                      )}

                      {/* ── PROCESSING: Form input nominal proposed ── */}
                      {r.status === 'processing' && (
                        <div className="space-y-3 pt-3 border-t border-gray-100">
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5">
                            <p className="text-[0.7rem] text-orange-700 leading-relaxed">
                              <strong>Status: Diproses.</strong> Sudah kontak customer? Input nominal refund yang akan dikasih ke customer. Customer akan konfirmasi nominal ini.
                            </p>
                          </div>

                          <div>
                            <label className="block text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Nominal Refund (proposed)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-medium">Rp</span>
                              <input type="number" min="0" step="1000" value={refundAmount}
                                onChange={e => setRefundAmount(e.target.value)}
                                placeholder="15000"
                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                            </div>
                            <p className="text-[0.65rem] text-gray-500 mt-1">Nominal ini bisa di-edit lagi sebelum final approve</p>
                          </div>

                          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                            placeholder="Catatan admin (opsional)..." rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />

                          <div className="flex gap-2">
                            <button onClick={() => handleProposeRefund(r.id)} disabled={processing === r.id || !refundAmount}
                              className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 cursor-pointer border-none">
                              {processing === r.id ? '⏳' : '💸 Kirim Nominal ke Customer'}
                            </button>
                            <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                              className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none">
                              ❌ Tolak
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── AWAITING_CUSTOMER_CONFIRMATION: Edit nominal atau skip konfirmasi customer ── */}
                      {r.status === 'awaiting_customer_confirmation' && (
                        <div className="pt-3 border-t border-gray-100 space-y-3">
                          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2.5">
                            <p className="text-[0.7rem] text-yellow-700 leading-relaxed mb-1">
                              <strong>Status: Menunggu Konfirmasi Customer.</strong> Nominal sudah dikirim ke customer. Anda dapat:
                            </p>
                            <p className="text-sm font-bold text-yellow-800 mt-1">
                              Nominal yang dikirim: <span className="text-eglux-primary">{r.refund_amount ? rupiah(Number(r.refund_amount)) : '-'}</span>
                            </p>
                          </div>

                          {/* 2 tombol aksi: Edit Nominal atau Skip Konfirmasi */}
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSelectedReturn(r);
                                setRefundAmount(r.refund_amount ? String(r.refund_amount) : '');
                                setAdminNotes(r.admin_notes || '');
                                setShowEditNominal(r.id);
                              }}
                              disabled={processing === r.id}
                              className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-1.5"
                            >
                              ✏️ Edit Nominal
                            </button>
                            <button
                              onClick={() => handleSkipCustomerConfirm(r.id, r.refund_amount)}
                              disabled={processing === r.id}
                              className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-1.5"
                            >
                              {processing === r.id ? '⏳' : '✅ Paksa Setujui'}
                            </button>
                          </div>

                          {/* Form edit nominal (toggle) */}
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
                                <button
                                  onClick={() => { setShowEditNominal(null); resetForm(); }}
                                  disabled={processing === r.id}
                                  className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none"
                                >
                                  Batal
                                </button>
                                <button
                                  onClick={() => handleProposeRefund(r.id)}
                                  disabled={processing === r.id || !refundAmount}
                                  className="flex-1 py-1.5 bg-amber-600 text-white rounded-md text-xs font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer border-none"
                                >
                                  {processing === r.id ? '⏳' : 'Kirim Nominal Baru'}
                                </button>
                              </div>
                              <p className="text-[0.6rem] text-amber-700 italic">
                                Catatan: Customer harus konfirmasi nominal baru. Customer_refund_amount akan di-reset.
                              </p>
                            </div>
                          )}

                          <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                            className="w-full py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 disabled:opacity-50 cursor-pointer">
                            ❌ Tolak
                          </button>
                        </div>
                      )}

                      {/* ── CUSTOMER_CONFIRMED: Final Approve form ── */}
                      {r.status === 'customer_confirmed' && (
                        <div className="space-y-3 pt-3 border-t border-gray-100">
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

                          {/* ⭐ SECURITY: Nominal final LOCKED = customer confirmed amount */}
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
                                className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'full_refund' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>Full Refund</button>
                              <button type="button" onClick={() => setAdminResolution('exchange')}
                                className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'exchange' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>Exchange</button>
                              <button type="button" onClick={() => setAdminResolution('partial_refund')}
                                className={`px-2 py-1.5 rounded-lg text-[0.7rem] border-2 cursor-pointer ${adminResolution === 'partial_refund' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>Partial</button>
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
                              setShowEditNominal(r.id);
                            }}
                            disabled={processing === r.id}
                            className="w-full py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                          >
                            ✏️ Edit Nominal (re-propose — customer konfirmasi ulang)
                          </button>

                          {/* Form edit nominal (toggle) */}
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
                                <button
                                  onClick={() => { setShowEditNominal(null); resetForm(); }}
                                  disabled={processing === r.id}
                                  className="flex-1 py-1.5 bg-gray-100 text-gray-600 rounded-md text-xs font-medium hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none"
                                >
                                  Batal
                                </button>
                                <button
                                  onClick={() => handleProposeRefund(r.id)}
                                  disabled={processing === r.id || !refundAmount}
                                  className="flex-1 py-1.5 bg-amber-600 text-white rounded-md text-xs font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer border-none"
                                >
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

                      {/* ── APPROVAL FORM (legacy pending mode — fallback) ── */}
                      {r.status === 'pending_legacy' && (
                        <div className="space-y-3 pt-3 border-t border-gray-100">
                          {/* Resolution type selector */}
                          <div>
                            <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-2">Pilih Resolusi</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {[
                                { val: 'full_refund', label: 'Full Refund', icon: '💰', desc: 'Uang kembali 100%' },
                                { val: 'exchange', label: 'Exchange', icon: '🔄', desc: 'Ganti barang' },
                                { val: 'partial_refund', label: 'Partial', icon: '✂️', desc: 'Refund sebagian' },
                              ].map(opt => (
                                <button key={opt.val} type="button" onClick={() => setAdminResolution(opt.val)}
                                  className={`px-3 py-2.5 rounded-lg border-2 text-xs cursor-pointer transition-all text-left ${
                                    adminResolution === opt.val ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 hover:border-gray-300'}`}>
                                  <p className="font-bold">{opt.icon} {opt.label}</p>
                                  <p className="text-[0.65rem] text-gray-500">{opt.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Full refund fields */}
                          {adminResolution === 'full_refund' && (
                            <input type="text" value={refundAmount} onChange={e => setRefundAmount(e.target.value.replace(/\D/g, ''))}
                              placeholder="Refund amount (Rp)" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                          )}

                          {/* Exchange fields */}
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
                                  <p className="font-semibold text-purple-700">Pengganti: {selectedReplacement.product.name} — {selectedReplacement.variant.name}</p>
                                  <p>Harga: {rupiah(selectedReplacement.variant.price)}</p>
                                  <p>Selisih: {calculatePriceDiff(r.refund_amount || 0, selectedReplacement.variant.price) > 0 ? 'Customer bayar' : 'Seller refund'} {rupiah(Math.abs(calculatePriceDiff(r.refund_amount || 0, selectedReplacement.variant.price)))}</p>
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

                          {/* Partial refund fields */}
                          {adminResolution === 'partial_refund' && (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                              <p className="text-xs text-amber-700">Customer simpan barang. Refund sebagian. Order tetap 'completed'.</p>
                              <input type="text" value={partialRefundAmount} onChange={e => setPartialRefundAmount(e.target.value.replace(/\D/g, ''))}
                                placeholder="Partial refund amount (Rp)" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                            </div>
                          )}

                          {/* Common: shipping + notes */}
                          <div>
                            <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Return Shipping</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => setReturnShippingPaidBy('customer')}
                                className={`px-3 py-1.5 rounded-lg text-xs border-2 cursor-pointer ${returnShippingPaidBy === 'customer' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>Customer bayar</button>
                              <button type="button" onClick={() => setReturnShippingPaidBy('seller')}
                                className={`px-3 py-1.5 rounded-lg text-xs border-2 cursor-pointer ${returnShippingPaidBy === 'seller' ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200'}`}>Seller bayar</button>
                            </div>
                          </div>
                          <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                            placeholder="Admin notes (wajib kalau reject)..." rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />

                          <div className="flex gap-2">
                            <button onClick={() => handleApprove(r.id, r.refund_amount || 0)} disabled={processing === r.id}
                              className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none">
                              {processing === r.id ? '⏳' : '✅ Setujui'}
                            </button>
                            <button onClick={() => handleReject(r.id)} disabled={processing === r.id}
                              className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none">
                              {processing === r.id ? '⏳' : '❌ Tolak'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ── SHIPPING_BACK: Confirm received ── */}
                      {r.status === 'shipping_back' && (
                        <div className="pt-2 border-t border-gray-100">
                          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
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

                      {/* ── RECEIVED: Complete ── */}
                      {r.status === 'received' && (
                        <div className="pt-2 border-t border-gray-100">
                          <button onClick={() => handleComplete(r.id, r.order_id)} disabled={processing === r.id}
                            className="w-full py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none">
                            {processing === r.id ? '⏳' : '✅ Selesaikan Return'}
                          </button>
                        </div>
                      )}
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
