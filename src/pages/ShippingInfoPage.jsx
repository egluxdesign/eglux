// src/pages/ShippingInfoPage.jsx
// ============================================================================
// ShippingInfoPage — Info pengiriman EGLUX (static content, Option A)
// ============================================================================
// Content hardcoded. Kalau perlu update, edit file ini → commit → deploy.
// Future: bisa upgrade ke Option C (DB-driven dengan default fallback)
// dengan fetch dari app_settings table (lihat pattern AboutPage.jsx).
// ============================================================================

import React from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { Link } from 'react-router-dom';

const ShippingInfoPage = () => {
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
            <span className="text-gray-800 font-medium">Info Pengiriman</span>
          </nav>

          {/* === Header === */}
          <header className="mb-10 border-b border-gray-100 pb-6">
            <h1 className="text-[2rem] font-bold text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
              Info Pengiriman
            </h1>
            <p className="text-[0.9rem] text-gray-500">
              Estimasi waktu, area coverage, dan kurir partner EGLUX.
              Update terakhir: 15 September 2026.
            </p>
          </header>

          {/* === Section 1: Estimasi Pengiriman === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">1.</span>
              Estimasi Waktu Pengiriman
            </h2>
            <p className="text-[0.88rem] text-gray-700 leading-relaxed mb-4">
              Pesanan dikirim setelah pembayaran dikonfirmasi (otomatis untuk Midtrans)
              atau status berubah menjadi "processing". Estimasi waktu mulai dari
              saat paket di-pickup kurir, bukan dari saat order dibuat. Berikut
              estimasi per area geografis Indonesia:
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-[0.82rem]">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Area</th>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Estimasi (hari kerja)</th>
                    <th className="text-left px-4 py-2.5 font-medium border-b border-gray-100">Contoh Kota</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">JABODETABEK</td>
                    <td className="px-4 py-2.5 font-medium text-green-700">1 – 2 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Jakarta, Bogor, Depok, Tangerang, Bekasi</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Pulau Jawa</td>
                    <td className="px-4 py-2.5 font-medium text-green-700">2 – 4 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Bandung, Semarang, Yogyakarta, Surabaya</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Bali & Nusa Tenggara</td>
                    <td className="px-4 py-2.5 font-medium text-amber-700">3 – 5 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Denpasar, Mataram, Kupang</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Sumatera</td>
                    <td className="px-4 py-2.5 font-medium text-amber-700">3 – 5 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Medan, Palembang, Pekanbaru, Padang</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Kalimantan</td>
                    <td className="px-4 py-2.5 font-medium text-orange-700">4 – 6 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Banjarmasin, Samarinda, Pontianak</td>
                  </tr>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2.5">Sulawesi</td>
                    <td className="px-4 py-2.5 font-medium text-orange-700">4 – 7 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Makassar, Manado, Palu</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5">Indonesia Timur</td>
                    <td className="px-4 py-2.5 font-medium text-red-700">5 – 10 hari</td>
                    <td className="px-4 py-2.5 text-gray-500">Jayapura, Ambon, Manokwari, Sorong</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[0.75rem] text-gray-500 mt-2 italic">
              * Estimasi dapat berubah saat peak season (Lebaran, Natal, Tahun Baru)
              atau ada force majeure (bencana alam, kendala logistik kurir).
            </p>
          </section>

          {/* === Section 2: Kurir Partner === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">2.</span>
              Kurir Partner
            </h2>
            <p className="text-[0.88rem] text-gray-700 leading-relaxed mb-4">
              EGLUX bermitra dengan <span className="font-medium text-gray-900">Biteship</span> sebagai
              aggregator logistik, sehingga pelanggan dapat memilih dari berbagai
              kurir sesuai kebutuhan (reguler, express, instant, atau cargo). Saat
              checkout, sistem akan otomatis fetch live rate dari Biteship berdasarkan
              berat paket, dimensi, dan alamat tujuan, lalu menampilkan pilihan
              kurir beserta ongkir real-time. Kurir yang tersedia meliputi:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { name: 'JNE', service: 'REG, YES, OKE' },
                { name: 'J&T Express', service: 'EZ, CTL' },
                { name: 'SiCepat', service: 'REG, BEST, HALU' },
                { name: 'Ninja Xpress', service: 'Standard' },
                { name: 'AnterAja', service: 'Reguler, Next Day' },
                { name: 'POS Indonesia', service: 'Reguler, Kilat Khusus' },
                { name: 'Tiki', service: 'Reguler, Overnight' },
                { name: 'Lion Parcel', service: 'Regpack, Lion Fast' },
                { name: 'Wahana', service: 'Reguler' },
              ].map((c) => (
                <div key={c.name} className="border border-gray-100 rounded-md p-3 bg-gray-50/40">
                  <p className="text-[0.85rem] font-semibold text-gray-900">{c.name}</p>
                  <p className="text-[0.7rem] text-gray-500 mt-0.5">{c.service}</p>
                </div>
              ))}
            </div>
            <p className="text-[0.78rem] text-gray-600 mt-4 leading-relaxed">
              Tidak semua kurir tersedia di semua area. Saat checkout, sistem hanya
              menampilkan kurir yang melayani rute pengiriman ke alamat lu. Untuk
              pengiriman instant (sameday), tersedia via GoSend/GrabExpress di
              area JABODETABEK, Bandung, dan Surabaya.
            </p>
          </section>

          {/* === Section 3: Biaya Ongkir === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">3.</span>
              Biaya Pengiriman
            </h2>
            <p className="text-[0.88rem] text-gray-700 leading-relaxed mb-3">
              Ongkir dihitung otomatis saat checkout berdasarkan kombinasi faktor:
              berat paket (kg), dimensi volumetrik, jarak origin-destination, dan
              layanan kurir yang dipilih. Tidak ada markup dari EGLUX — yang
              tertera di invoice adalah rate resmi kurir.
            </p>
            <ul className="list-disc list-inside text-[0.82rem] text-gray-700 space-y-1.5 mb-3">
              <li>Origin pengiriman: <span className="font-medium">Jakarta</span> (warehouse EGLUX)</li>
              <li>Metric perhitungan: max(berat aktual, berat volumetrik = panjang × lebar × tinggi / 6000)</li>
              <li>Rate live dari Biteship, bisa berbeda setiap saat</li>
              <li>Free ongkir otomatis berlaku kalau ada promo (cek banner homepage untuk promo aktif)</li>
            </ul>
          </section>

          {/* === Section 4: Tracking === */}
          <section className="mb-10">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">4.</span>
              Lacak Pesanan
            </h2>
            <p className="text-[0.88rem] text-gray-700 leading-relaxed mb-3">
              Setelah paket di-pickup kurir, lu akan otomatis menerima nomor resi
              via email dan WhatsApp (kalau aktif). Status pengiriman dapat dilacak
              real-time via halaman <Link to="/track" className="text-eglux-primary underline hover:no-underline">Lacak Pesanan</Link> dengan
              input order ID atau nomor resi. Update tracking juga tersinkron
              otomatis di halaman <Link to="/order-history" className="text-eglux-primary underline hover:no-underline">Riwayat Pesanan</Link>.
            </p>
          </section>

          {/* === Section 5: FAQ singkat === */}
          <section className="mb-2">
            <h2 className="text-[1.15rem] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-eglux-primary">5.</span>
              Pertanyaan Umum
            </h2>
            <div className="space-y-3">
              <div className="border-l-2 border-eglux-primary/30 pl-3">
                <p className="text-[0.85rem] font-medium text-gray-900">Apakah EGLUX kirim ke luar negeri?</p>
                <p className="text-[0.8rem] text-gray-600 mt-1">Saat ini EGLUX baru melayani pengiriman ke seluruh Indonesia. Untuk international shipping, hubungi CS via halaman <Link to="/contact" className="text-eglux-primary underline">Kontak</Link>.</p>
              </div>
              <div className="border-l-2 border-eglux-primary/30 pl-3">
                <p className="text-[0.85rem] font-medium text-gray-900">Berapa lama order diproses sebelum dikirim?</p>
                <p className="text-[0.8rem] text-gray-600 mt-1">Order dengan pembayaran sukses sebelum 14:00 WIB akan diproses dan dikirim di hari yang sama. Order setelah jam 14:00 WIB atau weekend akan diproses di hari kerja berikutnya.</p>
              </div>
              <div className="border-l-2 border-eglux-primary/30 pl-3">
                <p className="text-[0.85rem] font-medium text-gray-900">Apakah alamat kantor bisa dipakai?</p>
                <p className="text-[0.8rem] text-gray-600 mt-1">Bisa. Saat checkout, pastikan alamat kantor lengkap dengan nama gedung, lantai, dan nama penerima (boleh nama sendiri atau rekan kerja). Untuk kantor yang butuh security check, tambahkan instruksi khusus di field catatan.</p>
              </div>
            </div>
          </section>

          {/* === CTA === */}
          <div className="mt-12 p-5 bg-gray-50 rounded-lg border border-gray-100 text-center">
            <p className="text-[0.85rem] text-gray-700 mb-3">
              Masih ada pertanyaan seputar pengiriman?
            </p>
            <Link to="/contact" className="inline-block px-5 py-2 bg-eglux-primary text-white text-[0.85rem] font-medium rounded-md hover:bg-eglux-primary/90 transition-colors">
              Hubungi Tim CS EGLUX
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </>
  );
};

export default ShippingInfoPage;
