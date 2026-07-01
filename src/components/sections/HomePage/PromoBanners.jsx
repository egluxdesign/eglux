// src/components/sections/PromoBanners.jsx
// Menampilkan satu atau dua promo banner dari data/index.js
// TODO: Konten banner (judul, deskripsi, gambar) bisa di-fetch dari tabel `banners` Supabase
import { PROMO_BANNERS } from '../../../data';

const overlayStyles = {
  primary: 'linear-gradient(135deg, rgba(85,69,33,0.85) 0%, rgba(85,69,33,0.5) 50%, rgba(203,166,90,0.3) 100%)',
  dark:    'linear-gradient(135deg, rgba(26,26,46,0.85) 0%, rgba(26,26,46,0.5) 50%, rgba(203,166,90,0.3) 100%)',
};

const BannerCard = ({ banner }) => {
  const { tag, title, desc, cta, href, variant, image, tall } = banner;

  return (
    <div
      className={`banner-card relative w-full rounded-2xl overflow-hidden cursor-pointer
                  transition-all duration-300 hover:-translate-y-1 hover:shadow-banner-hover
                  ${tall ? 'h-[180px] md:h-[260px] lg:h-[280px]' : 'h-[170px] md:h-[220px] lg:h-[240px]'}`}
      onClick={() => window.location.href = href}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && (window.location.href = href)}
      aria-label={title}
    >
      {/* Background Image
          TODO: `image` akan dari Supabase Storage
          supabase.storage.from('banners').getPublicUrl(banner.image_path) */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-[600ms] hover:scale-[1.08]"
        style={{ backgroundImage: `url('${image}')` }}
        aria-hidden="true"
      />

      {/* Overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{ background: overlayStyles[variant] }}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-7 md:p-10 z-[2] text-white">
        <span
          className="inline-block bg-eglux-secondary text-white text-[0.75rem] font-semibold
                     uppercase tracking-[1.5px] py-1.5 px-4 rounded-full mb-3"
        >
          {tag}
        </span>
        <h3 className="font-playfair text-[1.3rem] md:text-[2rem] lg:text-[2.4rem] font-bold mb-1
                       [text-shadow:0_2px_10px_rgba(0,0,0,0.3)]">
          {title}
        </h3>
        <p className="text-[0.85rem] md:text-[1.05rem] opacity-90 mb-3">{desc}</p>
        <span
          className="banner-cta inline-flex items-center gap-1.5 text-[0.8rem] md:text-[0.9rem]
                     font-semibold uppercase tracking-[2px] text-eglux-secondary
                     transition-all duration-300"
        >
          {cta} →
        </span>
      </div>
    </div>
  );
};

const PromoBanners = () => (
  <>
    {PROMO_BANNERS.map((banner, i) => (
      <section
        key={banner.id}
        className={`py-8 ${i % 2 === 0 ? 'bg-eglux-light' : 'bg-white'}`}
      >
        <div className="max-w-container mx-auto px-8">
          <BannerCard banner={banner} />
        </div>
      </section>
    ))}
  </>
);

export default PromoBanners;
