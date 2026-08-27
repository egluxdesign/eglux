// src/pages/AdminPointsPage.jsx
// ============================================================================
// AdminPointsPage — Admin panel untuk manage marketplace claims + manual adjust
// ============================================================================
// 2 Tabs:
//   1. Marketplace Claims — list pending claims, approve/reject + input points
//   2. Points Management — search user, view balance + history, manual adjust
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const MARKETPLACES = {
  shopee: 'Shopee', tokopedia: 'Tokopedia', tiktok_shop: 'TikTok Shop',
  bukalapak: 'Bukalapak', lazada: 'Lazada', blibli: 'Blibli', other: 'Lainnya',
};

const STATUS_BADGE = {
  pending: { text: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { text: 'Approved', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { text: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200' },
};

function shortId(uuid) {
  return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase();
}

const AdminPointsPage = () => {
  const { user: adminUser } = useAuth();
  const [activeTab, setActiveTab] = useState('claims');
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Search state (tab 2)
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Fetch pending claims
  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('marketplace_claims')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      setClaims(data || []);
    } catch (e) {
      console.warn('[AdminPoints] fetch claims error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  // Approve claim
  const handleApprove = async (claim) => {
    const amountStr = prompt(`Masukkan total pembelian dari ${MARKETPLACES[claim.marketplace] || claim.marketplace} (Rp):`);
    if (!amountStr) return;
    const orderAmount = parseInt(amountStr.replace(/\D/g, ''), 10);
    if (!orderAmount || orderAmount <= 0) { alert('Nominal tidak valid'); return; }
    const points = Math.floor(orderAmount / 1000);

    if (!confirm(`Setujui klaim ${claim.name}?\nTotal: Rp ${orderAmount.toLocaleString('id-ID')}\nPoin: +${points}\nExpire: 1 tahun`)) return;

    setProcessingId(claim.id);
    try {
      // 1. Update claim status
      const { error: updateErr } = await supabase
        .from('marketplace_claims')
        .update({
          status: 'approved',
          order_amount: orderAmount,
          points_awarded: points,
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', claim.id);
      if (updateErr) throw updateErr;

      // 2. Add points via RPC
      const { error: rpcErr } = await supabase.rpc('add_points', {
        p_user_id: claim.user_id,
        p_amount: points,
        p_source: 'marketplace_claim',
        p_description: `Klaim marketplace ${MARKETPLACES[claim.marketplace] || claim.marketplace} - Order ${claim.order_id}`,
        p_marketplace_claim_id: claim.id,
        p_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (rpcErr) throw rpcErr;

      alert(`✅ Berhasil! +${points} poin ditambahkan ke ${claim.name}`);
      fetchClaims();
    } catch (e) {
      alert('Gagal approve: ' + e.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Reject claim
  const handleReject = async (claim) => {
    const reason = prompt('Alasan penolakan:');
    if (!reason) return;

    setProcessingId(claim.id);
    try {
      const { error } = await supabase
        .from('marketplace_claims')
        .update({
          status: 'rejected',
          admin_notes: reason,
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', claim.id);
      if (error) throw error;
      fetchClaims();
    } catch (e) {
      alert('Gagal reject: ' + e.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Search user (tab 2)
  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      // ⭐ FIX: pakai edge function (service_role) supaya bypass RLS
      // Frontend supabase client pakai user JWT → RLS block read profil user lain
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { setSearchResult({ error: 'Sesi berakhir, login ulang' }); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-search-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: searchEmail.trim() }),
      });

      const result = await resp.json();

      if (!resp.ok || !result.success) {
        setSearchResult({ error: result.error || 'User tidak ditemukan' });
        return;
      }

      setSearchResult({ profile: result.profile, points: result.points, transactions: result.transactions });
    } catch (e) {
      setSearchResult({ error: e.message });
    } finally {
      setSearchLoading(false);
    }
  };

  // Manual adjust points
  const handleAdjust = async () => {
    if (!searchResult?.profile) return;
    const amount = parseInt(adjustAmount, 10);
    if (!amount || amount === 0) { alert('Masukkan jumlah poin (positif atau negatif)'); return; }
    if (!adjustReason.trim()) { alert('Alasan wajib diisi'); return; }

    // ⭐ Include admin email di description supaya ada audit trail
    const adminEmail = adminUser?.email || 'unknown admin';
    const fullDescription = `${adjustReason} (by: ${adminEmail})`;

    if (!confirm(`${amount > 0 ? 'Tambah' : 'Kurangi'} ${Math.abs(amount)} poin dari ${searchResult.profile.full_name || searchResult.profile.email}?\nAlasan: ${adjustReason}\nAdmin: ${adminEmail}`)) return;

    try {
      const { error } = await supabase.rpc('add_points', {
        p_user_id: searchResult.profile.id,
        p_amount: amount,
        p_source: 'admin_adjust',
        p_description: fullDescription,
        p_admin_user_id: adminUser.id,
        p_expires_at: amount > 0 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null,
      });
      if (error) throw error;

      alert(`✅ Berhasil adjust ${amount > 0 ? '+' : ''}${amount} poin`);
      setAdjustAmount('');
      setAdjustReason('');
      // Refresh search result
      handleSearch();
    } catch (e) {
      alert('Gagal adjust: ' + e.message);
    }
  };

  const pendingCount = claims.filter(c => c.status === 'pending').length;

  return (
    <AdminLayout title="Points Management" subtitle="Kelola klaim poin marketplace & manual adjust">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('claims')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'claims' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            📋 Marketplace Claims
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[0.65rem]">{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('adjust')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${
              activeTab === 'adjust' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            ⚙️ Manual Adjust
          </button>
        </div>

        {/* === TAB 1: MARKETPLACE CLAIMS === */}
        {activeTab === 'claims' && (
          <div>
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : claims.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-500">Belum ada klaim poin marketplace.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claims.map((claim) => {
                  const badge = STATUS_BADGE[claim.status] || STATUS_BADGE.pending;
                  const isPending = claim.status === 'pending';
                  return (
                    <div key={claim.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-eglux-primary">{claim.name}</p>
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border ${badge.cls}`}>{badge.text}</span>
                          </div>
                          <p className="text-xs text-gray-500">{claim.phone}</p>
                          <p className="text-xs text-gray-500">
                            {MARKETPLACES[claim.marketplace] || claim.marketplace} · Order: <span className="font-mono">{claim.order_id}</span>
                          </p>
                          <p className="text-[0.7rem] text-gray-400 mt-1">
                            Klaim: {new Date(claim.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {claim.status === 'approved' && (
                            <p className="text-xs text-green-600 font-medium mt-1">
                              ✅ +{claim.points_awarded} poin (Rp {claim.order_amount?.toLocaleString('id-ID')})
                            </p>
                          )}
                          {claim.status === 'rejected' && claim.admin_notes && (
                            <p className="text-xs text-red-500 mt-1">❌ {claim.admin_notes}</p>
                          )}
                        </div>
                        {isPending && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => handleApprove(claim)}
                              disabled={processingId === claim.id}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs font-semibold hover:bg-green-700 disabled:opacity-50 cursor-pointer border-none whitespace-nowrap"
                            >
                              {processingId === claim.id ? 'please wait...' : '✅ Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(claim)}
                              disabled={processingId === claim.id}
                              className="px-3 py-1.5 bg-white text-red-600 border border-red-300 rounded-md text-xs font-semibold hover:bg-red-50 disabled:opacity-50 cursor-pointer"
                            >
                              ❌ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === TAB 2: MANUAL ADJUST === */}
        {activeTab === 'adjust' && (
          <div>
            {/* Search */}
            <div className="flex gap-2 mb-6">
              <input
                type="text"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Cari user berdasarkan email..."
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="px-4 py-2 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none whitespace-nowrap"
              >
                {searchLoading ? 'please wait...' : '🔍 Cari'}
              </button>
            </div>

            {/* Search Result */}
            {searchResult?.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
                {searchResult.error}
              </div>
            )}

            {searchResult?.profile && (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                {/* User Info */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="text-sm font-bold text-eglux-primary">{searchResult.profile.full_name || 'N/A'}</p>
                  <p className="text-xs text-gray-500">{searchResult.profile.email}</p>
                  <p className="text-xs text-gray-500">{searchResult.profile.phone || 'N/A'}</p>
                  <div className="flex gap-4 mt-2">
                    <div className="bg-amber-50 rounded-lg px-3 py-1.5">
                      <p className="text-[0.65rem] text-gray-500 uppercase">Balance</p>
                      <p className="text-lg font-bold text-amber-700">{searchResult.points?.balance ?? 0}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg px-3 py-1.5">
                      <p className="text-[0.65rem] text-gray-500 uppercase">Total Earned</p>
                      <p className="text-lg font-bold text-green-700">{searchResult.points?.total_earned ?? 0}</p>
                    </div>
                    <div className="bg-red-50 rounded-lg px-3 py-1.5">
                      <p className="text-[0.65rem] text-gray-500 uppercase">Total Spent</p>
                      <p className="text-lg font-bold text-red-700">{searchResult.points?.total_spent ?? 0}</p>
                    </div>
                  </div>
                </div>

                {/* Manual Adjust Form */}
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Manual Adjust</p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="number"
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="+jumlah / -jumlah"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                    />
                    <input
                      type="text"
                      value={adjustReason}
                      onChange={(e) => setAdjustReason(e.target.value)}
                      placeholder="Alasan (Wajib)"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                    />
                    <button
                      onClick={handleAdjust}
                      className="px-4 py-2 bg-eglux-secondary text-white rounded-lg text-sm font-semibold hover:opacity-90 cursor-pointer border-none whitespace-nowrap"
                    >
                      Adjust
                    </button>
                  </div>
                </div>

                {/* Transaction History */}
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Transaction History (Last 20)</p>
                  {searchResult.transactions?.length === 0 ? (
                    <p className="text-xs text-gray-400 py-2">Belum ada transaksi.</p>
                  ) : (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {searchResult.transactions?.map((txn) => (
                        <div key={txn.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold ${txn.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {txn.amount > 0 ? '+' : ''}{txn.amount}
                              </span>
                              <span className="text-gray-400 capitalize">{txn.source.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-gray-400 text-[0.7rem] truncate">
                              {txn.description || '—'}
                            </p>
                          </div>
                          <p className="text-gray-400 text-[0.7rem] whitespace-nowrap ml-2">
                            {new Date(txn.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!searchResult && (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-gray-500 text-sm">Cari user berdasarkan email untuk lihat balance & adjust poin.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPointsPage;
