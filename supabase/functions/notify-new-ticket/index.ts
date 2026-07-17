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
const SUPPORT_EMAIL = 'contact@eglux.co.id';
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
      .select('id, ticket_number, subject, description, status, created_at, user_id')
      .eq('id', ticket_id)
      .single();

    if (ticketErr || !ticket) {
      throw new Error(`Ticket tidak ditemukan: ${ticketErr?.message}`);
    }

    // Ambil email user dari auth.users (butuh service_role, tidak bisa lewat RLS biasa)
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id);
    const userEmail = userData?.user?.email;

    // Ambil nama lengkap dari profiles untuk sapaan di email konfirmasi customer
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', ticket.user_id)
      .single();
    const userName = profileData?.full_name || 'Pelanggan';

    // Format nomor tiket & tanggal jadi human-readable
    const ticketNumberDisplay = ticket.ticket_number
      ? `TIK-${String(ticket.ticket_number).padStart(6, '0')}`
      : ticket.id;
    const createdAtDisplay = new Date(ticket.created_at).toLocaleString('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

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

    // ── 3a. Email INTERNAL ke tim support (contact@eglux.co.id) ──
    const internalHtml = `
      <h2>Tiket Bantuan Baru — ${ticketNumberDisplay}</h2>
      <p><strong>Dari:</strong> ${userName} (${userEmail || 'email tidak diketahui'})</p>
      <p><strong>Subjek:</strong> ${ticket.subject}</p>
      <p><strong>Status:</strong> ${ticket.status}</p>
      <p><strong>Deskripsi:</strong></p>
      <p>${ticket.description.replace(/\n/g, '<br/>')}</p>
      <hr/>
      <p style="color:#888;font-size:12px;">Ticket ID (internal): ${ticket.id}</p>
    `;

    const internalResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Eglux Tickets <contact@eglux.co.id>',
        to: [SUPPORT_EMAIL],
        subject: `[Tiket Baru ${ticketNumberDisplay}] ${ticket.subject}`,
        html: internalHtml,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      }),
    });

    if (!internalResp.ok) {
      const errText = await internalResp.text();
      throw new Error(`Resend gagal kirim email internal: ${errText}`);
    }

    // ── 3b. Email AUTO-REPLY konfirmasi ke customer ──
    // Hanya dikirim kalau kita berhasil dapat email user-nya.
    if (userEmail) {
      const customerText = `Halo ${userName},

Terima kasih telah menghubungi Eglux.

📋 Tiket Anda: #${ticketNumberDisplay}
⏰ Waktu: ${createdAtDisplay}
📝 Subjek: ${ticket.subject}

Pesan Anda:
"${ticket.description}"

Tim kami akan menindaklanjuti dalam 1x24 jam.

Salam,
Tim Customer Care Eglux`;

      const customerHtml = customerText
        .replace(/\n/g, '<br/>');

      const customerResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Eglux Customer Care <contact@eglux.co.id>',
          to: [userEmail],
          subject: `Tiket Anda #${ticketNumberDisplay} telah kami terima`,
          html: customerHtml,
        }),
      });

      if (!customerResp.ok) {
        const errText = await customerResp.text();
        // Jangan gagalkan seluruh proses cuma karena auto-reply customer
        // gagal terkirim — notifikasi internal ke tim sudah berhasil di atas.
        console.warn('Gagal kirim email konfirmasi ke customer:', errText);
      }
    } else {
      console.warn('Email user tidak ditemukan, auto-reply konfirmasi dilewati.');
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