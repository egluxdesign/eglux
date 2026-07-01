import React from 'react';

const MapSection = () => {
  return (
    <section className="map-section">
      <div className="container">
        <div className="section-header">
          <h2>Lokasi Kami</h2>
          <p>Kunjungi kantor pusat Eglux</p>
        </div>
        <div className="map-container">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d991.7061660412495!2d106.65768396459923!3d-6.154221253975215!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69f9f0da4e0c1f%3A0x3a6347038a93c4fe!2sEGLUX%20Warehouse!5e0!3m2!1sen!2sid!4v1780385351858!5m2!1sen!2sid"
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