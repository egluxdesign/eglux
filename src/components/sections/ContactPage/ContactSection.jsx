import React, { useState, useRef } from 'react';

const VITE_GAS_URL_CONTACT =
  'https://script.google.com/macros/s/AKfycbzq3JYaoG4hAwflfQVNhZrcsKflw5htI9SsNnW-9NZgDIcp3SojybpafAEOoEFw8zxc/exec';

const ContactSection = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const formRef = useRef(null);
  const successRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessVisible(false);
    setErrorVisible(false);

    const form = formRef.current;
    if (!form) return;

    const nameVal = form.elements.namedItem('name').value.trim();
    const emailVal = form.elements.namedItem('email').value.trim();
    const subjectVal = form.elements.namedItem('subject').value;
    const messageVal = form.elements.namedItem('message').value.trim();

    if (!nameVal || !emailVal || !messageVal) {
      alert('Mohon lengkapi semua field yang wajib diisi.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      alert('Format email tidak valid.');
      return;
    }

    const now = new Date();
    const pad = (n) => n < 10 ? '0' + n : n;
    const timestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const formData = {
      timestamp,
      name: nameVal,
      email: emailVal,
      subject: subjectVal,
      message: messageVal
    };

    setIsSubmitting(true);

    try {
      await fetch(VITE_GAS_URL_PRODUCT, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
    } catch (err) {
      console.warn('Fetch error (no-cors):', err);
    } finally {
      setIsSubmitting(false);
      setSuccessVisible(true);
      form.reset();
      setTimeout(() => successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      setTimeout(() => setSuccessVisible(false), 8000);
    }
  };

  return (
    <section className="contact-section">
      <div className="container">
        <div className="contact-grid">
          <div className="contact-info">
            <h2>Informasi Kontak</h2>
            <p>Tim layanan pelanggan kami siap membantu Anda. Jangan ragu untuk menghubungi kami melalui salah satu saluran di bawah ini.</p>

            <div className="info-item">
              <div className="info-icon">📍</div>
              <div className="info-text">
                <h4>Alamat</h4>
                <p>Jl. Pembangunan I No.282, RT.001/RW.003, Batujaya, Kec. Batuceper, Kota Tangerang, Banten 15121</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">📞</div>
              <div className="info-text">
                <h4>Telepon</h4>
                <p>+62 811-8988-301 (WA)</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">✉️</div>
              <div className="info-text">
                <h4>Email</h4>
                <p>contact@eglux.co.id</p>
              </div>
            </div>

            <div className="info-item">
              <div className="info-icon">🕐</div>
              <div className="info-text">
                <h4>Jam Operasional</h4>
                <p>Senin - Jumat: 09:00 - 17:00 WIB</p>
              </div>
            </div>
          </div>

          <div className="contact-form">
            <h3>Kirim Pesan</h3>

            <div
              ref={successRef}
              className="success-message"
              style={{ display: successVisible ? 'block' : 'none' }}
            >
              ✅ Terima kasih! Pesan Anda telah terkirim. Tim kami akan menghubungi Anda segera.
            </div>
            <div
              className="error-message"
              style={{ display: errorVisible ? 'block' : 'none' }}
            >
              ❌ {errorMsg}
            </div>

            <form ref={formRef} onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="name">Nama Lengkap *</label>
                  <input type="text" id="name" name="name" placeholder="Nama Anda" required />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input type="email" id="email" name="email" placeholder="email@example.com" required />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="subject">Subjek</label>
                <select id="subject" name="subject">
                  <option value="Pertanyaan Umum">Pertanyaan Umum</option>
                  <option value="Informasi Produk">Informasi Produk</option>
                  <option value="Status Pesanan">Status Pesanan</option>
                  <option value="Dukungan Teknis">Dukungan Teknis</option>
                  <option value="Kerja Sama">Kerja Sama</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="message">Pesan *</label>
                <textarea id="message" name="message" placeholder="Tulis pesan Anda di sini..." required />
              </div>
              <button type="submit" className="btn btn-primary submit-btn" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="spinner"></span>
                    Mengirim...
                  </>
                ) : (
                  'Kirim Pesan'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;