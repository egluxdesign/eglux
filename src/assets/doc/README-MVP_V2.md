# EGLUX Order Manager - Enterprise Edition

Sistem manajemen pesanan internal untuk EGLUX yang terintegrasi penuh dari pemesanan hingga pengiriman otomatis.

## 🚀 Enterprise Architecture Mapping
Sistem ini menggunakan alur otomatisasi penuh untuk meningkatkan efisiensi operasional:

| Tahap | Trigger | Aksi Sistem | Output |
| :--- | :--- | :--- | :--- |
| **1. Checkout** | User Checkout | Insert `orders` & `transactions` | Status: `pending` |
| **2. Notifikasi** | Insert Success | Edge Function memicu **WABA API** | Notifikasi WA (Konfirmasi + Link Bayar) |
| **3. Pembayaran** | Snap Payment | Midtrans **Webhook** to Supabase | Status: `paid` |
| **4. Konfirmasi** | Update Status | Edge Function memicu **WABA API** | Notifikasi WA (Pembayaran Diterima) |
| **5. Logistik** | Admin klik "Proses" | API Aggregator buat AWB | Status: `shipped` |
| **6. Tracking** | Shipping Webhook | Update `shipments` table | Status Update Real-time |
| **7. Arrival** | Webhook Delivered | Update `orders` ke `delivered` | Status: `delivered` |
| **8. Closing** | 24h post-delivered | Edge Function memicu **WABA API** | Notifikasi WA (Review/Feedback) |

## 🛠 Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend & Database**: Supabase (PostgreSQL)
- **Otomasi**: Supabase Edge Functions
- **Integrasi**: Midtrans (Payment), WABA (WhatsApp API), Shipping Aggregator

## 📋 Struktur Data Baru
| Tabel | Fungsi |
| :--- | :--- |
| `shipments` | Melacak AWB, kurir, dan status logistik real-time. |
| `transactions` | Mencatat detail transaksi payment gateway & log response. |
| `waba_logs` | Menyimpan log pengiriman pesan untuk audit trail. |

## ⚙️ Cara Menjalankan Proyek
1. Clone repo: `git clone [url-repo-anda]`
2. Install: `npm install`
3. Setup `.env`:
    ```env
    VITE_SUPABASE_URL=...
    VITE_SUPABASE_ANON_KEY=...
    MIDTRANS_SERVER_KEY=...
    WABA_API_KEY=...
    ```
4. Jalankan: `npm run dev`

---
*Dokumentasi ini disusun untuk memandu pengembangan dari MVP menuju sistem otomatisasi skala penuh.*