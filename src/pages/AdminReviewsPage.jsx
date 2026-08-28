// src/pages/AdminReviewsPage.jsx
// ============================================================================
// AdminReviewsPage — Moderasi product reviews
// ============================================================================
// Fitur:
//   - Stats summary (total, published, avg rating, distribution)
//   - Filter (rating, published status, search by product)
//   - List reviews dengan pagination
//   - Actions: publish, unpublish, reply, delete
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import EmptyState from '../components/ui/EmptyState';

const rupiah = (n) => (Number(n) || 0).toLocaleString('id-ID');

const AdminReviewsPage = () => {
  const { user } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [filterRating, setFilterRating] = useState('');
  const [filterPublished, setFilterPublished] = useState('');
  const [searchProduct, setSearchProduct] = useState('');

  // Reply modal state
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Token cache
  const tokenRef = useRef(null);
  const getToken = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    const { data: session } = await supabase.auth.getSession();
    tokenRef.current = session?.session?.access_token;
    return tokenRef.current;
  }, []);

  const callApi = useCallback(async (payload) => {
    const token = await getToken();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-review`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }, [getToken]);

  const fetchReviews = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const filter = {};
      if (filterRating) filter.rating = parseInt(filterRating);
      if (filterPublished !== '') filter.is_published = filterPublished === 'true';

      const result = await callApi({
        action: 'list',
        page: pageNum,
        limit: 20,
        filter,
      });

      if (result.success) {
        // Filter by product name client-side (search)
        let filtered = result.reviews || [];
        if (searchProduct.trim()) {
          const q = searchProduct.trim().toLowerCase();
          filtered = filtered.filter(r =>
            (r.product?.name || '').toLowerCase().includes(q) ||
            (r.product?.slug || '').toLowerCase().includes(q)
          );
        }
        setReviews(filtered);
        setTotal(result.total);
        setTotalPages(result.total_pages);
        setPage(result.page);
      } else {
        setError(result.error || 'Gagal memuat reviews');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [callApi, filterRating, filterPublished, searchProduct]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await callApi({ action: 'stats' });
      if (result.success) {
        setStats(result.stats);
      }
    } catch (e) {
      console.warn('[AdminReviews] stats error:', e?.message);
    }
  }, [callApi]);

  useEffect(() => {
    fetchReviews(1);
    fetchStats();
  }, [fetchReviews, fetchStats]);

  // ── Actions ──
  const handlePublish = async (reviewId, publish) => {
    setActionLoading(true);
    try {
      const result = await callApi({
        action: publish ? 'publish' : 'unpublish',
        review_id: reviewId,
      });
      if (result.success) {
        // Update local state
        setReviews(prev => prev.map(r =>
          r.id === reviewId ? { ...r, is_published: publish } : r
        ));
        fetchStats();
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setActionLoading(false); }
  };

  const handleDelete = async (reviewId) => {
    if (!confirm('Hapus review permanen? Tindakan ini tidak bisa dibatalkan.')) return;
    setActionLoading(true);
    try {
      const result = await callApi({ action: 'delete', review_id: reviewId });
      if (result.success) {
        setReviews(prev => prev.filter(r => r.id !== reviewId));
        fetchStats();
        alert('✅ Review dihapus');
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setActionLoading(false); }
  };

  const handleReplySubmit = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setActionLoading(true);
    try {
      const result = await callApi({
        action: 'reply',
        review_id: replyingTo.id,
        reply: replyText.trim(),
      });
      if (result.success) {
        setReviews(prev => prev.map(r =>
          r.id === replyingTo.id ? { ...r, admin_reply: replyText.trim() } : r
        ));
        setReplyingTo(null);
        setReplyText('');
        alert('✅ Reply tersimpan');
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setActionLoading(false); }
  };

  const StarDisplay = ({ value }) => (
    <span className="text-amber-400 text-xs">{'★'.repeat(value)}<span className="text-gray-300">{'★'.repeat(5 - value)}</span></span>
  );

  return (
    <AdminLayout title="Reviews Management" subtitle="Moderasi ulasan produk customer">
      <div className="space-y-4">
        {/* === Stats Summary === */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">Total Reviews</p>
              <p className="text-xl font-bold text-eglux-primary">{stats.total_reviews}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">Published</p>
              <p className="text-xl font-bold text-green-700">{stats.published_reviews}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">Unpublished</p>
              <p className="text-xl font-bold text-amber-700">{stats.unpublished_reviews}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">Avg Rating</p>
              <p className="text-xl font-bold text-purple-700">{stats.average_rating?.toFixed(1) || '0.0'} ★</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-gray-400 mb-1">5★ Reviews</p>
              <p className="text-xl font-bold text-blue-700">{stats.distribution?.[5] || 0}</p>
            </div>
          </div>
        )}

        {/* === Filters === */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={searchProduct}
              onChange={(e) => setSearchProduct(e.target.value)}
              placeholder="Cari nama produk..."
              className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
            />
            <select
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer bg-white"
            >
              <option value="">Semua Rating</option>
              <option value="5">5 ★</option>
              <option value="4">4 ★</option>
              <option value="3">3 ★</option>
              <option value="2">2 ★</option>
              <option value="1">1 ★</option>
            </select>
            <select
              value={filterPublished}
              onChange={(e) => setFilterPublished(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer bg-white"
            >
              <option value="">Semua Status</option>
              <option value="true">Published</option>
              <option value="false">Unpublished</option>
            </select>
            <button
              onClick={() => fetchReviews(1)}
              className="px-4 py-2 bg-eglux-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 cursor-pointer border-none"
            >
              🔍 Filter
            </button>
          </div>
        </div>

        {/* === Error === */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
            ⚠️ {error}
            <button onClick={() => fetchReviews(1)} className="ml-2 underline cursor-pointer">Coba lagi</button>
          </div>
        )}

        {/* === Reviews List === */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-gray-700">📋 Daftar Review ({total})</h3>
            <span className="text-xs text-gray-400">Hal {page} dari {totalPages}</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reviews.length === 0 ? (
            <EmptyState
              icon="📝"
              title="Belum ada review"
              description="Review customer akan muncul di sini setelah ada yang submit."
              size="md"
            />
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => (
                <div key={review.id} className={`border rounded-lg p-4 ${review.is_published ? 'border-gray-200' : 'border-amber-200 bg-amber-50/30'}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-eglux-secondary/10 text-eglux-secondary flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {(review.user?.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {review.user?.full_name || review.user?.email?.split('@')[0] || 'Customer'}
                          </span>
                          {review.is_verified && (
                            <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[0.6rem] font-bold">✓ Verified</span>
                          )}
                          <StarDisplay value={review.rating} />
                          {!review.is_published && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[0.6rem] font-bold">Hidden</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {review.product?.name || 'Unknown product'} · {new Date(review.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  {review.title && (
                    <p className="text-sm font-semibold text-gray-800 mb-1">{review.title}</p>
                  )}
                  {review.comment && (
                    <p className="text-sm text-gray-600 mb-2 whitespace-pre-wrap">{review.comment}</p>
                  )}

                  {/* Admin reply (existing) */}
                  {review.admin_reply && (
                    <div className="bg-eglux-accent/30 border-l-2 border-eglux-secondary p-2 rounded-r-lg mb-2">
                      <p className="text-[0.65rem] font-bold text-eglux-primary uppercase mb-0.5">💬 Balasan EGLUX</p>
                      <p className="text-xs text-gray-700">{review.admin_reply}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    {review.is_published ? (
                      <button
                        onClick={() => handlePublish(review.id, false)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                      >
                        👁️‍🗨️ Sembunyikan
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePublish(review.id, true)}
                        disabled={actionLoading}
                        className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 cursor-pointer"
                      >
                        ✓ Publish
                      </button>
                    )}
                    <button
                      onClick={() => { setReplyingTo(review); setReplyText(review.admin_reply || ''); }}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
                    >
                      💬 {review.admin_reply ? 'Edit Reply' : 'Reply'}
                    </button>
                    <button
                      onClick={() => handleDelete(review.id)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50 cursor-pointer ml-auto"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => fetchReviews(page - 1)}
                disabled={page === 1 || loading}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 cursor-pointer bg-white"
              >
                ← Sebelumnya
              </button>
              <span className="text-xs text-gray-500">Hal {page} dari {totalPages}</span>
              <button
                onClick={() => fetchReviews(page + 1)}
                disabled={page === totalPages || loading}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 cursor-pointer bg-white"
              >
                Berikutnya →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* === Reply Modal === */}
      {replyingTo && (
        <div
          className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setReplyingTo(null)}
        >
          <div className="bg-white rounded-2xl max-w-[500px] w-full shadow-2xl">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-eglux-primary">💬 Balas Review</h2>
              <button
                onClick={() => setReplyingTo(null)}
                className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
              >✕</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {/* Review context */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <StarDisplay value={replyingTo.rating} />
                  <span className="text-xs text-gray-500">{replyingTo.user?.email}</span>
                </div>
                {replyingTo.title && <p className="text-sm font-semibold text-gray-800">{replyingTo.title}</p>}
                {replyingTo.comment && <p className="text-xs text-gray-600 mt-1">{replyingTo.comment}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Balasan Anda</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Tulis balasan untuk review ini..."
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y"
                />
                <p className="text-[0.65rem] text-gray-400 mt-1">{replyText.length}/500</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setReplyingTo(null)}
                disabled={actionLoading}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none"
              >
                Batal
              </button>
              <button
                onClick={handleReplySubmit}
                disabled={actionLoading || !replyText.trim()}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
              >
                {actionLoading ? '⏳ Menyimpan...' : '💾 Simpan Reply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminReviewsPage;
