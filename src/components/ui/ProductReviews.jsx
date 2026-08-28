// src/components/ui/ProductReviews.jsx
// ============================================================================
// ProductReviews — Display reviews + rating summary on product detail page
// ============================================================================
//
// Cara pakai:
//   import ProductReviews from '../components/ui/ProductReviews';
//
//   <ProductReviews productId={product.id} />
//
// Features:
//   - Average rating + total count
//   - Rating distribution bar (5★: 45, 4★: 12, ...)
//   - List reviews (paginated, 5 per page)
//   - Show verified badge, admin reply
//   - Empty state kalau belum ada review
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

const StarDisplay = ({ value, size = 'text-sm' }) => {
  return (
    <span className={`${size} text-amber-400`} aria-label={`${value} bintang`}>
      {'★'.repeat(Math.floor(value))}
      <span className="text-gray-300">{'★'.repeat(5 - Math.floor(value))}</span>
    </span>
  );
};

const ReviewItem = ({ review }) => {
  const [showFullComment, setShowFullComment] = useState(false);
  const comment = review.comment || '';
  const isLong = comment.length > 300;
  const displayComment = showFullComment ? comment : comment.slice(0, 300);

  // Get user initial
  const userEmail = review.user?.email || '';
  const userName = review.user?.full_name || userEmail.split('@')[0] || 'Customer';
  const initial = userName.charAt(0).toUpperCase();

  return (
    <div className="border-b border-gray-100 py-4 last:border-0">
      {/* Header: avatar + name + verified + rating + date */}
      <div className="flex items-start gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-eglux-secondary/10 text-eglux-secondary flex items-center justify-center font-bold text-xs flex-shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{userName}</span>
            {review.is_verified && (
              <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[0.6rem] font-bold">
                ✓ Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarDisplay value={review.rating} />
            <span className="text-[0.65rem] text-gray-400">
              {new Date(review.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Title */}
      {review.title && (
        <p className="text-sm font-semibold text-gray-800 mb-1 ml-11">{review.title}</p>
      )}

      {/* Comment */}
      {comment && (
        <p className="text-sm text-gray-600 ml-11 whitespace-pre-wrap">
          {displayComment}
          {isLong && (
            <button
              onClick={() => setShowFullComment(!showFullComment)}
              className="ml-1 text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none text-xs"
            >
              {showFullComment ? 'Sembunyikan' : 'Baca selengkapnya'}
            </button>
          )}
        </p>
      )}

      {/* Admin reply */}
      {review.admin_reply && (
        <div className="ml-11 mt-2 bg-eglux-accent/30 border-l-2 border-eglux-secondary p-2.5 rounded-r-lg">
          <p className="text-[0.65rem] font-bold text-eglux-primary uppercase mb-0.5">💬 Balasan dari EGLUX</p>
          <p className="text-xs text-gray-700">{review.admin_reply}</p>
        </div>
      )}
    </div>
  );
};

const ProductReviews = ({ productId }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [distribution, setDistribution] = useState({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });
  const PAGE_SIZE = 5;

  const fetchReviews = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError('');
    try {
      const offset = (pageNum - 1) * PAGE_SIZE;

      // Fetch reviews (public, published only)
      const { data, error: fetchErr, count } = await supabase
        .from('product_reviews')
        .select(`
          id, rating, title, comment, images, is_verified, admin_reply, created_at,
          user:profiles!user_id(full_name, email)
        `, { count: 'exact' })
        .eq('product_id', productId)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fetchErr) throw fetchErr;

      setReviews(data || []);
      setTotal(count || 0);

      // Fetch all ratings for distribution + avg (separate query, head=false to get all)
      if (pageNum === 1) {
        const { data: allRatings } = await supabase
          .from('product_reviews')
          .select('rating')
          .eq('product_id', productId)
          .eq('is_published', true);

        const ratings = (allRatings || []).map(r => r.rating);
        const sum = ratings.reduce((s, r) => s + r, 0);
        setAvgRating(ratings.length > 0 ? Math.round((sum / ratings.length) * 10) / 10 : 0);

        setDistribution({
          5: ratings.filter(r => r === 5).length,
          4: ratings.filter(r => r === 4).length,
          3: ratings.filter(r => r === 3).length,
          2: ratings.filter(r => r === 2).length,
          1: ratings.filter(r => r === 1).length,
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchReviews(1);
  }, [fetchReviews]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading && page === 1) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">⭐ Ulasan Produk</h3>
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">⭐ Ulasan Produk</h3>
        <p className="text-xs text-red-500">Gagal memuat review: {error}</p>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">⭐ Ulasan Produk</h3>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">📝</div>
          <p className="text-sm font-semibold text-gray-700 mb-1">Belum ada review</p>
          <p className="text-xs text-gray-400">Jadi yang pertama review produk ini setelah membeli!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-bold text-gray-700 mb-4">⭐ Ulasan Produk ({total})</h3>

      {/* Rating Summary */}
      <div className="flex flex-col md:flex-row gap-6 mb-5 pb-5 border-b border-gray-100">
        {/* Average rating */}
        <div className="text-center md:text-left flex-shrink-0">
          <p className="text-4xl font-bold text-gray-900">{avgRating.toFixed(1)}</p>
          <StarDisplay value={Math.round(avgRating)} size="text-lg" />
          <p className="text-xs text-gray-400 mt-1">{total} ulasan</p>
        </div>

        {/* Distribution */}
        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distribution[star] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-xs">
                <span className="w-3 text-gray-500">{star}</span>
                <span className="text-amber-400">★</span>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
                <span className="w-8 text-right text-gray-500">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews list */}
      <div>
        {reviews.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 pt-4 border-t border-gray-100">
          <button
            onClick={() => { setPage(page - 1); fetchReviews(page - 1); }}
            disabled={page === 1 || loading}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 cursor-pointer bg-white"
          >
            ← Sebelumnya
          </button>
          <span className="text-xs text-gray-500">
            Hal {page} dari {totalPages}
          </span>
          <button
            onClick={() => { setPage(page + 1); fetchReviews(page + 1); }}
            disabled={page === totalPages || loading}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 cursor-pointer bg-white"
          >
            Berikutnya →
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductReviews;
