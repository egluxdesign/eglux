// src/components/ReturnModal.jsx
// ============================================================================
// ReturnModal v4 — 2 mode sesuai flow kebijakan return v3
// ============================================================================
// Mode 1: Submit awal (customer belum pernah ajukan return)
//   - Form: alasan, solusi, phone, deskripsi, foto (min 3) ATAU video
//   - Tidak ada field nominal (admin yang akan kasih nominal nanti)
//   - Backend action: INSERT baru (POST submit-return-request)
//
// Mode 2: Konfirmasi nominal (existingReturn.status = 'awaiting_customer_confirmation')
//   - Display nominal yang admin kasih (refund_amount)
//   - Form: input konfirmasi nominal (harus sama) + customer_notes
//   - Backend action: 'confirm_refund' (POST submit-return-request)
//
// Flow lengkap:
//   1. Customer submit awal → status: pending
//   2. Admin: "Proses" → status: processing → admin kontak customer via WA
//   3. Admin input nominal → status: awaiting_customer_confirmation
//   4. Customer buka modal return lagi (Mode 2) → input konfirmasi → status: customer_confirmed
//   5. Admin: "Final Approve" → status: approved → refund process
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { rupiah } from '../../context/CartContext';

const MAX_IMAGES = 5;
const MAX_DESC = 500;
const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_IMAGE_DIMENSION = 600; // Max width/height untuk compression (lebih kecil = upload lebih cepat)
const IMAGE_QUALITY = 0.65; // Quality JPEG compression (0.65 = balance size/quality, ~150-300KB per foto)
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ACCEPTED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp'];

const REASON_OPTIONS = [
  { value: 'damaged', label: 'Produk Rusak' },
  { value: 'missing_item', label: 'Barang Kurang' },
  { value: 'wrong_item', label: 'Salah Kirim Barang' },
];

const RESOLUTION_OPTIONS = [
  { value: 'refund', label: 'Refund', desc: 'Pengembalian dana berdasarkan kondisi barang' },
  { value: 'refund_return', label: 'Refund + Return', desc: 'Kirim balik barang, dana dikembalikan' },
];

const ReturnModal = ({ isOpen, onClose, orderId, orderTotal, onSuccess, existingReturn }) => {
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

  // ⭐ Mode konfirmasi nominal (saat existingReturn.status = 'awaiting_customer_confirmation')
  const [customerRefundAmount, setCustomerRefundAmount] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const fileInputRef = useRef(null);
  const videoInputRef = useRef(null);

  // ⭐ Auto-fill phone from customer profile
  useEffect(() => {
    if (isOpen) {
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return;
        const { data } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .maybeSingle();
        if (data?.phone) setPhone(data.phone);
      });
    }
  }, [isOpen]);

  // ⭐ Auto-fill existingReturn data kalau mode konfirmasi
  useEffect(() => {
    if (isOpen && existingReturn) {
      setReason(existingReturn.reason || '');
      setResolution(existingReturn.resolution || '');
      setDescription(existingReturn.description || '');
      setPhone(existingReturn.phone || '');
      setImages(existingReturn.images || []);
      setVideo(existingReturn.video || null);
    }
  }, [isOpen, existingReturn]);

  // ⭐ Image upload — compression paralel + upload paralel (cepat)
  const handleImageUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // ⭐ Filter: hanya JPEG/PNG/WebP yang di-accept
    const validFiles = files.filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type.toLowerCase()));
    if (validFiles.length === 0) {
      setError(`Format file tidak didukung. Mohon unggah file dengan format JPEG, PNG, atau WebP.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      setError(`Maksimal ${MAX_IMAGES} foto.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImages(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Sesi login habis. Silakan login ulang untuk mengunggah gambar.');
        return;
      }

      const filesToProcess = validFiles.slice(0, remainingSlots);

      // ⭐ STEP 1: Compress semua files secara PARALEL (lebih cepat daripada sequential)
      const compressedResults = await Promise.all(
        filesToProcess.map(async (file) => {
          try {
            const compressed = await compressImage(file);
            return { originalName: file.name, compressedFile: compressed.file, contentType: compressed.contentType, ext: compressed.ext };
          } catch (err) {
            console.warn('[ReturnModal] Compression failed for', file.name, ':', err.message);
            // Fallback ke file asli
            const fallbackExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
            const ext = ACCEPTED_IMAGE_EXT.includes(fallbackExt) ? fallbackExt : 'jpg';
            return { originalName: file.name, compressedFile: file, contentType: file.type || 'image/jpeg', ext };
          }
        })
      );

      // ⭐ STEP 2: Upload semua compressed files secara PARALEL
      const uploadResults = await Promise.all(
        compressedResults.map(async ({ originalName, compressedFile, contentType, ext }) => {
          const safeExt = ACCEPTED_IMAGE_EXT.includes(ext) ? ext : 'jpg';
          const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
          const { error: uploadErr } = await supabase.storage
            .from('return-images')
            .upload(filePath, compressedFile, {
              cacheControl: '3600',
              contentType,
              upsert: false,
            });
          if (uploadErr) {
            console.error('[ReturnModal] Upload FAILED for', originalName, ':', uploadErr.message, uploadErr);
            return null;
          }
          const { data: urlData } = supabase.storage.from('return-images').getPublicUrl(filePath);
          return urlData?.publicUrl || null;
        })
      );

      const uploadedUrls = uploadResults.filter(url => url !== null);

      if (uploadedUrls.length > 0) {
        setImages(prev => [...prev, ...uploadedUrls].slice(0, MAX_IMAGES));
      }
      if (uploadedUrls.length < filesToProcess.length) {
        setError(`${filesToProcess.length - uploadedUrls.length} gambar gagal diunggah. Mohon coba kembali.`);
      }
    } catch (e) {
      console.error('[ReturnModal] handleImageUpload error:', e);
      setError('Gagal mengunggah gambar: ' + e.message);
    } finally {
      setUploadingImages(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [images]);

  // ⭐ Helper function: kompresi gambar pakai canvas
  // - Max dimension: 600px (lebih kecil = upload lebih cepat)
  // - Quality: 0.65 (balance size/quality, ~150-300KB per foto)
  // - Output: tetap format asli (jpg/png/webp), bukan force ke jpg
  const compressImage = (file) => {
    return new Promise(async (resolve, reject) => {
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        const finalExt = ACCEPTED_IMAGE_EXT.includes(ext) ? ext : 'jpg';

        // Untuk PNG dengan transparency, tetap pakai PNG (tapi compress tetap)
        // Untuk JPEG/WebP, pakai canvas + quality
        if (file.type === 'image/png' && finalExt === 'png') {
          // PNG: cek apakah perlu resize (kalau dimension > 600)
          const img = await loadImage(file);
          if (img.width <= MAX_IMAGE_DIMENSION && img.height <= MAX_IMAGE_DIMENSION) {
            // Sudah kecil, upload as-is
            resolve({ file, contentType: 'image/png', ext: 'png' });
            return;
          }
          // Resize tetap PNG (preserve transparency)
          const canvas = document.createElement('canvas');
          const ratio = Math.min(MAX_IMAGE_DIMENSION / img.width, MAX_IMAGE_DIMENSION / img.height, 1);
          canvas.width = img.width * ratio;
          canvas.height = img.height * ratio;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise(res => canvas.toBlob(res, 'image/png', IMAGE_QUALITY));
          if (blob) {
            const compressedFile = new File([blob], file.name.replace(/\.(jpg|jpeg|webp)$/i, '.png'), { type: 'image/png' });
            resolve({ file: compressedFile, contentType: 'image/png', ext: 'png' });
          } else {
            resolve({ file, contentType: 'image/png', ext: 'png' });
          }
          return;
        }

        // JPEG & WebP: pakai canvas + JPEG output (universal support + small size)
        const img = await loadImage(file);
        // Skip compression kalau file sudah kecil (< 200KB) dan dimension sudah < 600
        if (file.size < 200 * 1024 && img.width <= MAX_IMAGE_DIMENSION && img.height <= MAX_IMAGE_DIMENSION) {
          // Pakai contentType asli (jpg atau webp)
          const ct = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
          const e = file.type === 'image/webp' ? 'webp' : 'jpg';
          resolve({ file, contentType: ct, ext: e });
          return;
        }
        // Resize + recompress
        const canvas = document.createElement('canvas');
        const ratio = Math.min(MAX_IMAGE_DIMENSION / img.width, MAX_IMAGE_DIMENSION / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d');
        // White background untuk PNG with transparency yang dikonversi ke JPEG (avoid black bg)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', IMAGE_QUALITY));
        if (blob) {
          const compressedFile = new File([blob], file.name.replace(/\.(png|webp|gif)$/i, '.jpg'), { type: 'image/jpeg' });
          resolve({ file: compressedFile, contentType: 'image/jpeg', ext: 'jpg' });
        } else {
          resolve({ file, contentType: 'image/jpeg', ext: 'jpg' });
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  // ⭐ Helper: load image dari File object
  const loadImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (ev) => { img.src = ev.target.result; };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      reader.readAsDataURL(file);
    });
  };

  // ⭐ Video upload — max 20MB
  const handleVideoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Format video tidak didukung. Gunakan MP4, MOV, atau WebM.'); return; }
    if (file.size > MAX_VIDEO_SIZE) { setError('Ukuran video melebihi batas maksimal 20MB.'); return; }
    setUploadingVideo(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Sesi login habis. Silakan login ulang untuk upload video.'); return; }
      if (videoInputRef.current) videoInputRef.current.value = '';
      const ext = file.name.split('.').pop().toLowerCase();
      const filePath = `${user.id}/${Date.now()}_video.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('return-images').upload(filePath, file, { cacheControl: '3600', contentType: file.type });
      if (uploadErr) throw new Error(uploadErr.message);
      const { data: urlData } = supabase.storage.from('return-images').getPublicUrl(filePath);
      if (urlData?.publicUrl) setVideo(urlData.publicUrl);
    } catch (e) { setError('Gagal upload video: ' + e.message); }
    finally {
      setUploadingVideo(false);
    }
  }, []);

  const handleRemoveImage = useCallback((url) => setImages(prev => prev.filter(u => u !== url)), []);
  const handleRemoveVideo = useCallback(() => setVideo(null), []);

  const handleSubmit = useCallback(async () => {
    setError('');

    // ⭐ Mode 1: Confirm nominal (existingReturn.status = 'awaiting_customer_confirmation')
    if (existingReturn?.status === 'awaiting_customer_confirmation') {
      if (!customerRefundAmount || Number(customerRefundAmount) <= 0) {
        setError('Input nominal yang admin kasih untuk konfirmasi.');
        return;
      }
      setSubmitting(true);
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) { setError('Sesi berakhir. Login ulang.'); return; }
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-return-request`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            return_id: existingReturn.id,
            action: 'confirm_refund',
            customer_refund_amount: Number(customerRefundAmount),
            customer_notes: customerNotes.trim() || undefined,
          }),
        });
        const result = await resp.json();
        if (!resp.ok || !result.success) throw new Error(result.error || 'Gagal konfirmasi');
        setSuccess(true);
        if (onSuccess) onSuccess(result);
        setTimeout(() => { handleClose(); }, 2500);
      } catch (e) { setError(e.message); }
      finally { setSubmitting(false); }
      return;
    }

    // ⭐ Mode 2: Submit awal (no nominal)
    if (!reason) { setError('Pilih alasan pengembalian'); return; }
    if (!resolution) { setError('Pilih solusi yang diinginkan'); return; }
    if (!phone) { setError('Nomor telepon wajib diisi'); return; }

    // ⭐ Validasi bukti: minimal 3 foto ATAU 1 video (OR logic sesuai kebijakan)
    //   - Foto 3 + no video = OK
    //   - Video + no foto = OK
    //   - Foto 1+ + video = OK
    //   - No foto + no video = FAIL
    const hasEnoughEvidence = images.length >= 3 || video !== null;
    if (!hasEnoughEvidence) {
      setError('Mohon unggah minimal 3 foto atau 1 video unboxing sebagai bukti pengajuan.');
      return;
    }

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
          customer_notes: customerNotes.trim() || undefined,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || !result.success) throw new Error(result.error || 'Gagal mengajukan pengembalian');

      setSuccess(true);
      if (onSuccess) onSuccess(result.return_request);
      setTimeout(() => { handleClose(); }, 2500);
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  }, [reason, resolution, description, phone, images, video, orderId, onSuccess, customerRefundAmount, customerNotes, existingReturn]);

  const handleClose = () => {
    setReason(''); setResolution(''); setDescription(''); setPhone('');
    setImages([]); setVideo(null);
    setCustomerRefundAmount('');
    setCustomerNotes('');
    setError(''); setSuccess(false); setSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  // ⭐ Mode konfirmasi nominal
  const isConfirmMode = existingReturn?.status === 'awaiting_customer_confirmation';
  const adminProposedAmount = existingReturn?.refund_amount;

  return (
    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="bg-white rounded-2xl max-w-[520px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-eglux-primary">
            {success
              ? '✅ Berhasil'
              : isConfirmMode
                ? '💰 Konfirmasi Nominal Refund'
                : '↩️ Ajukan Pengembalian'}
          </h2>
          <button onClick={handleClose} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none" aria-label="Tutup">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {success ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-sm font-semibold text-gray-900 mb-1">
                {isConfirmMode ? 'Konfirmasi berhasil dikirim!' : 'Pengajuan pengembalian berhasil dikirim!'}
              </p>
              <p className="text-xs text-gray-500">
                {isConfirmMode
                  ? 'Tim admin akan melakukan persetujuan akhir dan memproses refund dalam 1-2 hari kerja.'
                  : 'Tim admin akan meninjau pengajuan dan menghubungi Anda via WhatsApp untuk arahan nominal refund.'}
              </p>
            </div>
          ) : isConfirmMode ? (
            /* === MODE KONFIRMASI NOMINAL === */
            <>
              {/* Info return yang sudah diajukan */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[0.65rem] text-gray-400 uppercase">Order</p>
                <p className="text-sm font-semibold text-gray-900">#{orderId?.slice(0, 8).toUpperCase()}</p>
                {existingReturn?.reason && (
                  <p className="text-xs text-gray-500 mt-1">Alasan: {REASON_OPTIONS.find(o => o.value === existingReturn.reason)?.label || existingReturn.reason}</p>
                )}
              </div>

              {/* Info box — nominal yang admin kasih */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm font-bold text-amber-900 mb-2">Tim Admin EGLUX telah memberikan nominal refund:</p>
                <div className="bg-white border border-amber-200 rounded-md p-3 mb-2">
                  <p className="text-[0.65rem] text-gray-500 uppercase">Nominal dari Admin</p>
                  <p className="text-2xl font-bold text-amber-700 mt-0.5">
                    {adminProposedAmount ? rupiah(Number(adminProposedAmount)) : '(belum ditetapkan)'}
                  </p>
                </div>
                <p className="text-[0.7rem] text-amber-800 leading-relaxed">
                  Admin telah menghubungi Anda via WhatsApp dan memberikan nominal ini. Silakan masukkan nominal yang sama pada kolom di bawah untuk konfirmasi. Setelah dikonfirmasi, admin akan melakukan persetujuan akhir dan memproses refund.
                </p>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

              {/* Field input konfirmasi nominal */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                  Konfirmasi Nominal <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 font-medium">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={customerRefundAmount}
                    onChange={e => setCustomerRefundAmount(e.target.value)}
                    placeholder={adminProposedAmount ? String(adminProposedAmount) : '15000'}
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                  />
                </div>
                {customerRefundAmount && Number(customerRefundAmount) > 0 && (
                  <p className="text-[0.7rem] text-gray-700 mt-1.5 font-medium">
                    Nominal yang Anda konfirmasi: <span className="text-eglux-primary">{rupiah(Number(customerRefundAmount))}</span>
                    {adminProposedAmount && Number(customerRefundAmount) !== Number(adminProposedAmount) && (
                      <span className="text-red-600 block mt-0.5">⚠️ Tidak sesuai dengan nominal dari admin ({rupiah(Number(adminProposedAmount))})</span>
                    )}
                  </p>
                )}
                <p className="text-[0.65rem] text-gray-400 mt-1 leading-relaxed">
                  Nominal yang dimasukkan harus sama dengan nominal dari admin. Jika berbeda, sistem akan menolak konfirmasi.
                </p>
              </div>

              {/* Customer notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">
                  Catatan untuk Admin <span className="text-gray-400">(opsional)</span>
                </label>
                <textarea
                  value={customerNotes}
                  onChange={e => setCustomerNotes(e.target.value)}
                  placeholder="Catatan tambahan untuk admin (opsional)"
                  rows={2}
                  maxLength={200}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y"
                />
              </div>
            </>
          ) : (
            /* === MODE SUBMIT AWAL === */
            <>
              {/* Order info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-[0.65rem] text-gray-400 uppercase">Order</p>
                <p className="text-sm font-semibold text-gray-900">#{orderId?.slice(0, 8).toUpperCase()}</p>
                {orderTotal && <p className="text-xs text-gray-500 mt-0.5">Total: {rupiah(orderTotal)}</p>}
              </div>

              {/* Info flow */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Alur pengajuan:</strong> Setelah Anda mengajukan return, tim admin akan meninjau dan
                  menghubungi Anda via WhatsApp untuk memberikan arahan nominal refund. Selanjutnya, Anda dapat
                  membuka formulir ini kembali untuk melakukan konfirmasi nominal. Setelah dikonfirmasi, admin
                  akan melakukan persetujuan akhir dan memproses refund dalam 1-2 hari kerja.
                </p>
              </div>

              {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">⚠️ {error}</div>}

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Alasan <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-1 gap-2">
                  {REASON_OPTIONS.map(opt => (
                    <button key={opt.value} type="button" onClick={() => setReason(opt.value)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 text-sm cursor-pointer transition-all text-left ${reason === opt.value ? 'border-eglux-secondary bg-eglux-accent/30' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
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
                <p className="text-[0.65rem] text-gray-400 mt-1">Admin akan menghubungi melalui nomor ini untuk arahan nominal refund</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Deskripsi Masalah <span className="text-gray-400">(opsional)</span></label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Jelaskan kendala yang Anda alami..." rows={3} maxLength={MAX_DESC} className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y" />
                <p className="text-[0.65rem] text-gray-400 mt-1">{description.length}/{MAX_DESC}</p>
              </div>

              {/* Photo upload */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Foto Bukti <span className="text-red-500">*</span></label>
                <p className="text-[0.65rem] text-gray-500 mb-2 leading-relaxed">
                  Wajib unggah minimal 3 foto sebagai bukti, mencakup: kondisi kemasan paket beserta resi yang terlihat jelas, jumlah dan bagian barang yang rusak, serta isi paket yang masih berada dalam kemasan.
                </p>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple onChange={handleImageUpload} disabled={uploadingImages || images.length >= MAX_IMAGES} className="hidden" id="return-photo-upload" />
                <label htmlFor="return-photo-upload" className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingImages || images.length >= MAX_IMAGES ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-eglux-secondary hover:text-eglux-secondary'}`}>
                  {uploadingImages ? (<><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Sedang mengunggah...</>) : images.length >= MAX_IMAGES ? (<>Maksimal {MAX_IMAGES} foto</>) : (<>📷 Tambah Foto ({images.length}/{MAX_IMAGES})</>)}
                </label>
                <p className="text-[0.65rem] text-gray-400 mt-1">Maksimal 5MB per foto (terkompresi otomatis), format JPEG/PNG/WebP</p>
                {images.length > 0 && images.length < 3 && !video && (
                  <p className="text-[0.7rem] text-amber-600 mt-1.5 font-medium">⚠️ Jumlah foto kurang dari 3. Mohon sertakan video unboxing sebagai pelengkap.</p>
                )}
                {images.length === 0 && !video && (
                  <p className="text-[0.7rem] text-red-500 mt-1.5 font-medium">⚠️ Wajib unggah minimal 3 foto atau 1 video unboxing sebagai bukti.</p>
                )}
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
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Video Unboxing <span className="text-red-500">*</span></label>
                <p className="text-[0.65rem] text-gray-500 mb-2 leading-relaxed">
                  Sertakan video unboxing sebagai bukti kondisi paket saat diterima. Apabila foto belum mencapai minimal 3, video wajib diunggah sebagai penggantinya.
                </p>
                <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo || !!video} className="hidden" id="return-video-upload" />
                <label htmlFor="return-video-upload" className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm border-2 border-dashed rounded-lg cursor-pointer transition-colors ${uploadingVideo || video ? 'border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-eglux-secondary hover:text-eglux-secondary'}`}>
                  {uploadingVideo ? (<><span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" /> Sedang mengunggah video...</>) : video ? (<>✅ Video terunggah</>) : (<>🎥 Tambah Video</>)}
                </label>
                <p className="text-[0.65rem] text-gray-400 mt-1">Maksimal 20MB, format MP4/MOV/WebM</p>
                {!video && images.length < 3 && (
                  <p className="text-[0.7rem] text-red-500 mt-1.5 font-medium">⚠️ Mohon unggah video unboxing atau lengkapi foto hingga minimal 3.</p>
                )}
                {video && (
                  <button type="button" onClick={handleRemoveVideo} className="mt-2 text-xs text-red-500 hover:underline cursor-pointer border-none bg-transparent">Hapus video</button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer — hanya tampil di mode aktif (bukan success) */}
        {!success && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white">
            <button onClick={handleClose} disabled={submitting} className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 cursor-pointer border-none">Batal</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (isConfirmMode ? !customerRefundAmount : (!reason || !resolution || !phone))}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none flex items-center justify-center gap-2"
            >
              {submitting
                ? (<><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Mengirim...</>)
                : isConfirmMode ? '✓ Konfirmasi Nominal' : 'Ajukan Pengembalian'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReturnModal;