// src/lib/errorMessage.js
// ============================================================================
// friendlyErrorMessage — Map raw error messages ke user-friendly Indonesian text
// ============================================================================
//
// Tujuan:
//   - Cegah raw error (SQL error, schema names, internal paths) bocor ke user
//   - Konsisten kan error message di seluruh app
//   - Logging: raw error tetap ke console untuk debugging dev
//
// Usage:
//   import { friendlyErrorMessage } from '../lib/errorMessage';
//
//   try {
//     const { error } = await supabase.from('orders').select('*');
//     if (error) throw error;
//   } catch (e) {
//     console.error('[Context] Raw error:', e); // log raw untuk dev
//     showToast(friendlyErrorMessage(e), 'error'); // show friendly ke user
//   }
// ============================================================================

/**
 * Map raw error ke user-friendly Indonesian message.
 * @param {Error|Object|string} err - Error object dari catch block
 * @param {string} context - Optional context (mis. 'checkout', 'login', 'fetch orders')
 * @returns {string} User-friendly error message dalam Bahasa Indonesia
 */
export function friendlyErrorMessage(err, context = '') {
  // Log raw error untuk debugging dev (gak shown ke user)
  // ⭐ Strict DEV check — only log in development, never in production
  if (import.meta.env?.DEV === true) {
    console.error(`[friendlyErrorMessage${context ? `:${context}` : ''}] Raw error:`, err);
  }

  // Extract message string dari berbagai error shape
  let rawMessage = '';
  if (typeof err === 'string') {
    rawMessage = err;
  } else if (err?.message) {
    rawMessage = err.message;
  } else if (err?.error) {
    rawMessage = err.error;
  } else if (err?.details) {
    rawMessage = err.details;
  } else {
    rawMessage = String(err || '');
  }

  const msg = rawMessage.toLowerCase();
  const ctxPrefix = context ? `${context}: ` : '';

  // ── Network / connection errors ──
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return `${ctxPrefix}Gagal terhubung ke server. Cek koneksi internet kamu lalu coba lagi.`;
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return `${ctxPrefix}Server membutuhkan waktu terlalu lama untuk merespons. Coba lagi beberapa saat.`;
  }
  if (msg.includes('cors')) {
    return `${ctxPrefix}Akses ditolak oleh kebijakan keamanan. Refresh halaman lalu coba lagi.`;
  }

  // ── Auth errors ──
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'Email atau password salah. Periksa kembali lalu coba lagi.';
  }
  if (msg.includes('email not confirmed') || msg.includes('email confirmation')) {
    return 'Email belum diverifikasi. Cek inbox untuk link verifikasi.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'Email sudah terdaftar. Silakan login atau gunakan email lain.';
  }
  if (msg.includes('jwt expired') || msg.includes('token expired') || msg.includes('session expired')) {
    return 'Sesi login telah berakhir. Silakan login ulang.';
  }
  if (msg.includes('not authorized') || msg.includes('unauthorized') || msg.includes('permission denied')) {
    return `${ctxPrefix}Kamu tidak memiliki akses untuk melakukan aksi ini.`;
  }
  if (msg.includes('forbidden') || msg.includes('403')) {
    return `${ctxPrefix}Akses ditolak. Hubungi admin kalau kamu merasa ini kekeliruan.`;
  }

  // ── RLS / policy errors ──
  if (msg.includes('row level security') || msg.includes('rls') || msg.includes('policy')) {
    return `${ctxPrefix}Akses data ditolak. Hubungi admin kalau kamu merasa ini kekeliruan.`;
  }
  if (msg.includes('new row violates row-level security policy')) {
    return `${ctxPrefix}Data tidak bisa disimpan. Cek kembali input kamu.`;
  }

  // ── Database errors (jangan expose schema/table names) ──
  if (msg.includes('check constraint') || msg.includes('violates check constraint')) {
    return `${ctxPrefix}Data tidak valid. Cek kembali input kamu.`;
  }
  if (msg.includes('foreign key constraint') || msg.includes('violates foreign key constraint')) {
    return `${ctxPrefix}Data referensi tidak valid. Refresh halaman lalu coba lagi.`;
  }
  if (msg.includes('unique constraint') || msg.includes('duplicate key') || msg.includes('already exists')) {
    return `${ctxPrefix}Data sudah ada. Tidak bisa duplikat.`;
  }
  if (msg.includes('not-null constraint') || msg.includes('null value')) {
    return `${ctxPrefix}Ada field wajib yang kosong. Lengkapi semua data lalu coba lagi.`;
  }
  if (msg.includes('relation') && msg.includes('does not exist')) {
    // Jangan expose table name ke user
    return `${ctxPrefix}Terjadi kesalahan sistem. Tim kami sudah diberi notifikasi.`;
  }
  if (msg.includes('column') && (msg.includes('does not exist') || msg.includes('unknown'))) {
    // Jangan expose column name ke user
    return `${ctxPrefix}Terjadi kesalahan sistem. Tim kami sudah diberi notifikasi.`;
  }
  if (msg.includes('syntax error') || msg.includes('sql')) {
    return `${ctxPrefix}Terjadi kesalahan sistem. Tim kami sudah diberi notifikasi.`;
  }

  // ── Midtrans / payment errors ──
  if (msg.includes('midtrans')) {
    if (msg.includes('transaction not found') || msg.includes('order not found')) {
      return `${ctxPrefix}Transaksi pembayaran tidak ditemukan. Coba checkout ulang.`;
    }
    if (msg.includes('already paid') || msg.includes('transaction already settled')) {
      return `${ctxPrefix}Pesanan ini sudah dibayar sebelumnya.`;
    }
    if (msg.includes('expired') || msg.includes('transaction expired')) {
      return `${ctxPrefix}Waktu pembayaran telah habis. Silakan checkout ulang.`;
    }
    return `${ctxPrefix}Pembayaran gagal. Coba lagi atau gunakan metode pembayaran lain.`;
  }

  // ── Biteship / shipping errors ──
  if (msg.includes('biteship')) {
    if (msg.includes('rate') || msg.includes('shipping rate') || msg.includes('courier')) {
      return `${ctxPrefix}Gagal mendapatkan tarif ongkir. Coba pilih kurir lain.`;
    }
    if (msg.includes('waybill') || msg.includes('tracking')) {
      return `${ctxPrefix}Gagal membuat resi pengiriman. Hubungi admin.`;
    }
    return `${ctxPrefix}Layanan pengiriman bermasalah. Coba lagi beberapa saat.`;
  }

  // ── Validation errors ──
  if (msg.includes('validation') || msg.includes('invalid input') || msg.includes('invalid format')) {
    return `${ctxPrefix}Input tidak valid. Cek kembali data yang kamu masukkan.`;
  }
  if (msg.includes('required') || msg.includes('wajib diisi')) {
    return `${ctxPrefix}Ada field wajib yang kosong. Lengkapi semua data.`;
  }
  if (msg.includes('email') && msg.includes('invalid')) {
    return 'Format email tidak valid. Contoh: nama@contoh.com';
  }
  if (msg.includes('phone') && (msg.includes('invalid') || msg.includes('format'))) {
    return 'Nomor telepon tidak valid. Gunakan format: +62xxxxxxxxxxx';
  }
  if (msg.includes('postal code') || msg.includes('kode pos')) {
    return 'Kode pos harus 5 digit angka.';
  }

  // ── Rate limiting ──
  if (msg.includes('rate limit') || msg.includes('too many request') || msg.includes('429')) {
    return `${ctxPrefix}Terlalu banyak permintaan. Tunggu beberapa menit lalu coba lagi.`;
  }

  // ── Server errors ──
  if (msg.includes('500') || msg.includes('internal server error') || msg.includes('server error')) {
    return `${ctxPrefix}Server sedang bermasalah. Coba lagi beberapa saat.`;
  }
  if (msg.includes('502') || msg.includes('bad gateway') || msg.includes('503') || msg.includes('service unavailable')) {
    return `${ctxPrefix}Layanan sedang tidak tersedia. Coba lagi beberapa saat.`;
  }
  if (msg.includes('504') || msg.includes('gateway timeout')) {
    return `${ctxPrefix}Server tidak merespons. Coba lagi beberapa saat.`;
  }

  // ── Edge function errors ──
  if (msg.includes('function') && msg.includes('not found')) {
    return `${ctxPrefix}Layanan tidak tersedia. Hubungi admin.`;
  }
  if (msg.includes('unexpected end of json') || msg.includes('invalid json')) {
    return `${ctxPrefix}Respon server tidak valid. Coba lagi.`;
  }

  // ── Fallback: jangan expose raw message kalau mengandung suspicious patterns ──
  // (SQL paths, schema names, file paths, stack traces)
  if (
    msg.includes('at /') ||                          // stack trace
    msg.includes('.js:') ||                          // file paths
    msg.includes('deno.land') ||                     // Deno internals
    msg.includes('supabase.co') ||                   // Supabase internals
    msg.includes('postgres') ||                      // Postgres internals
    msg.includes('constraint') ||                    // DB constraints
    msg.includes('schema') ||                        // DB schema
    msg.includes('function ') && msg.includes('(')   // function signatures
  ) {
    return `${ctxPrefix}Terjadi kesalahan sistem. Coba lagi, atau hubungi admin kalau masalah berlanjut.`;
  }

  // ── Final fallback: return message as-is kalau dianggap safe ──
  // (mis. custom error dari edge function yang user-friendly)
  if (rawMessage.length > 0 && rawMessage.length < 200) {
    return rawMessage;
  }

  return `${ctxPrefix}Terjadi kesalahan. Coba lagi beberapa saat.`;
}

/**
 * Helper khusus untuk Supabase error.
 * Panggil setelah `const { error } = await supabase...`
 *
 * Usage:
 *   if (error) {
 *     showToast(friendlySupabaseError(error, 'fetch orders'), 'error');
 *     return;
 *   }
 */
export function friendlySupabaseError(error, context = '') {
  return friendlyErrorMessage(error, context);
}

export default friendlyErrorMessage;
