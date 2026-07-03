# Integrasi Midtrans — EGLUX Admin

Dokumen ini nerangin cara kerja dan cara deploy integrasi pembayaran Midtrans (Snap + QRIS) buat project EGLUX.

## Daftar Isi

- [Ringkasan Alur](#ringkasan-alur)
- [Struktur File](#struktur-file)
- [1. Setup Database](#1-setup-database)
- [2. Setup Midtrans Sandbox](#2-setup-midtrans-sandbox)
- [3. Deploy Edge Functions](#3-deploy-edge-functions)
- [4. Integrasi Storefront](#4-integrasi-storefront)
- [5. Testing](#5-testing)
- [6. Sandbox vs Production](#6-sandbox-vs-production)
- [7. Troubleshooting](#7-troubleshooting)
- [Keamanan](#keamanan)

---

## Ringkasan Alur

```
Customer checkout
      │
      ▼
Order dibuat di tabel `orders` (status: pending, payment_status: pending)
      │
      ▼
Frontend panggil Edge Function `create-midtrans-transaction`
      │  (nominal dihitung ulang di server dari order_items, gak percaya input client)
      ▼
Dapet snap_token → window.snap.pay(token) → Snap popup muncul
      │  (customer pilih metode: QRIS, GoPay, kartu, bank transfer, dll)
      ▼
Customer bayar
      │
      ▼
Midtrans kirim notifikasi ke Edge Function `midtrans-webhook`
      │  (verifikasi signature_key, upsert ke tabel `payments`)
      ▼
Trigger database `sync_order_payment_status` otomatis:
  - update orders.payment_status
  - majukan orders.status ke 'paid' (kalau masih pending/confirmed)
  - insert notifikasi "Payment Received" ke admin panel
      │
      ▼
Admin panel: status order & notifikasi ke-update otomatis (realtime)
```

## Struktur File

```
supabase/
├── schema/
│   ├── supabase_schema.sql            # profiles, notifications, low-stock trigger
│   └── supabase_schema_payments.sql   # sync trigger orders <-> payments
└── functions/
    ├── midtrans-webhook/
    │   └── index.ts                   # nampung notifikasi dari Midtrans
    └── create-midtrans-transaction/
        └── index.ts                   # generate snap_token buat checkout

src/ (storefront, bukan admin panel)
├── hooks/
│   └── useMidtransSnap.js             # loader script Snap.js
└── components/checkout/
    └── PayButton.jsx                  # tombol bayar + handle hasil
```

---

## 1. Setup Database

Jalankan **berurutan** di Supabase SQL Editor:

```bash
1. supabase_schema.sql            # kalau belum pernah dijalankan
2. supabase_schema_payments.sql   # wajib buat sinkronisasi payment
```

`supabase_schema_payments.sql` nambahin:
- Tipe notifikasi `'payment'`
- Unique index di `payments.provider_reference_id` (buat upsert idempotent)
- RLS di tabel `payments` — admin cuma bisa **baca**, nulis cuma boleh lewat service role (webhook)
- Trigger `sync_order_payment_status` — satu-satunya sumber kebenaran buat nyinkronin `payments` ke `orders`

---

## 2. Setup Midtrans Sandbox

1. Login ke **https://dashboard.sandbox.midtrans.com** (akun sandbox terpisah dari production).

2. **Ambil kredensial**
   `Settings → Access Keys`
   - Server Key: `SB-Mid-server-xxxxxxxxxxxxxxxxx` (rahasia, cuma buat Edge Function)
   - Client Key: `SB-Mid-client-xxxxxxxxxxxxxxxxx` (aman dipublish, dipakai di frontend)

3. **Daftarin webhook URL**
   `Settings → Configuration → Payment Notification URL`
   ```
   https://<project-ref>.functions.supabase.co/midtrans-webhook
   ```

4. **Cek metode pembayaran aktif**
   `Settings → Payment Methods` — pastikan QRIS aktif (biasanya sudah default di sandbox).

5. **Cara "bayar" QRIS di sandbox** (gak ada uang beneran):
   - Buka [Midtrans Simulator](https://simulator.sandbox.midtrans.com/) buat simulasi scan QR, **atau**
   - Panggil Core API simulasi status pembayaran manual

---

## 3. Deploy Edge Functions

### a. `midtrans-webhook` (dipanggil Midtrans, bukan Supabase-authenticated)

```bash
supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxxx
supabase functions deploy midtrans-webhook --no-verify-jwt
```

> ⚠️ Flag `--no-verify-jwt` **wajib**. Midtrans gak ngirim Supabase JWT, keamanan endpoint ini dijaga lewat verifikasi `signature_key`, bukan auth Supabase.

### b. `create-midtrans-transaction` (dipanggil dari storefront)

```bash
supabase secrets set MIDTRANS_IS_PRODUCTION=false
supabase functions deploy create-midtrans-transaction
```

> Function ini **tidak** perlu `--no-verify-jwt` karena dipanggil lewat `supabase-js` dari frontend (pakai anon key), yang otomatis lolos verifikasi JWT default.

### Cek daftar secret yang ke-set

```bash
supabase secrets list
```

Harus ada minimal: `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION` (opsional, default sandbox kalau gak di-set).

---

## 4. Integrasi Storefront

1. Copy `useMidtransSnap.js` ke `src/hooks/` dan `PayButton.jsx` ke `src/components/checkout/`.

2. Set environment variable di storefront (**beda project/repo** dari admin panel):
   ```
   VITE_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxxx
   VITE_MIDTRANS_IS_PRODUCTION=false
   ```
   > Pakai Next.js? Ganti `import.meta.env.VITE_...` di `useMidtransSnap.js` jadi `process.env.NEXT_PUBLIC_...`.

3. Pasang di halaman checkout, setelah order berhasil dibuat:
   ```jsx
   <PayButton
     orderId={order.id}
     onPaymentSuccess={() => navigate('/order-success')}
     onPaymentPending={() => navigate('/order-pending')}
   />
   ```

4. **Tidak perlu** taruh `<script>` Snap.js manual di `index.html` — `useMidtransSnap` yang me-load-nya secara dinamis.

---

## 5. Testing

### Cek webhook bisa diakses

```bash
curl -i https://<project-ref>.functions.supabase.co/midtrans-webhook
# Harusnya balas 405 Method Not Allowed (karena cuma nerima POST) — bukan 404
```

### Alur test lengkap

1. Buat order testing di tabel `orders` (atau lewat storefront kalau checkout udah jalan).
2. Panggil `create-midtrans-transaction` dengan `order_id` itu, dapet `snap_token`.
3. Buka Snap popup, pilih QRIS, "bayar" pakai Midtrans Simulator.
4. Cek tabel `payments` — harus ada row baru dengan `provider = 'midtrans'`.
5. Cek `orders.payment_status` — harus otomatis jadi `paid`.
6. Cek admin panel — notifikasi "Payment Received" harus muncul di dropdown tanpa refresh (realtime).

### Cek log Edge Function kalau ada yang aneh

```bash
supabase functions logs midtrans-webhook
supabase functions logs create-midtrans-transaction
```

---

## 6. Sandbox vs Production

| | Sandbox | Production |
|---|---|---|
| Dashboard | dashboard.**sandbox**.midtrans.com | dashboard.midtrans.com |
| Server/Client Key | diawali `SB-Mid-` | diawali `Mid-` |
| Snap API URL | app.**sandbox**.midtrans.com | app.midtrans.com |
| Uang | simulasi, gak beneran | transaksi asli |

**Cara pindah ke production nanti** (gak perlu ubah kode sama sekali):

```bash
supabase secrets set MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxxxxxxxxxxx
supabase secrets set MIDTRANS_IS_PRODUCTION=true
```

Plus update env storefront:
```
VITE_MIDTRANS_CLIENT_KEY=Mid-client-xxxxxxxxxxxxxxxxx
VITE_MIDTRANS_IS_PRODUCTION=true
```

Dan daftarin ulang webhook URL di dashboard **production** Midtrans (terpisah dari sandbox).

---

## 7. Troubleshooting

| Gejala | Kemungkinan Penyebab |
|---|---|
| Webhook return `401 Invalid signature` | `MIDTRANS_SERVER_KEY` yang di-set di secrets gak match sama server key yang aktif di dashboard (sandbox vs production ketuker) |
| Webhook return `404 Order not found` | `order_id` yang dikirim ke Midtrans pas bikin transaksi gak sama persis dengan `orders.id` di database |
| `orders.payment_status` gak pernah berubah walau `payments` udah keisi | Trigger `sync_order_payment_status` belum ke-install — jalankan ulang `supabase_schema_payments.sql` |
| `create-midtrans-transaction` return `502` | Payload ke Midtrans ditolak — cek `supabase functions logs create-midtrans-transaction` buat lihat detail error dari Midtrans |
| Snap popup gak muncul sama sekali | Client Key salah/kosong, atau `useMidtransSnap` gagal load script — cek console browser & `loadError` |
| QRIS gak muncul sebagai opsi di Snap popup | Metode QRIS belum aktif di `Settings → Payment Methods` dashboard Midtrans |

---

## Keamanan

- **Server Key** cuma boleh ada sebagai Supabase Function secret. **Jangan pernah** taruh di tabel database, environment variable frontend, atau kode yang ke-bundle ke browser.
- **Client Key** aman dipublish di frontend — memang didesain buat itu.
- Nominal transaksi (`gross_amount`) **selalu dihitung ulang di server** dari data `orders`/`order_items`, gak pernah dipercaya dari input client.
- Tabel `payments` di-RLS supaya cuma bisa dibaca lewat client (admin panel), penulisan cuma lewat service role di dalam webhook — mencegah orang nyuntik status "paid" palsu langsung ke database.
- Endpoint webhook diverifikasi pakai `signature_key` (SHA-512), bukan API key — karena Midtrans emang gak ngirim kredensial Supabase apa pun.