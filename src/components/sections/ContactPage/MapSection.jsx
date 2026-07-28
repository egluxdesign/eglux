// src/components/sections/ContactPage/MapSection.jsx
// ============================================================================
// MapSection — Google Maps embed, fetch URL dari Supabase DB
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const DEFAULT_MAP_URL = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d991.7061660412495!2d106.65768396459923!3d-6.154221253975215!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69f9f0da4e0c1f%3A0x3a6347038a93c4fe!2sEGLUX%20Warehouse!5e0!3m2!1sen!2sid!4v1780385351858!5m2!1sen!2sid';

const MapSection = () => {
  const [mapUrl, setMapUrl] = useState(DEFAULT_MAP_URL);

  const fetchContent = useCallback(async () => {
    try {
      const { data: dbData } = await supabase
        .from('contact_content')
        .select('map_embed_url')
        .eq('id', 1)
        .single();
      if (dbData?.map_embed_url) {
        setMapUrl(dbData.map_embed_url);
      }
    } catch (e) {
      // fallback to default
    }
  }, []);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  if (!mapUrl) return null;

  return (
    <section className="map-section">
      <div className="container">
        <div className="section-header">
          <h2>Lokasi Kami</h2>
          <p>Kunjungi kantor pusat Eglux</p>
        </div>
        <div className="map-container">
          <iframe
            src={mapUrl}
            width="600"
            height="450"
            style={{ border: 0 }}
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
};

export default MapSection;
