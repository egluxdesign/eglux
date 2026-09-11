// src/pages/AdminReturnsPage.jsx
// ============================================================================
// AdminReturnsPage — Admin manage return/refund requests
// ============================================================================
// Features:
//   - List all return requests (filter by status)
//   - View detail (reason, resolution, description, images, customer info)
//   - Approve (set refund_amount + return_shipping_cost)
//   - Reject (with admin_notes)
//   - Confirm received (complete return, update order status to 'refund')
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { supabase } from '../lib/supabaseClient';
import { rupiah } from '../context/CartContext';

const STATUS_TABS = [
  { key: 'pending', label: 'Menunggu Review', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'approved', label: 'Disetujui', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { key: 'shipping_back', label: 'Dalam Pengiriman', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'completed', label: 'Selesai', color: 'bg-green-50 text-green-700 border-green-200' },
  { key: 'rejected', label: 'Ditolak', color: 'bg-red-50 text-red-700 border-red-200' },
  { key: 'all', label: 'Semua', color: 'bg-gray-50 text-gray-700 border-gray-200' },
];

const REASON_LABELS = {
  damaged: 'Produk Rusak / Cacat',
  missing_item: 'Barang Kurang / Tidak Lengkap',
  wrong_item: 'Salah Kirim Barang',
};

const RESOLUTION_LABELS = {
  refund: 'Refund (berdasarkan kondisi)',
  refund_return: 'Refund + Return (kirim balik)',
};

const STATUS_BADGE = {
  pending: { text: 'Menunggu', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { text: 'Disetujui', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  shipping_back: { text: 'Dalam Pengiriman', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  completed: { text: 'Selesai', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { text: 'Ditolak', cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { text: 'Dibatalkan', cls: 'bg-gray-50 text-gray-700 border-gray-200' },
};

function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

const AdminReturnsPage = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [returnShippingCost, setReturnShippingCost] = useState('');

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('order_returns')
        .select(`
          id, order_id, user_id, reason, resolution, description, images, video,
          phone, status, admin_notes, refund_amount, return_shipping_cost,
          return_tracking_number, return_courier,
          created_at, updated_at, resolved_at
        `)
        .order('created_at', { ascending: false });

      if (activeTab !== 'all') {
        query = query.eq('status', activeTab);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReturns(data || []);
    } catch (e) {
      console.warn('[AdminReturns] fetch error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  // Approve return request
  const handleApprove = async (returnId) => {
    setProcessing(returnId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updates = {
        status: 'approved',
        resolved_at: new Date().toISOString(),
        admin_user_id: user?.id,
      };
      if (refundAmount) updates.refund_amount = Number(refundAmount);
      if (returnShippingCost) updates.return_shipping_cost = Number(returnShippingCost);
      if (adminNotes) updates.admin_notes = adminNotes;

      const { error } = await supabase
        .from('order_returns')
        .update(updates)
        .eq('id', returnId);

      if (error) throw error;
      alert('✅ Return request disetujui');
      setSelectedReturn(null);
      setRefundAmount('');
      setAdminNotes('');
      setReturnShippingCost('');
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // Reject return request
  const handleReject = async (returnId) => {
    if (!adminNotes) { alert('Isi alasan penolakan di Admin Notes'); return; }
    setProcessing(returnId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('order_returns')
        .update({
          status: 'rejected',
          admin_notes: adminNotes,
          resolved_at: new Date().toISOString(),
          admin_user_id: user?.id,
        })
        .eq('id', returnId);

      if (error) throw error;
      alert('❌ Return request ditolak');
      setSelectedReturn(null);
      setAdminNotes('');
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  // Confirm received (complete return)
  const handleComplete = async (returnId, orderId) => {
    if (!confirm('Konfirmasi barang sudah diterima? Refund akan diproses dan order status diupdate ke refund.')) return;
    setProcessing(returnId);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Update return status
      const { error: returnErr } = await supabase
        .from('order_returns')
        .update({
          status: 'completed',
          resolved_at: new Date().toISOString(),
          admin_user_id: user?.id,
        })
        .eq('id', returnId);
      if (returnErr) throw returnErr;

      // Update order status to 'refund'
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ status: 'refund' })
        .eq('id', orderId);
      if (orderErr) console.warn('[AdminReturns] Order status update failed:', orderErr.message);

      alert('✅ Return completed. Order status updated to refund.');
      setSelectedReturn(null);
      fetchReturns();
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessing(null);
    }
  };

  const pendingCount = returns.filter(r => r.status === 'pending').length;

  return (
    <AdminLayout
      title="Return & Refund"
      subtitle={pendingCount > 0 ? `${pendingCount} request menunggu review` : 'Kelola pengembalian'}
    >
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((tab) => {
            const count = tab.key === 'all' ? returns.length : returns.filter(r => r.status === tab.key).length;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelectedReturn(null); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer transition-all ${
                  activeTab === tab.key
                    ? 'bg-eglux-primary text-white border-eglux-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-eglux-secondary'
                }`}
              >
                {tab.label} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Returns list */}
        {!loading && returns.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500">Tidak ada return request untuk filter ini.</p>
          </div>
        )}

        {!loading && returns.length > 0 && (
          <div className="space-y-3">
            {returns.map((r) => {
              const badge = STATUS_BADGE[r.status] || { text: r.status, cls: 'bg-gray-50 text-gray-600 border-gray-200' };
              return (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-gray-900">#{shortId(r.order_id)}</p>
                        <span className={`text-[0.65rem] px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>
                          {badge.text}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {REASON_LABELS[r.reason] || r.reason} · {RESOLUTION_LABELS[r.resolution] || r.resolution}
                      </p>
                      {r.phone && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">📞 {r.phone}</p>
                      )}
                      <p className="text-[0.7rem] text-gray-400 mt-1">
                        Diajukan: {new Date(r.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {r.refund_amount && (
                        <p className="text-xs font-semibold text-green-600 mt-1">Refund: {rupiah(r.refund_amount)}</p>
                      )}
                      {r.return_tracking_number && (
                        <p className="text-xs text-purple-600 mt-1">Resi balik: {r.return_tracking_number} ({r.return_courier || '-'})</p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedReturn(selectedReturn?.id === r.id ? null : r);
                        setRefundAmount(r.refund_amount ? String(r.refund_amount) : '');
                        setAdminNotes(r.admin_notes || '');
                        setReturnShippingCost(r.return_shipping_cost ? String(r.return_shipping_cost) : '');
                      }}
                      className="text-xs font-semibold text-eglux-secondary hover:underline cursor-pointer border-none bg-transparent flex-shrink-0"
                    >
                      {selectedReturn?.id === r.id ? 'Tutup' : 'Detail'}
                    </button>
                  </div>

                  {/* Detail panel */}
                  {selectedReturn?.id === r.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                      {r.description && (
                        <div>
                          <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Deskripsi</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{r.description}</p>
                        </div>
                      )}

                      {r.images && Array.isArray(r.images) && r.images.length > 0 && (
                        <div>
                          <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Foto Bukti</p>
                          <div className="flex gap-2">
                            {r.images.map((img, i) => (
                              <a key={i} href={img} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:opacity-80">
                                <img src={img} alt={`Bukti ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {r.video && (
                        <div>
                          <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Video Bukti</p>
                          <a href={r.video} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-2 bg-purple-50 text-purple-600 rounded-lg text-xs font-medium hover:bg-purple-100">
                            ▶️ Lihat Video
                          </a>
                        </div>
                      )}

                      {r.admin_notes && (
                        <div>
                          <p className="text-[0.65rem] text-gray-400 uppercase font-semibold mb-1">Admin Notes</p>
                          <p className="text-xs text-gray-700">{r.admin_notes}</p>
                        </div>
                      )}

                      {/* Admin actions */}
                      {r.status === 'pending' && (
                        <div className="space-y-2 pt-2 border-t border-gray-100">
                          <input
                            type="text"
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value.replace(/\D/g, ''))}
                            placeholder="Refund amount (Rp)"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                          />
                          <input
                            type="text"
                            value={returnShippingCost}
                            onChange={(e) => setReturnShippingCost(e.target.value.replace(/\D/g, ''))}
                            placeholder="Return shipping cost (Rp, opsional)"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                          />
                          <textarea
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            placeholder="Admin notes (wajib kalau reject)..."
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(r.id)}
                              disabled={processing === r.id}
                              className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none"
                            >
                              {processing === r.id ? '⏳' : '✅ Setujui'}
                            </button>
                            <button
                              onClick={() => handleReject(r.id)}
                              disabled={processing === r.id}
                              className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50 cursor-pointer border-none"
                            >
                              {processing === r.id ? '⏳' : '❌ Tolak'}
                            </button>
                          </div>
                        </div>
                      )}

                      {r.status === 'shipping_back' && (
                        <div className="pt-2 border-t border-gray-100">
                          <button
                            onClick={() => handleComplete(r.id, r.order_id)}
                            disabled={processing === r.id}
                            className="w-full py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50 cursor-pointer border-none"
                          >
                            {processing === r.id ? '⏳ Memproses...' : '📦 Konfirmasi Diterima & Selesaikan'}
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
