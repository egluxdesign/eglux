// src/components/sections/TermsPage/TermsContent.jsx
const TermsContent = () => (
  <section className="w-full py-12 md:py-16">
    <div className="max-w-container mx-auto px-4 md:px-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold text-eglux-primary mb-2">Syarat & Ketentuan</h1>
      <p className="text-sm text-gray-400 mb-8">Terakhir diperbarui: Juli 2026</p>

      <div className="prose prose-sm md:prose-base max-w-none text-gray-700 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Gambaran Umum</h2>
          <p>
            Syarat & Ketentuan ini mengatur penggunaan situs EGLUX (eglux.co.id) dan seluruh
            produk atau layanan yang ditawarkan oleh EGLUX. Dengan mengakses situs ini, membuat
            akun, atau melakukan pembelian, anda setuju untuk terikat pada syarat dan ketentuan
            ini. Jika anda tidak setuju, mohon untuk tidak menggunakan situs ini.
          </p>
          <p>Syarat & Ketentuan ini tunduk pada hukum yang berlaku di Republik Indonesia.</p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Penggunaan Situs</h2>
          <p>Situs EGLUX ditujukan untuk keperluan informasi produk, pembuatan akun, dan pembelian produk rumah tangga & dapur. Anda setuju untuk tidak:</p>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            <li>Menggunakan situs untuk tujuan yang melanggar hukum atau peraturan yang berlaku</li>
            <li>Mencoba mengakses bagian mana pun dari sistem atau infrastruktur kami tanpa izin</li>
            <li>Menyalin, mendistribusikan, atau mengeksploitasi konten dari situs ini secara
              komersial tanpa izin tertulis</li>
            <li>Membuat pesanan palsu atau menyalahgunakan sistem promo/diskon</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Akun Pengguna</h2>
          <p>
            Untuk melakukan pemesanan, anda mungkin perlu membuat akun. Anda bertanggung jawab
            untuk menjaga kerahasiaan kredensial login anda dan seluruh aktivitas yang terjadi
            di bawah akun anda. Segera hubungi kami jika anda menduga ada penggunaan akun yang
            tidak sah.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Pemesanan & Harga</h2>
          <p>
            Seluruh harga yang tercantum di situs ini dalam mata uang Rupiah (IDR) dan belum
            termasuk ongkos kirim, kecuali dinyatakan lain. Kami berhak mengubah harga produk
            sewaktu-waktu tanpa pemberitahuan sebelumnya. Harga yang berlaku adalah harga yang
            tertera saat pesanan dikonfirmasi dan pembayaran diterima.
          </p>
          <p className="mt-2">
            Kami berhak membatalkan pesanan dalam kondisi tertentu, termasuk namun tidak
            terbatas pada: stok produk habis, kesalahan harga akibat kendala teknis, atau
            indikasi kecurangan pada transaksi.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Pembayaran</h2>
          <p>
            Pembayaran diproses melalui mitra pembayaran resmi kami, Midtrans, yang mendukung
            berbagai metode pembayaran (kartu kredit/debit, e-wallet, QRIS, transfer bank, dan
            lainnya). EGLUX tidak menyimpan detail kartu pembayaran anda secara langsung —
            seluruh data sensitif pembayaran diproses dan diamankan oleh Midtrans sesuai
            standar keamanan industri.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Pengiriman</h2>
          <p>
            Pengiriman produk dilakukan melalui mitra logistik pihak ketiga yang terintegrasi
            dengan Biteship. Estimasi waktu pengiriman yang ditampilkan bersifat perkiraan dan
            dapat berubah karena faktor di luar kendali kami (cuaca, kondisi jalan, kebijakan
            kurir, dll). EGLUX tidak bertanggung jawab atas keterlambatan yang disebabkan oleh
            pihak jasa kirim.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Pengembalian & Refund</h2>
          <p>
            Kebijakan pengembalian barang dan refund diatur secara terpisah. Silakan hubungi
            tim Customer Care kami melalui fitur Tiket Bantuan di akun anda, atau email ke{' '}
            <a href="mailto:contact@eglux.co.id" className="text-eglux-secondary underline">contact@eglux.co.id</a>{' '}
            untuk pengajuan retur atau komplain produk.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Hak Kekayaan Intelektual</h2>
          <p>
            Seluruh konten di situs ini — termasuk identitas merek, desain produk, fotografi,
            teks, dan perangkat lunak — merupakan kekayaan intelektual EGLUX atau pemberi
            lisensinya. Tidak ada bagian dari situs ini yang memberikan lisensi kepada anda
            untuk menggunakan konten tersebut kecuali dinyatakan secara eksplisit.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Batasan Tanggung Jawab</h2>
          <p>
            Sejauh diizinkan oleh hukum yang berlaku, EGLUX tidak bertanggung jawab atas
            kerugian tidak langsung, insidental, atau konsekuensial yang timbul dari penggunaan
            situs ini. Situs disediakan dalam kondisi "sebagaimana adanya", dan kami tidak
            menjamin situs akan selalu bebas dari gangguan atau kesalahan teknis.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Tautan Pihak Ketiga</h2>
          <p>
            Situs ini mungkin berisi tautan ke situs pihak ketiga. Tautan ini disediakan hanya
            untuk kemudahan anda. EGLUX tidak memiliki kendali atas, dan tidak bertanggung
            jawab terhadap, konten atau praktik dari situs pihak ketiga mana pun.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Perubahan Ketentuan</h2>
          <p>
            Kami dapat memperbarui Syarat & Ketentuan ini dari waktu ke waktu. Perubahan
            berlaku efektif sejak dipublikasikan di halaman ini. Penggunaan situs yang
            berkelanjutan setelah perubahan dipublikasikan merupakan bentuk persetujuan anda
            terhadap ketentuan yang telah direvisi.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Kontak</h2>
          <p>
            Ada pertanyaan soal Syarat & Ketentuan ini? Hubungi kami di{' '}
            <a href="mailto:contact@eglux.co.id" className="text-eglux-secondary underline">contact@eglux.co.id</a>.
          </p>
          <p className="mt-4 text-gray-500">
            [PT. Rayee International Trading]<br />
            [Jl. Pembangunan I No.282, RT.001/RW.003, Batujaya, Kec. Batuceper, Kota Tangerang, Banten 15121]
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default TermsContent;