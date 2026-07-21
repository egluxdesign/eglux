// src/components/layout/Footer.jsx
// ============================================================================
// Footer v3 — Everyday-style layout + Newsletter subscription
// ============================================================================
//
// Structure:
//   ┌─────────────────────────────────────────────────┐
//   │  Logo          │  Navigation   │  Social        │
//   │  Description   │  Links        │  Icons         │
//   ├─────────────────────────────────────────────────┤
//   │  Newsletter: "Tetap Update"                     │
//   │  Description + Email input + Subscribe button   │
//   │  Consent text                                   │
//   ├─────────────────────────────────────────────────┤
//   │  © 2026 EGLUX    │  Terms  │  Privacy           │
//   └─────────────────────────────────────────────────┘
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import logo2 from '/src/assets/img/Logo2.png';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Icons (line art, 1-color) ──
const IconInstagram = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const IconYouTube = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
  </svg>
);

const IconWhatsApp = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const IconTikTok = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const IconMail = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

// ── Social links data ──
const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://instagram.com/eglux', Icon: IconInstagram },
  { label: 'YouTube',   href: 'https://youtube.com/@eglux',  Icon: IconYouTube   },
  { label: 'WhatsApp',  href: 'https://wa.me/6281234567890', Icon: IconWhatsApp  },
  { label: 'TikTok',    href: 'https://tiktok.com/@eglux',   Icon: IconTikTok    },
];

// ── Navigation links data ──
const NAV_LINKS = [
  { label: 'Beranda',      href: '/'          },
  { label: 'Produk',       href: '/products'  },
  { label: 'Blog',         href: '/blog'      },
  { label: 'Tentang Kami', href: '/about'     },
  { label: 'Kontak',       href: '/contact'   },
  { label: 'Affiliate',    href: '/affiliate' },
];

const HELP_LINKS = [
  { label: 'Pesanan Saya',     href: '/orders'         },
  { label: 'Lacak Pesanan',    href: '/track'          },
  { label: 'Riwayat Order',    href: '/order-history'  },
  { label: 'Tiket Bantuan',    href: '/tickets'        },
  { label: 'Pengiriman',       href: '/contact?section=shipping' },
  { label: 'Kebijakan Return', href: '/contact?section=returns'  },
];

// ── Helper: cek internal vs external link ──
const isInternalLink = (href) => href && href.startsWith('/');

const Footer = () => {
  // ── Newsletter state ──
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: string }
  const [agreed, setAgreed] = useState(false);

  const handleSubscribe = async () => {
    // Validate
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Email wajib diisi' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: 'error', text: 'Format email tidak valid' });
      return;
    }
    if (!agreed) {
      setMessage({ type: 'error', text: 'Centang persetujuan untuk subscribe' });
      return;
    }

    setSubscribing(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke('subscribe-newsletter', {
        body: { email: email.trim().toLowerCase(), source: 'footer' },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Gagal subscribe');

      setMessage({ type: 'success', text: data.message || 'Berhasil subscribe!' });
      setEmail('');
      setAgreed(false);
    } catch (e) {
      const msg = e.message?.includes('Failed to fetch')
        ? 'Gagal terhubung ke server. Coba lagi.'
        : e.message;
      setMessage({ type: 'error', text: msg });
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer className="bg-[#554521] text-white">
      {/* === Main grid: Logo + Nav + Social === */}
      <div className="max-w-container mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-6">

          {/* Logo + Description (col-span-3) */}
          <div className="md:col-span-3 lg:col-span-2">
            <Link to="/" aria-label="EGLUX Beranda">
              <img src={logo2} alt="Eglux Logo" className="h-[48px] w-auto mb-4" />
            </Link>
            <p className="text-white/50 text-[0.82rem] leading-relaxed">
              Produk rumah tangga & dapur berkualitas.
              Keindahan bertemu fungsionalitas.
            </p>
          </div>

          {/* Navigation links (col-span-2) */}
          <div className="md:col-span-2 lg:col-span-2">
            <h4 className="text-white/80 text-[0.78rem] font-semibold uppercase tracking-wide mb-4">Navigasi</h4>
            <ul className="space-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href + link.label}>
                  {isInternalLink(link.href) ? (
                    <Link
                      to={link.href}
                      className="text-white/50 text-[0.82rem] no-underline transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/50 text-[0.82rem] no-underline transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Help links (col-span-2) */}
          <div className="md:col-span-2 lg:col-span-2">
            <h4 className="text-white/80 text-[0.78rem] font-semibold uppercase tracking-wide mb-4">Bantuan</h4>
            <ul className="space-y-2">
              {HELP_LINKS.map((link) => (
                <li key={link.href + link.label}>
                  {isInternalLink(link.href) ? (
                    <Link
                      to={link.href}
                      className="text-white/50 text-[0.82rem] no-underline transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/50 text-[0.82rem] no-underline transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Social (col-span-2) */}
          <div className="md:col-span-2 lg:col-span-2">
            <h4 className="text-white/80 text-[0.78rem] font-semibold uppercase tracking-wide mb-4">Ikuti Kami</h4>
            <div className="flex gap-3">
              {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white/50 transition-all hover:text-white hover:border-white/40"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Newsletter (col-span-3) */}
          <div className="md:col-span-3 lg:col-span-4">
            <h4 className="text-white text-[1rem] font-bold mb-2">Tetap Update</h4>
            <p className="text-white/50 text-[0.82rem] leading-relaxed mb-4">
              Jadilah yang pertama menerima penawaran dan update produk terbaru dari EGLUX.
            </p>

            {/* Email input + Subscribe button */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                  <IconMail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubscribe()}
                  placeholder="Email kamu"
                  disabled={subscribing}
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/15 rounded-lg text-white text-[0.85rem] placeholder:text-white/30 outline-none focus:border-eglux-secondary/50 transition-colors"
                />
              </div>
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="px-5 py-2.5 bg-eglux-secondary text-white rounded-lg text-[0.82rem] font-semibold hover:opacity-90 transition-opacity cursor-pointer border-none disabled:opacity-50 whitespace-nowrap"
              >
                {subscribing ? '⏳' : 'Subscribe'}
              </button>
            </div>

            {/* Consent checkbox */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 cursor-pointer accent-eglux-secondary"
              />
              <span className="text-white/40 text-[0.7rem] leading-relaxed">
                Dengan klik Subscribe, saya setuju menerima newsletter EGLUX dengan update produk dan berita.
                Saya bisa unsubscribe kapan saja via link di setiap email. Lihat{' '}
                <a href="/privacy" className="text-white/60 underline hover:text-white">Privacy Policy</a>{' '}
                untuk info lebih lanjut.
              </span>
            </label>

            {/* Success / Error message */}
            {message && (
              <p className={`mt-3 text-[0.78rem] font-medium ${
                message.type === 'success' ? 'text-green-400' : 'text-red-400'
              }`}>
                {message.type === 'success' ? '✓ ' : '⚠ '}{message.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* === Bottom bar === */}
      <div className="border-t border-white/10">
        <div className="max-w-container mx-auto px-4 md:px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-white/40 text-[0.78rem]">
            © 2026 EGLUX — All rights reserved.
          </p>
          <div className="flex items-center gap-5">
            <a href="/terms" className="text-white/40 text-[0.78rem] no-underline transition-colors hover:text-white/70">
              Terms of Use
            </a>
            <a href="/privacy" className="text-white/40 text-[0.78rem] no-underline transition-colors hover:text-white/70">
              Privacy & Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
