// src/pages/MembershipPage.jsx
// ============================================================================
// MembershipPage — Page untuk join WhatsApp Exclusive Group
// ============================================================================
// Flow:
//   1. User isi Nama + No. WhatsApp
//   2. Klik "Join Group & Dapatkan Promo"
//   3. Nomor tersimpan di newsletter_subscribers (source='membership')
//   4. Redirect ke WhatsApp group invite link
//
// Layout: mirip BlogPage — header + hero + footer (simple, clean)
// ============================================================================

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { supabase } from '../lib/supabaseClient';
import '/src/assets/styles/eglux-design-system.css';

// ⭐ WhatsApp Group invite link — update kalau link berubah
const WA_GROUP_LINK = 'https://chat.whatsapp.com/JjbuZvAkRSA4yPL0E3aDRQ?s=qs&p=i&ilr=2';

const MembershipPage = () => {
  const { openCart } = useCartActions();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ⭐ NEW: Detect voucher code dari URL (?v=EGLUX2024)
  const voucherCode = searchParams.get('v') || '';

  useEffect(() => {
    if (voucherCode) {
    //   console.log('[Membership] Voucher code detected:', voucherCode);
    }
  }, [voucherCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate
    if (!name.trim()) {
      setError('Nama wajib diisi');
      return;
    }
    if (!phone.trim()) {
      setError('Nomor WhatsApp wajib diisi');
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      setError('Nomor WhatsApp tidak valid (minimal 8 digit)');
      return;
    }

    setLoading(true);

    try {
      // Normalize phone ke E.164 (+62xxx)
      let digits = phone.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = '62' + digits.slice(1);
      else if (!digits.startsWith('62')) digits = '62' + digits;
      const phoneE164 = `+${digits}`;

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscribe-newsletter`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phoneE164,
          name: name.trim(),
          email: `wa_${digits}@eglux.co.id`,
          source: 'membership',
          marketing_email_opt_in: false,
          marketing_wa_opt_in: true,
          voucher_code: voucherCode || null,  // ⭐ NEW: kirim voucher code ke backend
        }),
      });

      const result = await resp.json();

      if (!result.success) {
        // Kalau error "email already exists" → tetap redirect (user sudah subscribe sebelumnya)
        if (result.already_subscribed) {
          console.log('[Membership] User already subscribed — redirect to group');
        } else {
          throw new Error(result.error || 'Gagal mendaftar');
        }
      }

      setSuccess(true);

      // ⭐ Auto-redirect ke WhatsApp group setelah 1.5 detik
      setTimeout(() => {
        window.open(WA_GROUP_LINK, '_blank', 'noopener,noreferrer');
      }, 1500);
    } catch (e) {
      setError(e.message?.includes('Failed to fetch')
        ? 'Gagal terhubung ke server. Coba lagi.'
        : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      {/* Hero Section */}
      <section className="bg-white pt-24 md:pt-24 pb-4 md:pb-4">
        <div className="max-w-[1200px] mx-auto px-4 md:px-8 text-center">
          {/* Icon */}
          {/* <div className="w-20 h-20 md:w-24 md:h-24 bg-eglux-secondary rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 md:w-12 md:h-12 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
          </div>

          <h1 className="text-2xl md:text-4xl font-bold text-eglux-primary mb-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            EGLUX Exclusive Membership
          </h1>
          <p className="text-sm md:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Dapatkan penawaran eksklusif, diskon terbatas, dan promo khusus member langsung ke WhatsApp Anda.
          </p> */}

          {/* ⭐ NEW: Voucher Code Banner (kalau ?v= ada di URL) */}
          {voucherCode && (
            <div className="mt-6 inline-flex items-center gap-3 bg-eglux-secondary text-white px-6 py-3 rounded-full shadow-lg">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
              </svg>
              <div className="text-left">
                <p className="text-[0.65rem] uppercase tracking-wider opacity-80">Voucher Ditemukan</p>
                <p className="text-sm font-bold">{voucherCode}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Content Section */}
      <section className="bg-white py-12 md:py-20">
        <div className="max-w-2xl mx-auto px-4 md:px-8">

          {!success ? (
            <>
              {/* Form */}
              <div className="bg-eglux-accent rounded-2xl p-6 md:p-10 mb-8">
                <h2 className="text-lg md:text-xl font-bold text-eglux-primary mb-2">
                  Daftar & Join Group WhatsApp
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Isi data Anda untuk bergabung dengan grup WhatsApp EGLUX Exclusive Offers.
                </p>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Nama */}
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                      Nama <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Masukkan nama Anda"
                      required
                      disabled={loading}
                      className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
                      Nomor WhatsApp <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                      placeholder="08xxx atau 62xxx"
                      required
                      disabled={loading}
                      inputMode="numeric"
                      className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
                    />
                    <p className="text-[0.7rem] text-gray-400 mt-1">
                      Nomor ini akan kami gunakan untuk mengirim penawaran eksklusif via WhatsApp.
                    </p>
                  </div>

                  {/* Consent */}
                  <label className="flex items-start gap-2.5 cursor-pointer py-2">
                    <input
                      type="checkbox"
                      required
                      className="mt-0.5 w-4 h-4 cursor-pointer accent-eglux-secondary flex-shrink-0"
                    />
                    <span className="text-[0.72rem] text-gray-500 leading-relaxed">
                      Saya setuju untuk menerima penawaran eksklusif dan promo dari EGLUX melalui WhatsApp,
                      dan telah membaca serta menyetujui{' '}
                      <a href="/privacy" className="text-eglux-secondary underline hover:opacity-80">Privacy Policy</a>.
                    </span>
                  </label>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-eglux-secondary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                          <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                        Mendaftarkan...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                        </svg>
                        {voucherCode ? 'Klaim Voucher & Join Group' : 'Join Group & Dapatkan Promo'}
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Benefits */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-eglux-primary text-center mb-4">
                  Keuntungan Member EGLUX
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { icon: '⚡', title: 'Flash Sale Early Access', desc: 'Notifikasi flash sale langsung ke WA sebelum publik' },
                    { icon: '💰', title: 'Exclusive Discount Codes', desc: 'Kode promo khusus member, gak tersedia di website' },
                    { icon: '🚚', title: 'Free Shipping Vouchers', desc: 'Voucher ongkir gratis setiap bulan untuk member' },
                    { icon: '🎧', title: 'Priority Support', desc: 'Customer service priority via WhatsApp group' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl">
                      <span className="text-2xl flex-shrink-0">{item.icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-eglux-primary">{item.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Success Screen */
            <div className="bg-eglux-accent rounded-2xl p-8 md:p-12 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-eglux-primary mb-3">
                Pendaftaran Berhasil!
              </h2>

              {/* ⭐ Show voucher code sebagai reminder (kalau ada) */}
              {voucherCode && (
                <div className="mb-4 p-3 bg-eglux-accent rounded-lg border border-eglux-secondary/30">
                  <p className="text-xs text-gray-500 mb-1">Kode voucher Anda (untuk checkout):</p>
                  <p className="text-lg font-bold text-eglux-secondary tracking-wider">{voucherCode}</p>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                Anda akan diarahkan ke WhatsApp untuk bergabung dengan grup EGLUX Exclusive Offers.
              </p>
              <div className="animate-pulse text-eglux-secondary text-sm font-semibold mb-6">
                Mengalihkan ke WhatsApp...
              </div>
              <a
                href={WA_GROUP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-eglux-secondary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity cursor-pointer border-none no-underline"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.149-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                </svg>
                Buka WhatsApp Sekarang
              </a>
              <p className="text-[0.7rem] text-gray-400 mt-4">
                Kalau tidak otomatis terbuka, klik tombol di atas untuk join group.
              </p>
            </div>
          )}

        </div>
      </section>

      <Footer />
    </>
  );
};

export default MembershipPage;
