// src/components/ui/TicketModal.jsx
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const MAX_FILE_SIZE_MB = 10;
const ATTACHMENT_BUCKET = 'ticket-attachments';

const STATUS_LABEL = {
  'open': { text: 'Terbuka', className: 'bg-blue-50 text-blue-600' },
  'in-progress': { text: 'Diproses', className: 'bg-amber-50 text-amber-600' },
  'closed': { text: 'Selesai', className: 'bg-green-50 text-green-600' },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const StatusBadge = ({ status }) => {
  const cfg = STATUS_LABEL[status] || STATUS_LABEL.open;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${cfg.className}`}>
      {cfg.text}
    </span>
  );
};

const TicketModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();

  const [view, setView] = useState('list'); // 'list' | 'create' | 'detail'
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedAttachments, setSelectedAttachments] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [form, setForm] = useState({ subject: '', description: '' });
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoadingTickets(true);
    const { data, error: fetchErr } = await supabase
      .from('tickets')
      .select('id, subject, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!fetchErr) setTickets(data || []);
    setLoadingTickets(false);
  }, [user]);

  const handleOpenTicket = useCallback(async (ticketId) => {
    setLoadingDetail(true);
    setView('detail');

    const [{ data: ticketData }, { data: attachmentsData }] = await Promise.all([
      supabase.from('tickets').select('*').eq('id', ticketId).single(),
      supabase.from('ticket_attachments').select('*').eq('ticket_id', ticketId),
    ]);

    setSelectedTicket(ticketData || null);
    setSelectedAttachments(attachmentsData || []);
    setLoadingDetail(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setView('list');
      setError(null);
      setSuccess(false);
      fetchTickets();
    }
  }, [isOpen, fetchTickets]);

  const resetForm = () => {
    setForm({ subject: '', description: '' });
    setAttachmentFile(null);
    setError(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAttachmentFile(null);
      return;
    }
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('File harus berupa foto atau video');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${MAX_FILE_SIZE_MB}MB`);
      e.target.value = '';
      return;
    }
    setError(null);
    setAttachmentFile(file);
  };

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.description.trim()) {
      setError('Subjek dan deskripsi wajib diisi');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // 1. Insert ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from('tickets')
        .insert({
          user_id: user.id,
          subject: form.subject.trim(),
          description: form.description.trim(),
        })
        .select()
        .single();

      if (ticketErr) throw new Error(ticketErr.message);

      // 2. Upload attachment kalau ada, lalu catat di ticket_attachments
      if (attachmentFile) {
        const fileExt = attachmentFile.name.split('.').pop();
        const filePath = `${user.id}/${ticket.id}/${Date.now()}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from(ATTACHMENT_BUCKET)
          .upload(filePath, attachmentFile, { upsert: false });

        if (uploadErr) throw new Error(`Ticket dibuat, tapi upload lampiran gagal: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage
          .from(ATTACHMENT_BUCKET)
          .getPublicUrl(filePath);

        const fileType = attachmentFile.type.startsWith('image/') ? 'image' : 'video';

        const { error: attachErr } = await supabase
          .from('ticket_attachments')
          .insert({
            ticket_id: ticket.id,
            file_url: urlData.publicUrl,
            file_type: fileType,
          });

        if (attachErr) throw new Error(`Ticket dibuat, tapi gagal menyimpan data lampiran: ${attachErr.message}`);
      }

      // 3. Forward ticket ke email support. Edge Function ini yang akan
      //    hapus file dari storage setelah email terkirim sukses (supaya
      //    storage tidak numpuk). Sengaja tidak di-await secara blocking
      //    penuh terhadap UI — tapi tetap ditunggu supaya kita tahu kalau
      //    gagal (misal Resend API key belum di-set).
      const { error: notifyErr } = await supabase.functions.invoke('notify-new-ticket', {
        body: { ticket_id: ticket.id },
      });
      if (notifyErr) {
        // Ticket & attachment tetap tersimpan di database — cuma notifikasi
        // emailnya yang gagal. Jangan blokir user, cukup log untuk investigasi.
        console.warn('Gagal forward ticket ke email:', notifyErr.message);
      }

      setSuccess(true);
      resetForm();
      await fetchTickets();
      setTimeout(() => {
        setSuccess(false);
        setView('list');
      }, 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-eglux-primary">
            {view === 'list' && 'Tiket Bantuan'}
            {view === 'create' && 'Buat Tiket Baru'}
            {view === 'detail' && 'Detail Tiket'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
            aria-label="Tutup"
          >✕</button>
        </div>

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <>
            <div className="px-6 py-4">
              <button
                onClick={() => { resetForm(); setView('create'); }}
                className="w-full py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90"
              >
                + Buat Tiket Baru
              </button>
            </div>

            <div className="px-6 pb-6 space-y-2">
              {loadingTickets && (
                <p className="text-sm text-gray-400 text-center py-6">Memuat tiket...</p>
              )}

              {!loadingTickets && tickets.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  Belum ada tiket bantuan. Klik tombol di atas untuk membuat yang baru.
                </p>
              )}

              {!loadingTickets && tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleOpenTicket(t.id)}
                  className="w-full text-left p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer bg-transparent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-eglux-primary truncate flex-1">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-[0.7rem] text-gray-400 mt-1">{formatDate(t.created_at)}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === 'detail' && (
          <div className="px-6 py-5 space-y-4">
            {loadingDetail && (
              <p className="text-sm text-gray-400 text-center py-6">Memuat detail tiket...</p>
            )}

            {!loadingDetail && selectedTicket && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-eglux-primary">{selectedTicket.subject}</h3>
                  <StatusBadge status={selectedTicket.status} />
                </div>
                <p className="text-[0.7rem] text-gray-400 -mt-2">{formatDate(selectedTicket.created_at)}</p>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Deskripsi
                  </label>
                  <p className="text-sm text-eglux-primary whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {selectedTicket.description}
                  </p>
                </div>

                {selectedAttachments.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                      Lampiran
                    </label>
                    <div className="space-y-1.5">
                      {selectedAttachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-2.5 border border-gray-100"
                        >
                          <span>{att.file_type === 'image' ? '🖼️' : '🎬'}</span>
                          <span>
                            Lampiran {att.file_type === 'image' ? 'foto' : 'video'} sudah dikirim via email ke tim support
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setView('list')}
                  className="w-full py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 mt-2"
                >
                  Kembali ke Daftar Tiket
                </button>
              </>
            )}
          </div>
        )}

        {/* ── CREATE VIEW ── */}
        {view === 'create' && (
          <div className="px-6 py-5 space-y-4">
            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center">
                ✓ Tiket berhasil dibuat
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                ⚠ {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Subjek
              </label>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ringkasan masalah kamu"
                className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Deskripsi
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Jelaskan masalah kamu secara detail"
                rows={4}
                className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors resize-y"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                Lampiran Foto/Video <span className="normal-case font-normal text-gray-400">(opsional, maks {MAX_FILE_SIZE_MB}MB)</span>
              </label>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-eglux-secondary/10 file:text-eglux-secondary hover:file:bg-eglux-secondary/20"
              />
              {attachmentFile && (
                <p className="text-[0.7rem] text-gray-500 mt-1">📎 {attachmentFile.name}</p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setView('list')}
                disabled={submitting}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Kembali
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Mengirim...
                  </>
                ) : 'Kirim Tiket'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketModal;