// src/components/sections/ContactPage/FAQSection.jsx
// ============================================================================
// FAQSection — FAQ accordion, fetch dari Supabase DB
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const DEFAULT_FAQ = [
  { question: 'Berapa lama waktu pengiriman?', answer: 'Pengiriman biasanya memakan waktu 2-5 hari kerja untuk wilayah Jabodetabek dan 5-10 hari kerja untuk luar Jawa.' },
  { question: 'Apakah ada garansi untuk produk Eglux?', answer: 'Ya, semua produk Eglux dilengkapi dengan garansi 1 tahun untuk cacat manufaktur.' },
  { question: 'Bagaimana cara melakukan pengembalian produk?', answer: 'Anda dapat mengajukan pengembalian dalam waktu 7 hari setelah produk diterima.' },
  { question: 'Apakah Eglux melayani pembelian grosir?', answer: 'Ya, kami melayani pembelian grosir. Hubungi partnership@eglux.co.id.' },
  { question: 'Di mana saya bisa membeli produk Eglux?', answer: 'Produk Eglux tersedia di toko online resmi kami dan marketplace.' },
];

const FAQSection = () => {
  const [activeIndex, setActiveIndex] = useState(null);
  const [faqData, setFaqData] = useState(DEFAULT_FAQ);

  const fetchContent = useCallback(async () => {
    try {
      const { data: dbData } = await supabase
        .from('contact_content')
        .select('faq')
        .eq('id', 1)
        .single();
      if (dbData?.faq) {
        const parsed = typeof dbData.faq === 'string' ? JSON.parse(dbData.faq) : dbData.faq;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFaqData(parsed);
        }
      }
    } catch (e) {
      // fallback to defaults
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const toggleFAQ = (index) => {
    setActiveIndex(prev => (prev === index ? null : index));
  };

  if (faqData.length === 0) return null;

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
