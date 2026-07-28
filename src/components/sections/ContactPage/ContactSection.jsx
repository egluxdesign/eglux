// src/components/sections/ContactPage/ContactSection.jsx
// ============================================================================
// ContactSection — Info kontak + Map (2 column layout, 1 section)
// Fetch dari Supabase DB (contact_content table). Tanpa form email.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const DEFAULT_DATA = {
  address: 'Jl. Pembangunan I No.282, RT.001/RW.003, Batujaya, Kec. Batuceper, Kota Tangerang, Banten 15121',
  phone: '+62 811-8988-301 (WA)',
  email: 'contact@eglux.co.id',
  operating_hours: 'Senin - Jumat: 09:00 - 17:00 WIB',
  map_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d991.7061660412495!2d106.65768396459923!3d-6.154221253975215!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69f9f0da4e0c1f%3A0x3a6347038a93c4fe!2sEGLUX%20Warehouse!5e0!3m2!1sen!2sid!4v1780385351858!5m2!1sen!2sid',
};

const ContactSection = () => {
  const [data, setData] = useState(DEFAULT_DATA);

  const fetchContent = useCallback(async () => {
    try {
      const { data: dbData } = await supabase
        .from('contact_content')
        .select('address, phone, email, operating_hours, map_embed_url')
        .eq('id', 1)
        .single();
      if (dbData) {
        setData({
          address: dbData.address || DEFAULT_DATA.address,
          phone: dbData.phone || DEFAULT_DATA.phone,
          email: dbData.email || DEFAULT_DATA.email,
          operating_hours: dbData.operating_hours || DEFAULT_DATA.operating_hours,
          map_embed_url: dbData.map_embed_url || DEFAULT_DATA.map_embed_url,
        });
      }
    } catch (e) {
      // fallback to defaults
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return (
    <section className="contact-section">
      <div className="container">
        <div className="contact-grid">
          {/* === LEFT: Info Kontak === */}
          <div className="contact-info">
            <h2>Informasi Kontak</h2>
            <p>Tim layanan pelanggan kami siap membantu Anda. Jangan ragu untuk menghubungi kami melalui salah satu saluran di bawah ini.</p>

            <div className="info-item">
              <div className="info-icon">📍</div>
              <div className="info-text">
                <h4>Alamat</h4>
                <p>{data.address}</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">📞</div>
              <div className="info-text">
                <h4>Telepon</h4>
                <p>{data.phone}</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">✉️</div>
              <div className="info-text">
                <h4>Email</h4>
                <p>{data.email}</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">🕐</div>
              <div className="info-text">
                <h4>Jam Operasional</h4>
                <p>{data.operating_hours}</p>
              </div>
            </div>
          </div>

          {/* === RIGHT: Map === */}
          <div className="contact-form">
            <h3>Lokasi Kami</h3>
            {data.map_embed_url && (
              <div className="map-container" style={{ marginTop: '1rem' }}>
                <iframe
                  src={data.map_embed_url}
                  width="100%"
                  height="400"
                  style={{ border: 0, borderRadius: '12px' }}
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
