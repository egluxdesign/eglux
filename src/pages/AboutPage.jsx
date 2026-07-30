// src/pages/AboutPage.jsx
// ============================================================================
// AboutPage — Layout identik dengan versi asli
// perubahan: header forceScrolled + content fetch dari DB
// ============================================================================

import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useCartActions } from './CartPage';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { supabase } from '../lib/supabaseClient';

import '/src/assets/styles/about.css';
import '/src/assets/styles/globals.css';

// ── Default content (fallback kalau DB kosong) ──
const DEFAULT_CONTENT = {
  hero_title: 'Tentang EGLUX',
  hero_subtitle: 'Produk Rumah Tangga & Dapur Berkualitas',
  hero_image_url: '',
  content_html: `
    <div class="about-grid">
      <div class="about-image">
        <img src="https://down-tx-id.img.susercontent.com/id-11134210-7rbk5-m6npp1bog9x0ec" alt="Eglux Office" />
      </div>
      <div class="about-text">
        <h2>Brand Eglux</h2>
        <p>Eglux didirikan pada tahun 2015 dengan visi untuk menciptakan produk rumah tangga yang tidak hanya fungsional tetapi juga estetis. Kami percaya bahwa setiap produk harus membawa keindahan dan kenyamanan ke dalam kehidupan sehari-hari.</p>
        <p>Dengan lebih dari 500 staf profesional, termasuk tim R&D dan desain yang berdedikasi, Eglux terus berinovasi untuk menghadirkan solusi penyimpanan dan organisasi terbaik untuk rumah Anda.</p>
        <blockquote>"Kami berkomitmen untuk merancang produk yang indah namun fungsional yang membawa kehidupan yang lebih baik bagi pelanggan kami."</blockquote>
        <p>Pabrik modern kami seluas lebih dari 40.000 meter persegi dilengkapi dengan teknologi manufaktur terkini, memastikan setiap produk memenuhi standar kualitas tertinggi.</p>
      </div>
    </div>
  `,
  stats: [
    { value: '2015', label: 'Tahun Berdiri' },
    { value: '500+', label: 'Staff Profesional' },
    { value: '40K+', label: 'm² Area Pabrik' },
    { value: '1M+', label: 'Pelanggan Puas' },
  ],
  leadership: [
    {
      name: 'Mr. Peter',
      role: 'Brand Owner',
      photo_url: 'https://thumbs2.imgbox.com/0a/ed/kinChrkY_t.jpeg',
      visi: 'Menjadi brand rumah tangga terkemuka yang menginspirasi kehidupan lebih baik melalui desain fungsional dan estetis untuk setiap rumah di Indonesia.',
      misi: [
        'Merancang produk yang menggabungkan fungsionalitas dan keindahan',
        'Menggunakan material berkualitas dengan proses produksi berkelanjutan',
        'Memberikan pengalaman pelanggan terbaik dari pembelian hingga purna jual',
        'Terus berinovasi mengikuti tren dan kebutuhan rumah modern',
      ],
      social_url: 'https://instagram.com/eglux_id',
    },
  ],
  timeline: [
    { year: '2015', title: 'Awal Mula Eglux', description: 'Eglux didirikan dengan visi menciptakan produk rumah tangga yang fungsional dan estetis.' },
    { year: '2017', title: 'Ekspansi Produk', description: 'Meluncurkan lini produk kitchen dan home decor pertama yang mendapat sambutan positif.' },
    { year: '2019', title: 'Pabrik Modern', description: 'Membangun pabrik seluas 40.000 m² dengan teknologi manufaktur terkini.' },
    { year: '2021', title: 'Go Digital', description: 'Memperluas reach melalui platform e-commerce dan media sosial.' },
    { year: '2023', title: '500+ Staff Profesional', description: 'Tim berkembang pesat dengan divisi R&D dan desain yang berdedikasi.' },
    { year: '2025', title: 'Menuju Masa Depan', description: 'Terus berinovasi untuk menghadirkan solusi hunian modern bagi keluarga Indonesia.' },
  ],
};

