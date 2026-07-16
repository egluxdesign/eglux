// src/components/layout/SwiperContainer.jsx
// ============================================================================
// SwiperContainer — carousel banner/promo yang ditaruh di antara primary nav
// (top bubble) dan duplicate nav (content sticky). Berfungsi sebagai "jeda"
// antara dua navigasi ala Pomelo Fashion.
//
// Pakai library Swiper (https://swiperjs.com/) — install dulu:
//   npm install swiper
//
// Fitur:
//   - Autoplay (5 detik per slide, pause saat hover)
//   - Pagination dots (custom eglux theme)
//   - Navigation arrows (prev/next, hidden di mobile)
//   - Loop infinite
//   - Lazy load gambar
//   - Touch/swipe support (mobile-friendly)
//
// Pemakaian:
//   <SwiperContainer slides={bannerSlides} />
//
// Props:
//   slides: Array<{
//     id: string | number,
//     image: string (URL gambar),
//     title?: string,
//     subtitle?: string,
//     ctaText?: string,
//     ctaHref?: string,
//   }>
//   height?: string (default 'h-[280px] md:h-[400px]')
// ============================================================================

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination, Navigation, EffectFade, A11y } from 'swiper/modules';
import { Link } from 'react-router-dom';

import banner3 from '../../assets/img/banner-3.jpg';

// Import Swiper CSS — kalau pakai Vite, ini akan otomatis di-bundle
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import 'swiper/css/effect-fade';

// ── Default slides (contoh — bisa di-override via props) ──
const DEFAULT_SLIDES = [
  // {
  //   id: 1,
  //   image: '/src/assets/img/banner-1.jpg',
  //   title: 'Koleksi Baru',
  //   subtitle: 'Temukan gaya terbaru musim ini',
  //   ctaText: 'Belanja Sekarang',
  //   ctaHref: '/products',
  // },
  // {
  //   id: 2,
  //   image: '/src/assets/img/banner-2.jpg',
  //   title: 'Diskon Hingga 50%',
  //   subtitle: 'Promo spesial untuk member EGLUX',
  //   ctaText: 'Lihat Promo',
  //   ctaHref: '/sale',
  // },
  {
    id: 3,
    image: banner3,   // bukan string path lagi
    title: 'Gratis Ongkir',
    subtitle: 'Untuk pembelian di atas Rp 500.000',
    ctaText: 'Mulai Belanja',
    ctaHref: '/products',
  },
];

const SwiperContainer = ({ slides = DEFAULT_SLIDES, height = 'h-[60vh] min-h-[360px] md:h-screen md:min-h-[600px]' }) => {
  if (!slides || slides.length === 0) return null;

  return (
    <section className={`w-full ${height} relative overflow-hidden`}>
      <Swiper
        modules={[Autoplay, Pagination, Navigation, EffectFade, A11y]}
        slidesPerView={1}
        loop={slides.length > 1}
        autoplay={{
          delay: 5000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        pagination={{
          clickable: true,
          el: '.eglux-swiper-pagination',
        }}
        navigation={{
          prevEl: '.eglux-swiper-prev',
          nextEl: '.eglux-swiper-next',
        }}
        effect="fade"
        fadeEffect={{ crossFade: true }}
        a11y={{
          prevSlideMessage: 'Slide sebelumnya',
          nextSlideMessage: 'Slide berikutnya',
          paginationBulletMessage: 'Pergi ke slide {{index}}',
        }}
        className="eglux-swiper h-full"
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div className="relative w-full h-full">
              {/* Background image */}
              <img
                src={slide.image}
                alt={slide.title || ''}
                className="w-full h-full object-cover"
                loading="lazy"
              />

              {/* Overlay gradient supaya text terbaca — gradient dari kiri (dark) ke kanan (transparent) */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />

              {/* Content — center-left vertical, full height */}
              <div className="absolute inset-0 flex items-center">
                <div className="max-w-container mx-auto px-4 md:px-8 lg:px-16 w-full">
                  <div className="max-w-lg text-white">
                    {slide.title && (
                      <h2 className="text-[2rem] md:text-[4rem] font-bold leading-[1.1] mb-3 drop-shadow-lg">
                        {slide.title}
                      </h2>
                    )}
                    {slide.subtitle && (
                      <p className="text-[0.95rem] md:text-[1.25rem] mb-7 drop-shadow-md opacity-95 leading-relaxed">
                        {slide.subtitle}
                      </p>
                    )}
                    {slide.ctaText && slide.ctaHref && (
                      <Link
                        to={slide.ctaHref}
                        className="inline-block px-7 py-3.5 md:px-8 md:py-4 bg-eglux-secondary text-white rounded-xl text-[0.9rem] md:text-[0.95rem] font-semibold hover:opacity-90 transition-opacity shadow-xl"
                      >
                        {slide.ctaText}
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Custom navigation buttons (di luar Swiper supaya tidak ke-clone saat loop) */}
      <button
        type="button"
        aria-label="Slide sebelumnya"
        className="eglux-swiper-prev absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm border-none cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Slide berikutnya"
        className="eglux-swiper-next absolute right-4 top-1/2 -translate-y-1/2 z-10 hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm border-none cursor-pointer"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Custom pagination dots */}
      <div className="eglux-swiper-pagination absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2" />
    </section>
  );
};

export default SwiperContainer;
