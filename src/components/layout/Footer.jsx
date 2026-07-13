// src/components/layout/Footer.jsx
import { Link } from 'react-router-dom';
import { FOOTER_LINKS } from '../../data';
import logo2 from '/src/assets/img/Logo2.png';

// Helper: cek apakah link internal (dimulai dengan /) atau external (http)
const isInternalLink = (href) => href && href.startsWith('/');

// Footer link group — pakai <Link to> untuk internal, <a href> untuk external
const FooterLinkGroup = ({ title, links }) => (
  <div>
    <h4 className="text-white text-base font-semibold mb-5">{title}</h4>
    <ul className="list-none space-y-1">
      {links.map((link) => (
        <li key={link.href + link.label}>
          {isInternalLink(link.href) ? (
            <Link
              to={link.href}
              className="inline-flex items-center text-white/70 no-underline text-[0.9rem] py-1.5 min-h-[36px] transition-colors duration-300 hover:text-eglux-primary"
            >
              {link.label}
            </Link>
          ) : (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-white/70 no-underline text-[0.9rem] py-1.5 min-h-[36px] transition-colors duration-300 hover:text-eglux-primary"
            >
              {link.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  </div>
);

const Footer = () => (
  <footer className="bg-eglux-secondary text-white pt-16 pb-8">
    <div className="max-w-container mx-auto px-4 md:px-8">

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr] gap-8 md:gap-12 mb-12">

        {/* Brand */}
        <div className="col-span-2 lg:col-span-1">
          <Link to="/" aria-label="EGLUX Beranda">
            {/* TODO: Ganti dengan URL Supabase Storage
                supabase.storage.from('eglux-assets').getPublicUrl('Logo2.png') */}
            <img src={logo2} alt="Eglux Logo" className="h-[60px] w-auto mb-4" />
          </Link>
          <p className="text-white/70 text-[0.9rem] leading-7 mt-4">
            Membangun produk rumah tangga yang praktis dan dapat diandalkan.
            Keindahan bertemu fungsionalitas dalam setiap produk Eglux.
          </p>
        </div>

        <FooterLinkGroup title="Navigasi" links={FOOTER_LINKS.navigasi} />
        <FooterLinkGroup title="Kategori" links={FOOTER_LINKS.kategori} />
        <FooterLinkGroup title="Bantuan"  links={FOOTER_LINKS.bantuan}  />
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10 pt-8 text-center text-white/50 text-[0.85rem]">
        &copy; 2026 Eglux — All rights reserved.
      </div>
    </div>
  </footer>
);

export default Footer;
