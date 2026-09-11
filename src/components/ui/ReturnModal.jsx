// src/components/ui/ReturnModal.jsx
// ============================================================================
// ReturnModal v2 — Customer ajukan pengembalian
// ============================================================================
// v2 changes:
//   - 3 reasons only: damaged, missing_item, wrong_item
//   - 2 resolutions only: refund, refund_return
//   - Phone field (auto-fill from customer data, editable)
//   - Photo upload (max 5, max 5MB each)
//   - Video upload (1 video, max 20MB)
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { rupiah } from '../../context/CartContext';

const MAX_IMAGES = 5;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DESC = 500;

const REASON_OPTIONS = [
  { value: 'damaged', label: 'Produk Rusak / Cacat' },
  { value: 'missing_item', label: 'Barang Kurang / Tidak Lengkap' },
  { value: 'wrong_item', label: 'Salah Kirim Barang' },
];

const RESOLUTION_OPTIONS = [
  { value: 'refund', label: 'Refund', desc: 'Pengembalian dana berdasarkan kondisi barang' },
  { value: 'refund_return', label: 'Refund + Return', desc: 'Kirim balik barang, dana dikembalikan' },
];

const ReturnModal = ({ isOpen, onClose, orderId, orderTotal, onSuccess }) => {
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // ⭐ Auto-fill phone from customer profile
  useEffect(() => {
    if (isOpen) {
      setReason(''); setResolution(''); setDescription('');
      setImages([]); setVideo(null);
      setError(''); setSuccess(false); setSubmitting(false);

      // Fetch customer phone
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase
          .from('customers')
          .select('phone')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.phone) setPhone(data.phone);
          });
      });
    }
  }, [isOpen]);

  // ── Photo upload ──
  const handleImageUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) { setError(`Maksimal ${MAX_IMAGES} foto`); return; }

    const validFiles = files.filter(f => f.type.startsWith('image/') && f.size <= MAX_PHOTO_SIZE);
    if (validFiles.length === 0) {
      setError('Foto harus format gambar (JPG/PNG) maks 5MB per foto');
      setTimeout(() => setError(''), 5000);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImages(true); setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) { setError('Sesi login habis'); return; }

      const uploaded = [];
      for (const file of validFiles.slice(0, remainingSlots)) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const filePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('return-images').upload(filePath, file, { cacheControl: '3600', contentType: file.type });
        if (uploadErr) continue;
        const { data: urlData } = supabase.storage.from('return-images').getPublicUrl(filePath);
        if (urlData?.publicUrl) uploaded.push(urlData.publicUrl);
      }
      if (uploaded.length > 0) setImages(prev => [...prev, ...uploaded].slice(0, MAX_IMAGES));
    } catch (e) { setError('Gagal upload foto: ' + e.message); }
    finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [images]);

  // ── Video upload ──
  const handleVideoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('File harus format video (MP4/MOV/WebM)');
      setTimeout(() => setError(''), 5000);
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setError('Video maksimal 20MB');
      setTimeout(() => setError(''), 5000);
      if (videoInputRef.current) videoInputRef.current.value = '';
      return;
    }

    setUploadingVideo(true); setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      if (!userId) { setError('Sesi login habis'); return; }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
      const filePath = `${userId}/${Date.now()}_video.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('return-images').upload(filePath, file, { cacheControl: '3600', contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage.from('return-images').getPublicUrl(filePath);
      if (urlData?.publicUrl) setVideo(urlData.publicUrl);
    } catch (e) { setError('Gagal upload video: ' + e.message); }
    finally {
      setUploadingVideo(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  }, []);

  const handleRemoveImage = useCallback((url) => setImages(prev => prev.filter(u => u !== url)), []);
  const handleRemoveVideo = useCallback(() => setVideo(null), []);

  const handleSubmit = useCallback(async () => {
    setError('');
    if (!reason) { setError('Pilih alasan pengembalian'); return; }
    if (!resolution) { setError('Pilih solusi yang diinginkan'); return; }
    if (!phone) { setError('Nomor telepon wajib diisi'); return; }

    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { setError('Sesi berakhir. Login ulang.'); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId, reason, resolution,
          description: description.trim() || undefined,
          phone: phone.trim(),
          images: images.length > 0 ? images : undefined,
          video: video || undefined,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error || 'Gagal mengajukan pengembalian');

      setSuccess(true);
      if (onSuccess) onSuccess(result.return_request);
      setTimeout(() => { handleClose(); }, 2500);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }, [reason, resolution, description, phone, images, video, orderId, onSuccess]);

  const handleClose = () => {
    setReason(''); setResolution(''); setDescription(''); setPhone('');
    setImages([]); setVideo(null);
    setError(''); setSuccess(false); setSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="bg-white rounded-2xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-eglux-primary">
            {success ? '✅ Pengembalian Diajukan' : '↩️ Ajukan Pengembalian'}
          </h2>
          <button onClick={handleClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none" aria-label="Tutup">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">Request pengembalian berhasil diajukan!</p>
              <p className="text-xs text-gray-500">Tim admin akan review dalam 1-2 hari kerja. Anda akan dihubungi via WhatsApp/nomor telepon yang Anda berikan.</p>
            </div>
          ) : (
            <>
              {/* Order info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[0.65rem] text-gray-400 uppercase">Order</p>
                <p className="text-sm font-semibold text-gray-900">#{orderId?.slice(0, 8).toUpperCase()}</p>
                {orderTotal && <p className="text-xs text-gray-500 mt-0.5">Total: {rupiah(orderTotal)}</p>}
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Alasan <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 gap-2">
                  {REASON_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setReason(opt.value)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-sm cursor-pointer transition-all text-left ${reason === opt.value ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <span className="text-lg">{opt.icon}</span>
                      <span className="font-medium text-gray-900">{opt.label}</span>
                      {reason === opt.value && <svg className="w-4 h-4 text-eglux-secondary ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Solusi <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 gap-2">
                  {RESOLUTION_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setResolution(opt.value)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-sm cursor-pointer transition-all text-left ${resolution === opt.value ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                      <span className="text-lg">{opt.icon}</span>
                      <div>
                        <p className="font-medium text-gray-900">{opt.label}</p>
                        <p className="text-[0.7rem] text-gray-500">{opt.desc}</p>
                      </div>
                      {resolution === opt.value && <svg className="w-4 h-4 text-eglux-secondary ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Nomor Telepon / WhatsApp <span className="text-red-500">*</span></label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="081234567890" className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary" />
                <p className="text-[0.65rem] text-gray-400 mt-1">Admin akan menghubungi Anda via nomor ini</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Deskripsi Masalah <span className="text-gray-400">(opsional)</span></label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Jelaskan masalah yang Anda alami..." rows={3} maxLength={MAX_DESC} className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                <p className="text-[0.65rem] text-gray-400 mt-1">{description.length}/{MAX_DESC}</p>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Foto Bukti <span className="text-gray-400">(opsional, maks {MAX_IMAGES} foto)</span></label>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploadingImages || images.length >= MAX_IMAGES} className="hidden" id="return-photo-upload" />
                <label htmlFor="return-photo-upload" className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingImages || images.length >= MAX_IMAGES ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-eglux-secondary hover:text-eglux-secondary'}`}>
                  {uploadingImages ? (<><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Mengupload...</>) : images.length >= MAX_IMAGES ? (<>Maksimal {MAX_IMAGES} foto</>) : (<>📷 Tambah Foto ({images.length}/{MAX_IMAGES})</>)}
                </label>
                <p className="text-[0.65rem] text-gray-400 mt-1">Maks 5MB per foto, format JPG/PNG/WebP</p>
                {images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {images.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                        <img src={url} alt={`Bukti ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        <button type="button" onClick={() => handleRemoveImage(url)} className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white rounded-bl-lg rounded-tr-lg flex items-center justify-center text-xs cursor-pointer border-none hover:bg-black/80">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Video upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Video Bukti <span className="text-gray-400">(opsional, 1 video)</span></label>
                <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo || !!video} className="hidden" id="return-video-upload" />
                <label htmlFor="return-video-upload" className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingVideo || video ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-eglux-secondary hover:text-eglux-secondary'}`}>
                  {uploadingVideo ? (<><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Mengupload video...</>) : video ? (<>✅ Video terunggah</>) : (<>🎥 Tambah Video</>)}
                </label>
                <p className="text-[0.65rem] text-gray-400 mt-1">Maks 20MB, format MP4/MOV/WebM</p>
                {video && (
                  <button type="button" onClick={handleRemoveVideo} className="mt-2 text-xs text-red-500 hover:underline cursor-pointer border-none bg-transparent">Hapus video</button>
                )}
              </div>

              {/* Info notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <p className="text-xs text-blue-700">ℹ️ <strong>Cara kerja:</strong> Setelah diajukan, admin akan review dalam 1-2 hari kerja. Jika disetujui, Anda akan menerima instruksi via WhatsApp.</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
            <button onClick={handleClose} disabled={submitting} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none">Batal</button>
            <button onClick={handleSubmit} disabled={submitting || !reason || !resolution || !phone} className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 cursor-pointer border-none flex items-center justify-center gap-2">
              {submitting ? (<><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Mengirim...</>) : 'Ajukan Pengembalian'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReturnModal;