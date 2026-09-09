// src/components/ui/ReviewModal.jsx
// ============================================================================
// ReviewModal — Customer submit / edit review untuk produk yang sudah dibeli
// ============================================================================
//
// Cara pakai (INSERT baru):
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
//
// Cara pakai (EDIT existing review):
//   <ReviewModal
//     isOpen={showEditModal}
//     onClose={() => setShowEditModal(false)}
//     productId={product.id}
//     productName={product.name}
//     orderId={order.id}
//     reviewId={existingReview.id}        // ⭐ ID review yang mau di-edit
//     initialRating={existingReview.rating}
//     initialTitle={existingReview.title}
//     initialComment={existingReview.comment}
//     initialImages={existingReview.images}
//     onSuccess={() => { /* refresh */ }}
//   />
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
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

const ReviewModal = ({
  isOpen,
  onClose,
  productId,
  productName,
  orderId,
  // ⭐ NEW: Edit mode props (optional)
  reviewId,              // kalau provided → edit mode
  initialRating = 0,
  initialTitle = '',
  initialComment = '',
  initialImages = [],
  onSuccess,
}) => {
  const { user } = useAuth();
  const isEditMode = Boolean(reviewId);

  const [rating, setRating] = useState(initialRating);
  const [title, setTitle] = useState(initialTitle);
  const [comment, setComment] = useState(initialComment);
  const [images, setImages] = useState(initialImages);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // ⭐ NEW: photo upload state
  const [uploadingImages, setUploadingImages] = useState(false);
  const fileInputRef = useRef(null);

  // ⭐ Sync state saat props change (kalau modal di-reuse untuk edit review berbeda)
  useEffect(() => {
    if (isOpen) {
      setRating(initialRating);
      setTitle(initialTitle);
      setComment(initialComment);
      setImages(initialImages);
      setError('');
      setSuccess(false);
      setSubmitting(false);
    }
  }, [isOpen, reviewId, initialRating, initialTitle, initialComment, initialImages]);

  // ⭐ NEW: Handle file selection + upload to Supabase Storage
  const handleImageUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate: max 5 images total (existing + new)
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      setError(`Maksimal ${MAX_IMAGES} gambar per review`);
      return;
    }
    const filesToUpload = files.slice(0, remainingSlots);

    // Validate: each file must be image + max 5MB
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const validFiles = [];
    const invalidFiles = [];
    for (const f of filesToUpload) {
      if (!f.type.startsWith('image/')) {
        invalidFiles.push(`${f.name}: bukan gambar`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        invalidFiles.push(`${f.name}: lebih dari 5MB`);
        continue;
      }
      validFiles.push(f);
    }

    if (invalidFiles.length > 0) {
      setError(`File ditolak: ${invalidFiles.join(', ')}`);
      // Clear error after 5s
      setTimeout(() => setError(''), 5000);
    }

    if (validFiles.length === 0) {
      // Reset input supaya user bisa select file yang sama lagi setelah fix
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImages(true);
    setError('');

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) {
        setError('Sesi login habis. Silakan login ulang untuk upload gambar.');
        setUploadingImages(false);
        return;
      }

      const uploadedUrls = [];
      for (const file of validFiles) {
        // Path pattern: {user_id}/{timestamp}_{random}.ext
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = `${userId}/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from('review-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type,
          });

        if (uploadErr) {
          console.warn('[ReviewModal] Upload error for', file.name, ':', uploadErr.message);
          // Skip this file, continue with others
          continue;
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('review-images')
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          uploadedUrls.push(publicUrlData.publicUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        setImages((prev) => [...prev, ...uploadedUrls].slice(0, MAX_IMAGES));
      }
      if (uploadedUrls.length < validFiles.length) {
        setError(`${validFiles.length - uploadedUrls.length} gambar gagal diupload. Coba lagi.`);
      }
    } catch (e) {
      console.error('[ReviewModal] Upload exception:', e);
      setError('Gagal upload gambar: ' + e.message);
    } finally {
      setUploadingImages(false);
      // Reset input supaya user bisa re-select same file
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [images]);

  // ⭐ NEW: Remove image dari list (kalau user klik X di thumbnail)
  const handleRemoveImage = useCallback((urlToRemove) => {
    setImages((prev) => prev.filter((url) => url !== urlToRemove));
    // Note: kita gak delete dari Storage supaya simple (kalau user gak submit review,
    // image orphaned di storage — acceptable trade-off untuk simplicity)
    // Alternative: track uploaded URLs + delete on modal close kalau gak submit
  }, []);

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
          // ⭐ Include review_id kalau edit mode
          ...(isEditMode ? { review_id: reviewId } : {}),
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
      if (onSuccess) onSuccess(result.review, result.is_edit, result.points_awarded);

      // Auto close after 2s
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }, [rating, title, comment, images, productId, orderId, reviewId, isEditMode, onSuccess]);

  const handleClose = () => {
    setRating(initialRating);
    setTitle(initialTitle);
    setComment(initialComment);
    setImages(initialImages);
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
            {success
              ? (isEditMode ? '✅ Review Diperbarui' : '✅ Review Terkirim')
              : (isEditMode ? '✏️ Edit Review' : '⭐ Tulis Review')
            }
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
              <div className="text-5xl mb-3">{isEditMode ? '👍' : '🎉'}</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {isEditMode ? 'Review Anda telah diperbarui!' : 'Terima kasih atas review Anda!'}
              </p>
              <p className="text-xs text-gray-500">
                {isEditMode
                  ? 'Perubahan Anda sudah tersimpan.'
                  : '+5 poin bonus telah ditambahkan ke akun Anda. Review Anda membantu customer lain membuat keputusan belanja.'
                }
              </p>
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

              {/* Rating */}
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

              {/* ⭐ Photo upload section */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                  Foto <span className="text-gray-400">(opsional, maks {MAX_IMAGES} gambar)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  disabled={uploadingImages || images.length >= MAX_IMAGES}
                  className="hidden"
                  id="review-image-upload"
                />
                <label
                  htmlFor="review-image-upload"
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    uploadingImages || images.length >= MAX_IMAGES
                      ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                      : 'border-gray-300 text-gray-600 hover:border-eglux-secondary hover:text-eglux-secondary'
                  }`}
                >
                  {uploadingImages ? (
                    <>
                      <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                      Mengupload...
                    </>
                  ) : images.length >= MAX_IMAGES ? (
                    <>Maksimal {MAX_IMAGES} gambar</>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      Tambah Foto ({images.length}/{MAX_IMAGES})
                    </>
                  )}
                </label>

                {/* Preview uploaded images */}
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {images.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={url}
                          alt={`Review foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(url)}
                          className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white rounded-bl-lg rounded-tr-lg flex items-center justify-center text-xs cursor-pointer border-none hover:bg-black/80"
                          aria-label="Hapus foto"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[0.65rem] text-gray-400 mt-1">Maks 5MB per gambar, format JPG/PNG/WebP</p>
              </div>

              {/* Verified purchase notice */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <p className="text-xs text-green-700">
                  <strong>Verified Purchase</strong> — Review Anda akan ditandai sebagai pembelian terverifikasi.
                </p>
              </div>

              {/* Edit mode notice */}
              {isEditMode && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex items-center gap-2">
                  <span className="text-blue-600">ℹ️</span>
                  <p className="text-xs text-blue-700">
                    Anda sedang <strong>edit review</strong> yang sudah pernah dikirim.
                    Poin bonus hanya diberikan saat submit review baru (sudah Anda dapatkan sebelumnya).
                  </p>
                </div>
              )}
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
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                  Mengirim...
                </>
              ) : (
                isEditMode ? 'Update Review' : 'Kirim Review'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewModal;