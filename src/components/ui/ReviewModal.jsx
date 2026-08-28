// src/components/ui/ReviewModal.jsx
// ============================================================================
// ReviewModal — Customer submit review untuk produk yang sudah dibeli
// ============================================================================
//
// Cara pakai:
//   import ReviewModal from '../components/ui/ReviewModal';
//
//   <ReviewModal
//     isOpen={showReviewModal}
//     onClose={() => setShowReviewModal(false)}
//     productId={product.id}
//     productName={product.name}
//     orderId={order.id}
//     onSuccess={() => { /* refresh order list, etc */ }}
//   />
// ============================================================================

import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const MAX_IMAGES = 5;
const MAX_COMMENT = 1000;
const MAX_TITLE = 200;

const StarRating = ({ value, onChange, size = 'text-3xl' }) => {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          className={`${size} cursor-pointer border-none bg-transparent p-0 transition-transform hover:scale-110 ${
            (hover || value) >= star ? 'text-amber-400' : 'text-gray-300'
          }`}
          aria-label={`${star} bintang`}
        >
          ★
        </button>
      ))}
    </div>
  );
};

const ReviewModal = ({ isOpen, onClose, productId, productName, orderId, onSuccess }) => {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(async () => {
    setError('');

    if (rating === 0) {
      setError('Silakan pilih rating (1-5 bintang)');
      return;
    }
    if (comment && comment.length > MAX_COMMENT) {
      setError(`Komentar maksimal ${MAX_COMMENT} karakter`);
      return;
    }
    if (title && title.length > MAX_TITLE) {
      setError(`Title maksimal ${MAX_TITLE} karakter`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setError('Sesi berakhir. Silakan login ulang.');
        return;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-review`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          order_id: orderId,
          rating,
          title: title.trim() || undefined,
          comment: comment.trim() || undefined,
          images: images.length > 0 ? images : undefined,
        }),
      });

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || 'Gagal mengirim review');
      }

      setSuccess(true);
      if (onSuccess) onSuccess(result.review);

      // Auto close after 2s
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [rating, title, comment, images, productId, orderId, onSuccess]);

  const handleClose = () => {
    setRating(0);
    setTitle('');
    setComment('');
    setImages([]);
    setError('');
    setSuccess(false);
    setSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white rounded-2xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-eglux-primary">
            {success ? '✅ Review Terkirim' : '⭐ Tulis Review'}
          </h2>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
            aria-label="Tutup"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Terima kasih atas review Anda!</p>
              <p className="text-xs text-gray-500">Review Anda membantu customer lain membuat keputusan belanja.</p>
            </div>
          ) : (
            <>
              {/* Product name */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[0.65rem] text-gray-400 uppercase">Produk</p>
                <p className="text-sm font-semibold text-gray-900 truncate">{productName || 'Produk'}</p>
              </div>

              {/* Error message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                  ⚠️ {error}
                </div>
              )}

              {/* Star rating */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">
                  Rating <span className="text-red-500">*</span>
                </label>
                <StarRating value={rating} onChange={setRating} />
                <p className="text-[0.65rem] text-gray-400 mt-1">
                  {rating === 0 && 'Klik bintang untuk memberi rating'}
                  {rating === 1 && '😢 Sangat kecewa'}
                  {rating === 2 && '😕 Kurang puas'}
                  {rating === 3 && '😊 Cukup baik'}
                  {rating === 4 && '😍 Memuaskan'}
                  {rating === 5 && '🤩 Sangat memuaskan!'}
                </p>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                  Judul Review <span className="text-gray-400">(opsional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Kualitas bagus, sesuai gambar"
                  maxLength={MAX_TITLE}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                />
                <p className="text-[0.65rem] text-gray-400 mt-1">{title.length}/{MAX_TITLE}</p>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                  Komentar <span className="text-gray-400">(opsional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Bagikan pengalaman Anda menggunakan produk ini. Apa yang Anda suka/tidak suka?"
                  rows={4}
                  maxLength={MAX_COMMENT}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y"
                />
                <p className="text-[0.65rem] text-gray-400 mt-1">{comment.length}/{MAX_COMMENT}</p>
              </div>

              {/* Verified purchase notice */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <p className="text-xs text-green-700">
                  <strong>Verified Purchase</strong> — Review Anda akan ditandai sebagai pembelian terverifikasi.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={handleClose}
              disabled={submitting}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none"
            >
              Batal
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || rating === 0}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Mengirim...
                </>
              ) : 'Kirim Review'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewModal;
