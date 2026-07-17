// supabase/functions/notify-new-ticket/index.ts
//
// Edge Function ini dipanggil dari frontend setelah ticket + attachment
// berhasil disimpan ke database. Tugasnya:
//   1. Ambil detail ticket + attachment dari database (pakai service_role,
//      supaya bisa bypass RLS — Edge Function ini "dipercaya" penuh).
//   2. Kalau ada attachment, download file dari Supabase Storage lalu
//      encode ke base64 supaya bisa dilampirkan langsung di email.
//   3. Kirim email ke contact@eglux.co.id lewat Resend API.
//   4. Kalau email berhasil terkirim, HAPUS file dari Storage — supaya
//      tidak numpuk, karena salinan aslinya sudah ada di inbox email.
//
// ENV VARS yang wajib di-set (lewat `supabase secrets set`):
//   RESEND_API_KEY        → API key dari resend.com
//   SUPABASE_URL           → otomatis tersedia di runtime Edge Function
//   SUPABASE_SERVICE_ROLE_KEY → otomatis tersedia di runtime Edge Function

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPPORT_EMAIL = 'coonedesign.id@gmail.com'; // ganti sesuai kebutuhan
const ATTACHMENT_BUCKET = 'ticket-attachments';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ success: false, error: 'ticket_id wajib diisi' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Ambil detail ticket + info user ──
    const { data: ticket, error: ticketErr } = await supabaseAdmin
      .from('tickets')
      .select('id, subject, description, status, created_at, user_id')
      .eq('id', ticket_id)
      .single();

    if (ticketErr || !ticket) {
      throw new Error(`Ticket tidak ditemukan: ${ticketErr?.message}`);
    }

    // Ambil email user dari auth.users (butuh service_role, tidak bisa lewat RLS biasa)
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id);
    const userEmail = userData?.user?.email || 'tidak diketahui';

    // ── 2. Ambil attachment ticket ini (kalau ada) ──
    const { data: attachments } = await supabaseAdmin
      .from('ticket_attachments')
      .select('id, file_url, file_type')
      .eq('ticket_id', ticket_id);

    // Download tiap attachment & encode ke base64 untuk dilampirkan di email
    const emailAttachments = [];
    const storagePaths = []; // simpan path storage untuk dihapus nanti

    for (const att of attachments || []) {
      try {
        const fileResp = await fetch(att.file_url);
        if (!fileResp.ok) continue;

        const arrayBuffer = await fileResp.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        // Ekstrak path storage dari public URL untuk keperluan delete nanti.
        // Format public URL: .../storage/v1/object/public/ticket-attachments/<path>
        const marker = `/object/public/${ATTACHMENT_BUCKET}/`;
        const idx = att.file_url.indexOf(marker);
        if (idx !== -1) {
          storagePaths.push(att.file_url.slice(idx + marker.length));
        }

        const fileName = att.file_url.split('/').pop();
        emailAttachments.push({ filename: fileName, content: base64 });
      } catch (e) {
        console.warn(`Gagal proses attachment ${att.id}:`, e.message);
        // Lanjut proses attachment lain, jangan gagalkan seluruh email
      }
    }

    // ── 3. Kirim email lewat Resend ──
    const emailHtml = `
      <h2>Tiket Bantuan Baru</h2>
      <p><strong>Subjek:</strong> ${ticket.subject}</p>
      <p><strong>Dari:</strong> ${userEmail}</p>
      <p><strong>Status:</strong> ${ticket.status}</p>
      <p><strong>Deskripsi:</strong></p>
      <p>${ticket.description.replace(/\n/g, '<br/>')}</p>
      <hr/>
      <p style="color:#888;font-size:12px;">Ticket ID: ${ticket.id}</p>
    `;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Eglux Support <onboarding@resend.dev>', // ganti setelah domain diverifikasi, lihat catatan di bawah
        to: [SUPPORT_EMAIL],
        subject: `[Tiket Baru] ${ticket.subject}`,
        html: emailHtml,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      }),
    });

    if (!resendResp.ok) {
      const errText = await resendResp.text();
      throw new Error(`Resend gagal kirim email: ${errText}`);
    }

    // ── 4. Email berhasil terkirim → hapus file dari Storage ──
    // Supaya storage tidak numpuk, karena salinan sudah ada di email.
    if (storagePaths.length > 0) {
      const { error: removeErr } = await supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .remove(storagePaths);

      if (removeErr) {
        // Jangan gagalkan response cuma karena cleanup gagal — email
        // sudah terkirim, ini cuma housekeeping. Log saja untuk investigasi.
        console.warn('Gagal hapus attachment dari storage:', removeErr.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('notify-new-ticket error:', e.message);
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});