const AboutPage = () => {
  const { openCart } = useCartActions();
  const [content, setContent] = useState(DEFAULT_CONTENT);
  const [loading, setLoading] = useState(true);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('about_content')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) throw error;

      const parseJSON = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        try { return JSON.parse(val); } catch { return []; }
      };

      setContent({
        hero_title: data.hero_title || '',
        hero_subtitle: data.hero_subtitle || '',
        hero_image_url: data.hero_image_url || '',
        content_html: data.content_html || '',
        stats: parseJSON(data.stats),
        leadership: parseJSON(data.leadership),
        timeline: parseJSON(data.timeline),
      });
    } catch (e) {
      // Kalau DB belum di-setup, pakai default content
      setContent(DEFAULT_CONTENT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return (
    <>
      {/* ⭐ forceScrolled — header selalu putih */}
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <main>
        {/* === About Content Section === hidden kalau kosong */}
        {content.content_html && content.content_html.trim() && (
          <section className="about-content" style={{ paddingTop: '6rem' }}>
            <div className="container">
              <div
                className="about-content-dynamic"
                dangerouslySetInnerHTML={{ __html: content.content_html }}
              />
            </div>
          </section>
        )}

        {/* === Stats Section === hidden kalau kosong */}
        {content.stats.length > 0 && (
          <section className="stats-section">
            <div className="container">
              <div className="stats-grid">
                {content.stats.map((stat, index) => (
                  <div className="stat-item" key={index}>
                    <h3>{stat.value}</h3>
                    <p>{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* === Leadership Section === hidden kalau kosong */}
        {content.leadership.length > 0 && content.leadership.map((member, idx) => (
          <section className="team-section" key={idx}>
            <div className="container">
              <div className="section-header">
                <h2>Dedikasi untuk Menghadirkan Standar Hunian Modern</h2>
                <p>
                  Kami hadir mendefinisikan ulang standar rumah modern. Dipimping oleh
                  {' '}{member.name}, kami berdedikasi menciptakan inovasi produk berkualitas
                  tinggi yang fungsional, elegan, dan relevan dengan gaya hidup masa kini.
                </p>
              </div>

              <div className="leadership-card">
                <div className="leadership-left">
                  <span className="leadership-role">{member.role}</span>
                  <img
                    className="leadership-photo"
                    src={member.photo_url}
                    alt={member.name}
                    onError={(e) => e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200" fill="%23f0f0f0"%3E%3Ctext x="50%25" y="50%25" font-size="40" fill="%23ccc" text-anchor="middle" dy=".3em"%3E👤%3C/text%3E%3C/svg%3E'}
                  />
                  <span className="leadership-name">{member.name}</span>
                </div>

                <div className="leadership-right">
                  {member.visi && (
                    <>
                      <h3>Visi</h3>
                      <p>{member.visi}</p>
                    </>
                  )}
                  {member.misi && member.misi.length > 0 && (
                    <>
                      <h3>Misi</h3>
                      <ul>
                        {member.misi.map((item, i) => (
                          <li key={i}>{typeof item === 'string' ? item : item.text || ''}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {/* ⭐ Social media link (bukan bio) — sama seperti layout asli */}
                  {member.social_url && (
                    <a
                      href={member.social_url}
                      className="leadership-instagram"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                      </svg>
                      Connect With Us!
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* === Timeline Section === hidden kalau kosong */}
        {content.timeline.length > 0 && (
          <section className="timeline-section">
            <div className="container">
              <div className="section-header">
                <h2>Perjalanan Eglux</h2>
                <p>Dari awal yang sederhana hingga menjadi brand rumah tangga terpercaya</p>
              </div>
              <div className="timeline">
                {content.timeline.map((item, index) => (
                  <div className="timeline-item" key={index}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-year">{item.year}</div>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </>
  );
};

export default AboutPage;
