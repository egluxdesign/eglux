import React, { useState } from 'react';

const faqData = [
  {
    question: 'Berapa lama waktu pengiriman?',
    answer: 'Pengiriman biasanya memakan waktu 2-5 hari kerja untuk wilayah Jabodetabek dan 5-10 hari kerja untuk luar Jawa. Kami bekerja sama dengan jasa pengiriman terpercaya untuk memastikan produk sampai dengan aman.'
  },
  {
    question: 'Apakah ada garansi untuk produk Eglux?',
    answer: 'Ya, semua produk Eglux dilengkapi dengan garansi 1 tahun untuk cacat manufaktur. Garansi tidak mencakup kerusakan akibat penggunaan tidak wajar atau kecelakaan.'
  },
  {
    question: 'Bagaimana cara melakukan pengembalian produk?',
    answer: 'Anda dapat mengajukan pengembalian dalam waktu 7 hari setelah produk diterima. Produk harus dalam kondisi asli dengan kemasan lengkap. Hubungi layanan pelanggan kami untuk memulai proses pengembalian.'
  },
  {
    question: 'Apakah Eglux melayani pembelian grosir?',
    answer: 'Ya, kami melayani pembelian grosir dengan harga khusus untuk reseller dan distributor. Silakan hubungi tim partnership kami di partnership@eglux.co.id untuk informasi lebih lanjut.'
  },
  {
    question: 'Di mana saya bisa membeli produk Eglux?',
    answer: 'Produk Eglux tersedia di toko online resmi kami, marketplace seperti Tokopedia, Shopee, dan Bukalapak, serta toko retail mitra kami di berbagai kota besar Indonesia.'
  }
];

const FAQSection = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    setActiveIndex(prev => (prev === index ? null : index));
  };

  return (
    <section className="faq-section">
      <div className="container">
        <div className="section-header">
          <h2>Pertanyaan Umum</h2>
          <p>Jawaban untuk pertanyaan yang sering diajukan</p>
        </div>
        <div className="faq-grid">
          {faqData.map((item, index) => (
            <div
              key={index}
              className={`faq-item ${activeIndex === index ? 'active' : ''}`}
            >
              <div className="faq-question" onClick={() => toggleFAQ(index)}>
                <span>{item.question}</span>
                <span className="faq-icon">{activeIndex === index ? '−' : '+'}</span>
              </div>
              <div className="faq-answer">
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQSection;