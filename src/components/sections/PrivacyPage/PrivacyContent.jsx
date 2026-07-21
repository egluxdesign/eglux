// src/components/sections/PrivacyPage/PrivacyContent.jsx
const PrivacyContent = () => (
  <section className="w-full py-12 md:py-16">
    <div className="max-w-container mx-auto px-4 md:px-8 max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold text-eglux-primary mb-2">Kebijakan Privasi</h1>
      <p className="text-sm text-gray-400 mb-8">Terakhir diperbarui: Juli 2026</p>

      <div className="prose prose-sm md:prose-base max-w-none text-gray-700 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Komitmen Kami</h2>
          <p>
            EGLUX menghargai privasi pelanggan kami. Kebijakan ini menjelaskan data apa saja
            yang kami kumpulkan, untuk apa data itu digunakan, dan bagaimana kami menjaganya.
            Kebijakan ini berlaku untuk seluruh pengunjung situs eglux.co.id, pembeli, dan
            siapa pun yang menghubungi kami melalui saluran resmi EGLUX.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Data yang Kami Kumpulkan</h2>
          <p>Saat kamu membuat akun, berbelanja, atau menghubungi kami, kami dapat mengumpulkan:</p>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            <li>Nama lengkap, alamat email, dan nomor WhatsApp</li>
            <li>Alamat pengiriman untuk keperluan pengiriman pesanan</li>
            <li>Riwayat pesanan, termasuk produk yang dibeli dan status pembayaran</li>
            <li>Informasi pembayaran diproses oleh mitra pembayaran kami (Midtrans) — EGLUX tidak
              menyimpan detail kartu kredit/debit kamu secara langsung</li>
            <li>Foto/video lampiran yang kamu kirim saat mengajukan tiket bantuan</li>
            <li>Informasi teknis standar (alamat IP, jenis browser) untuk keperluan keamanan
              dan perbaikan layanan</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Bagaimana Kami Menggunakan Data Kamu</h2>
          <p>Data yang kami kumpulkan digunakan untuk:</p>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            <li>Memproses dan mengirimkan pesanan kamu</li>
            <li>Mengirim notifikasi status pesanan melalui email dan/atau WhatsApp</li>
            <li>Merespons pertanyaan dan tiket bantuan yang kamu ajukan</li>
            <li>Mengirim newsletter dan penawaran promosi (hanya jika kamu berlangganan)</li>
            <li>Meningkatkan kualitas produk dan layanan kami</li>
            <li>Memenuhi kewajiban hukum yang berlaku</li>
          </ul>
          <p className="mt-2">
            Kami tidak menjual data pribadi kamu, dan tidak membagikannya ke pihak ketiga untuk
            keperluan pemasaran di luar yang disebutkan dalam kebijakan ini.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Pihak Ketiga yang Kami Gunakan</h2>
          <p>Untuk menjalankan layanan kami, EGLUX bekerja sama dengan penyedia layanan berikut:</p>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            <li><span className="font-semibold">Supabase</span> — penyimpanan data akun, pesanan, dan infrastruktur backend</li>
            <li><span className="font-semibold">Midtrans</span> — pemrosesan pembayaran online (kartu, e-wallet, QRIS, dll)</li>
            <li><span className="font-semibold">Biteship</span> — integrasi pengiriman dan pelacakan kurir</li>
            <li><span className="font-semibold">Resend</span> — pengiriman email transaksional (konfirmasi pesanan, tiket bantuan)</li>
            <li><span className="font-semibold">WhatsApp Business API</span> — notifikasi status pesanan via WhatsApp</li>
          </ul>
          <p className="mt-2">
            Setiap mitra di atas hanya menerima data yang diperlukan untuk menjalankan fungsinya
            masing-masing, dan tunduk pada kebijakan privasi mereka sendiri.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Cookies</h2>
          <p>
            Situs kami menggunakan cookies untuk menjaga sesi login kamu tetap aktif dan
            memastikan keranjang belanja tersimpan dengan baik. Kamu dapat mengatur preferensi
            cookies melalui pengaturan browser kamu.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Penyimpanan Data</h2>
          <p>
            Kami menyimpan data pribadi kamu selama akun kamu aktif, atau selama diperlukan
            untuk memenuhi tujuan yang dijelaskan dalam kebijakan ini, termasuk kewajiban
            perpajakan dan hukum yang berlaku di Indonesia.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Hak Kamu</h2>
          <p>Sesuai dengan Undang-Undang Perlindungan Data Pribadi (UU PDP) Republik Indonesia, kamu berhak untuk:</p>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            <li>Mengakses data pribadi yang kami simpan tentang kamu</li>
            <li>Meminta koreksi data yang tidak akurat</li>
            <li>Meminta penghapusan data pribadi kamu (dengan pengecualian data yang wajib
              disimpan untuk kepatuhan hukum, seperti riwayat transaksi)</li>
            <li>Menarik persetujuan atas pemrosesan data kapan saja</li>
            <li>Berhenti berlangganan newsletter kapan saja melalui link di setiap email</li>
          </ul>
          <p className="mt-2">
            Untuk menggunakan hak-hak ini, hubungi kami melalui email di{' '}
            <a href="mailto:contact@eglux.co.id" className="text-eglux-secondary underline">contact@eglux.co.id</a>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Keamanan Data</h2>
          <p>
            Kami menerapkan langkah-langkah teknis dan organisasional yang wajar untuk
            melindungi data pribadi kamu dari akses tidak sah, kehilangan, atau
            penyalahgunaan. Namun, tidak ada transmisi data melalui internet yang sepenuhnya
            aman, dan kami tidak dapat menjamin keamanan mutlak.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Perubahan Kebijakan</h2>
          <p>
            Kami dapat memperbarui kebijakan ini dari waktu ke waktu seiring perkembangan
            layanan kami. Perubahan signifikan akan diinformasikan dengan jelas. Tanggal di
            bagian atas halaman ini mencerminkan pembaruan terakhir.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-eglux-primary mb-2">Kontak</h2>
          <p>Email: <a href="mailto:contact@eglux.co.id" className="text-eglux-secondary underline">contact@eglux.co.id</a></p>
          <p className="mt-4 text-gray-500">
            [PT. Rayee International Trading]<br />
            [Jl. Pembangunan I No.282, RT.001/RW.003, Batujaya, Kec. Batuceper, Kota Tangerang, Banten 15121]
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default PrivacyContent;