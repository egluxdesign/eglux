// src/components/sections/Hero.jsx
import { HERO_DATA } from '../../../data';
import logo1 from '/src/assets/img/Logo2.png';

const Hero = () => {
  const { bgImage, logo1, subtitle, ctaLabel, ctaHref, tagline } = HERO_DATA;

  return (
    <>
      {/* ── Fullscreen Hero ── */}
      <section
        className="relative w-full h-[84vh] min-h-[600px] flex items-center justify-center
                   overflow-hidden bg-eglux-dark"
        aria-label="Hero Section"
      >
        {/* Background Image
            TODO: bgImage akan di-resolve dari Supabase Storage
            supabase.storage.from('eglux-assets').getPublicUrl('hero/heroBg.png') */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: `url('${bgImage}')` }}
          aria-hidden="true"
        />

        {/* Dark gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(135deg, rgba(26,26,46,0.1) 0%, rgba(26,26,46,0.3) 100%)' }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative z-10 text-center px-8">
          {/* Logo putih untuk hero
              TODO: Supabase Storage path untuk Logo2.png (logo putih/light) */}
          <a href="/" aria-label="EGLUX Beranda">
            <img
              src={logo1}
              alt="Eglux Logo"
              className="h-[75px] w-auto mx-auto mb-2"
            />
          </a>

          <p
            className="text-white/85 uppercase mt-4 mb-12 font-light
                       tracking-[5px] text-lg md:text-xl"
          >
            {subtitle}
          </p>

          <a
            href={ctaHref}
            className="shop-btn"
          >
            {ctaLabel}
          </a>
        </div>
      </section>

      {/* ── Tagline Strip ── */}
      <div className="bg-eglux-primary text-white text-center py-3 text-sm tracking-[2px] uppercase">
        {tagline}
      </div>
    </>
  );
};

export default Hero;
