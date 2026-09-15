// src/pages/ReturnPolicyPage.jsx
// ============================================================================
// ReturnPolicyPage — Kebijakan return & refund EGLUX (static content, Option A)
// ============================================================================
// Content based on customer-provided reference image + EGLUX system:
//   - 3 alasan (rusak / barang kurang / salah kirim) — sesuai ReturnModal
//   - Wajib video unboxing + foto bukti
//   - Wajib hubungi CS dulu untuk nominal refund
//   - Refund proporsional sesuai item rusak
// ============================================================================

import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { Link } from 'react-router-dom';

const ReturnPolicyPage = () => {
  const { openCart } = useCartActions();

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <main style={{ paddingTop: '6rem', paddingBottom: '4rem', minHeight: '60vh' }}>
        <div className="container mx-auto max-w-4xl px-4">

          {/* === Breadcrumb === */}
          <nav className="text-[0.78rem] text-gray-500 mb-6 flex items-center gap-1.5">
            <Link to="/" className="hover:text-eglux-primary transition-colors">Beranda</Link>
            <span className="text-gray-300">/</span>
            <span className="text-gray-800 font-medium">Kebijakan Return & Refund</span>
          </nav>

          {/* === Header === */}
          <header className="mb-10 border-b border-gray-100 pb-6">
            <p className="text-[0.7rem] font-semibold text-eglux-primary uppercase tracking-[0.2em] mb-1.5">EGLUX · Elegant & Luxury</p>
            <h1 className="text-[2rem] font-bold text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              Syarat &amp; Ketentuan Retur &amp; Refund
            </h1>
            <p className="text-[0.9rem] text-gray-500">
              Kebijakan resmi EGLUX untuk pengajuan retur produk dan refund dana.
              Update terakhir: 15 September 2026.
            </p>
          </header>

          {/* === Section 1: Syarat & Ketentuan Utama === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-eglux-primary">📦</span>
              Syarat &amp; Ketentuan
            </h2>
            <div className="bg-gray-50/60 rounded-lg border border-gray-100 p-5">
              <ul className="space-y-2.5 text-[0.85rem] text-gray-700">
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span><strong className="font-semibold text-gray-900">Retur hanya untuk produk rusak / pecah</strong> saat diterima customer.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span><strong className="font-semibold text-gray-900">Refund hanya untuk item yang rusak saja</strong> — tidak seluruh paket. Kalau hanya sebagian rusak, refund dihitung proporsional sesuai jumlah item yang rusak.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span><strong className="font-semibold text-gray-900">Wajib menyertakan video unboxing</strong> + bukti foto kerusakan yang jelas (minimal 3 foto dari berbagai sudut).</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span>Customer <strong className="font-semibold text-gray-900">wajib menghubungi CS EGLUX terlebih dahulu</strong> sebelum mengajukan return untuk konfirmasi nominal refund.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span>Nominal refund <strong className="font-semibold text-gray-900">harus sesuai arahan CS</strong>. Input nominal tanpa konfirmasi CS akan ditolak sistem.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span>Batas waktu komplain: <strong className="font-semibold text-gray-900">3 (tiga) hari kerja</strong> sejak paket diterima. Lewat window ini, pengajuan otomatis ditolak.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span>Produk yang <strong className="font-semibold text-gray-900">tidak rusak tidak dapat diretur atau di-refund</strong>. Kebijakan ini berlaku khusus untuk kerusakan akibat pengiriman atau cacat produksi.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-eglux-primary mt-0.5">•</span>
                  <span>Customer wajib koordinasi via WhatsApp / form return di platform untuk arahan proses selanjutnya.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* === Section 2: Proses Pengajuan Retur & Refund === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-eglux-primary">📱</span>
              Proses Pengajuan Retur &amp; Refund
            </h2>

            {/* Pre-step: Sebelum submit */}
            <div className="bg-amber-50/60 border border-amber-100 rounded-lg p-4 mb-5">
              <p className="text-[0.85rem] font-semibold text-gray-900 mb-2">Sebelum Mengajukan:</p>
              <ul className="space-y-1.5 text-[0.82rem] text-gray-700">
                <li className="flex gap-2">
                  <span className="text-eglux-primary mt-0.5">→</span>
                  <span>Terima barang dan lakukan <strong className="font-medium">Video Unboxing</strong> sebagai bukti kondisi awal paket.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-eglux-primary mt-0.5">→</span>
                  <span>Jika ada kerusakan, <strong className="font-medium">wajib hubungi CS EGLUX</strong> via WhatsApp atau halaman <Link to="/contact" className="text-eglux-primary underline">Kontak</Link>.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-eglux-primary mt-0.5">→</span>
                  <span>Kirim bukti foto / video kerusakan ke CS untuk konfirmasi nominal refund yang akan diajukan.</span>
                </li>
              </ul>
            </div>

            {/* 9 Step process */}
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">1</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Masuk ke Pesanan Saya</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Login ke akun EGLUX, lalu buka halaman <Link to="/order-history" className="text-eglux-primary underline hover:no-underline">Riwayat Pesanan</Link> untuk melihat daftar pesanan yang sudah selesai (delivered).
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">2</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Klik pesanan yang ingin dikembalikan</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Pilih order yang berisi produk rusak. Order harus berstatus "delivered" atau "completed" untuk bisa diajukan return.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">3</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Pilih "Ajukan Pengembalian"</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Klik tombol <span className="inline-block px-2 py-0.5 bg-gray-100 border border-gray-200 rounded text-[0.78rem] font-medium text-gray-800">Ajukan Return</span> di detail order. Tombol ini hanya muncul untuk produk yang masih dalam window 3 hari.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">4</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Pilih alasan pengembalian yang sesuai</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed mb-2">
                    EGLUX menerima pengajuan dengan salah satu dari 3 alasan berikut:
                  </p>
                  <div className="space-y-2 mt-2">
                    <div className="border border-gray-100 rounded-md p-2.5 bg-white">
                      <p className="text-[0.83rem] font-medium text-gray-900">• Produk Rusak</p>
                      <p className="text-[0.78rem] text-gray-500 mt-0.5">Barang yang diterima penyok, tergores, atau pecah akibat proses pengiriman.</p>
                    </div>
                    <div className="border border-gray-100 rounded-md p-2.5 bg-white">
                      <p className="text-[0.83rem] font-medium text-gray-900">• Barang Kurang</p>
                      <p className="text-[0.78rem] text-gray-500 mt-0.5">Jumlah produk yang diterima kurang dari yang dipesan, atau ada item hilang dari paket.</p>
                    </div>
                    <div className="border border-gray-100 rounded-md p-2.5 bg-white">
                      <p className="text-[0.83rem] font-medium text-gray-900">• Salah Kirim</p>
                      <p className="text-[0.78rem] text-gray-500 mt-0.5">Produk yang diterima berbeda total dengan yang dipesan (model, warna, atau jenis salah).</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">5</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Input nominal refund (sesuai arahan CS)</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Nominal refund diisi sesuai arahan CS EGLUX. Sistem akan menampilkan breakdown:
                  </p>
                  <div className="mt-2.5 rounded-md border border-gray-100 overflow-hidden">
                    <table className="w-full text-[0.78rem]">
                      <tbody>
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-600">Harga Produk yang Dapat Dikembalikan</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">Rp 15.000</td>
                        </tr>
                        <tr className="border-b border-gray-50 bg-gray-50/40">
                          <td className="px-3 py-2 text-gray-600">Maks. Pengembalian Dana</td>
                          <td className="px-3 py-2 text-right text-gray-700">Rp 19.838</td>
                        </tr>
                        <tr className="border-b border-gray-50">
                          <td className="px-3 py-2 text-gray-600">Biaya Admin &amp; Layanan</td>
                          <td className="px-3 py-2 text-right text-gray-700">Rp 412</td>
                        </tr>
                        <tr className="bg-eglux-primary/5">
                          <td className="px-3 py-2 font-semibold text-gray-900">Total Pengembalian Dana</td>
                          <td className="px-3 py-2 text-right font-bold text-eglux-primary">Rp 15.412</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[0.75rem] text-gray-500 mt-1.5 italic">
                    * Contoh nominal. Angka aktual menyesuaikan harga produk + biaya admin berlaku.
                  </p>
                </div>
              </div>

              {/* Step 6 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">6</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Input bukti foto / video</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed mb-2">
                    Lampirkan foto (wajib) atau video (opsional) yang menunjukkan:
                  </p>
                  <ul className="list-decimal list-inside text-[0.8rem] text-gray-700 space-y-1">
                    <li>Kondisi kemasan paket saat diterima dan resi pada paket yang terlihat jelas</li>
                    <li>Jumlah dan bagian barang yang pecah / rusak / hancur</li>
                    <li>Isi paket yang masih berada dalam kemasan (untuk konteks jumlah item)</li>
                  </ul>
                  <p className="text-[0.75rem] text-gray-500 mt-2 italic">
                    Maks 5 foto, ukuran maks 5MB per foto. Video maks 10MB, format MP4/MOV/WebM.
                  </p>
                </div>
              </div>

              {/* Step 7 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">7</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Pengajuan selesai — sedang ditinjau</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Setelah submit, status return berubah jadi <span className="inline-block px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[0.78rem] font-medium text-amber-700">Menunggu</span>.
                    Admin EGLUX akan review dalam 1-2 hari kerja. Customer akan terima notifikasi via email + bell notifikasi saat status berubah.
                  </p>
                </div>
              </div>

              {/* Step 8 */}
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-eglux-primary text-white flex items-center justify-center text-[0.85rem] font-bold">8</div>
                <div className="flex-1 pt-1">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Pengembalian dana berhasil</p>
                  <p className="text-[0.82rem] text-gray-600 mt-1 leading-relaxed">
                    Setelah admin approve + return complete, status berubah jadi <span className="inline-block px-2 py-0.5 bg-green-50 border border-green-200 rounded text-[0.78rem] font-medium text-green-700">Selesai</span>.
                    Refund ditransfer ke metode yang dipilih (Bank / Poin EGLUX) sesuai estimasi waktu di bawah.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* === Section 3: Waktu Pemrosesan === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">⏱</span>
              Estimasi Waktu Pemrosesan
            </h2>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-[0.82rem]">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Tahap</th>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Estimasi</th>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Status</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Review admin</td>
                    <td className="px-4 py-2.5 font-medium text-amber-700">1 – 2 hari kerja</td>
                    <td className="px-4 py-2.5">Menunggu → Disetujui / Ditolak</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Pengiriman balik (jika perlu)</td>
                    <td className="px-4 py-2.5 font-medium text-amber-700">2 – 4 hari</td>
                    <td className="px-4 py-2.5">Dikirim Balik → Diterima</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Verifikasi &amp; approval</td>
                    <td className="px-4 py-2.5 font-medium text-green-700">1 hari kerja</td>
                    <td className="px-4 py-2.5">Diterima → Selesai</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Transfer refund (Bank)</td>
                    <td className="px-4 py-2.5 font-medium text-green-700">3 – 5 hari kerja</td>
                    <td className="px-4 py-2.5">via Midtrans GPN</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Refund ke Poin EGLUX</td>
                    <td className="px-4 py-2.5 font-medium text-green-700">Instant</td>
                    <td className="px-4 py-2.5">Auto-credit ke akun</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[0.75rem] text-gray-500 mt-2 italic">
              * Estimasi selesai paling lambat 5-7 hari kerja sejak status "Selesai". Waktu pasti tergantung pada bank atau pihak terkait.
            </p>
          </section>

          {/* === Section 4: Solusi yang Ditawarkan === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">💰</span>
              Solusi yang Ditawarkan Admin
            </h2>
            <p className="text-[0.88rem] text-gray-700 leading-relaxed mb-4">
              Sesuai <strong className="font-semibold text-gray-900">Syarat &amp; Ketentuan</strong> di atas, refund dihitung <strong className="font-semibold text-gray-900">proporsional sesuai jumlah item yang rusak</strong>, bukan 100% dari nilai total order. Setelah review, admin EGLUX akan menawarkan salah satu solusi berikut. Customer dapat menerima atau diskusi ulang dengan CS kalau ada concern.
            </p>
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Refund Proporsional (per item rusak)</p>
                  <span className="text-[0.7rem] bg-amber-50 text-amber-700 px-2 py-0.5 rounded">Default</span>
                </div>
                <p className="text-[0.8rem] text-gray-600 leading-relaxed">
                  Refund dihitung berdasarkan harga item yang rusak saja. Kalau order
                  berisi 5 item dan 2 rusak, refund hanya untuk 2 item tersebut — bukan
                  5 item. Customer tetap simpan produk yang tidak rusak. Tidak perlu
                  kirim balik produk (kecuali admin minta untuk verifikasi).
                </p>
              </div>
              <div className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Refund + Return</p>
                  <span className="text-[0.7rem] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">Kirim balik</span>
                </div>
                <p className="text-[0.8rem] text-gray-600 leading-relaxed">
                  Produk dikirim balik ke EGLUX, setelah diterima dan diverifikasi
                  admin (1-2 hari kerja), refund proporsional diproses sesuai harga
                  item yang rusak. Customer bayar ongkir kirim balik (atau seller
                  tanggung, tergantung keputusan admin). Cocok untuk kasus salah kirim
                  atau barang kurang yang butuh verifikasi fisik.
                </p>
              </div>
              <div className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Exchange (Ganti Produk)</p>
                  <span className="text-[0.7rem] bg-blue-50 text-blue-700 px-2 py-0.5 rounded">Ganti Baru</span>
                </div>
                <p className="text-[0.8rem] text-gray-600 leading-relaxed">
                  EGLUX kirim produk pengganti untuk item yang rusak (atau beda dengan
                  hitung price difference kalau customer mau switch varian). Customer
                  kirim balik item rusak. Ongkir kirim balik + kirim produk baru
                  ditanggung sesuai keputusan admin.
                </p>
              </div>
              <div className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[0.9rem] font-semibold text-gray-900">Partial Refund (Custom Amount)</p>
                  <span className="text-[0.7rem] bg-purple-50 text-purple-700 px-2 py-0.5 rounded">Custom</span>
                </div>
                <p className="text-[0.8rem] text-gray-600 leading-relaxed">
                  Admin set nominal refund custom (lebih kecil dari harga item) untuk
                  kasus kerusakan ringan yang masih bisa dipakai. Customer tetap simpan
                  produk. Cocok untuk cac kecil (goresan kecil, kemasan penyok) yang
                  tidak mengganggu fungsi produk.
                </p>
              </div>
            </div>
            <p className="text-[0.78rem] text-gray-500 mt-4 italic">
              * Untuk kasus <strong className="text-gray-700">seluruh paket rusak</strong> (mis. paket
              hancur total di pengiriman), refund dapat diberikan 100% dari nilai order
              setelah verifikasi admin + bukti video unboxing yang lengkap.
            </p>
          </section>

          {/* === Section 5: Kondisi yang Tidak Diterima === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">⚠️</span>
              Kondisi yang Tidak Diterima
            </h2>
            <div className="bg-red-50/40 rounded-lg border border-red-100 p-5">
              <ul className="space-y-2 text-[0.82rem] text-gray-700">
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Produk yang tidak rusak — kebijakan ini berlaku khusus untuk kerusakan akibat pengiriman atau cacat produksi.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Tidak menyertakan video unboxing dan bukti foto kerusakan yang jelas.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Input nominal refund tanpa konfirmasi CS EGLUX terlebih dahulu.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Retur seluruh paket kalau hanya sebagian rusak — refund dihitung proporsional per item.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Pengajuan lewat dari window 3 hari kerja tanpa perjanjian khusus dengan CS.</span>
                </li>
                <li className="flex gap-2.5">
                  <span className="text-red-500 mt-0.5">✕</span>
                  <span>Produk sudah dipakai dan menunjukkan tanda penggunaan berlebihan (bukan manufacturing defect).</span>
                </li>
              </ul>
            </div>
          </section>

          {/* === CTA === */}
          <div className="mt-12 p-5 bg-gray-50 rounded-lg border border-gray-100 text-center">
            <p className="text-[0.85rem] text-gray-700 mb-3">
              Punya pertanyaan atau mau ajukan return sekarang?
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link to="/contact" className="inline-block px-5 py-2 bg-eglux-primary text-white text-[0.85rem] font-medium rounded-md hover:bg-eglux-primary/90 transition-colors">
                Hubungi Tim CS EGLUX
              </Link>
              <Link to="/order-history" className="inline-block px-5 py-2 bg-white text-eglux-primary border border-eglux-primary text-[0.85rem] font-medium rounded-md hover:bg-eglux-primary/5 transition-colors">
                Lihat Pesanan Saya
              </Link>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </>
  );
};

export default ReturnPolicyPage;
