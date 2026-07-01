/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        eglux: {
          primary:   '#554521',   // Coklat gelap — warna teks utama & elemen brand
          secondary: '#cba65a',   // Emas — aksen utama
          accent:    '#f5f0e8',   // Krem — background ikon/sub-elemen
          light:     '#faf8f5',   // Off-white — background halaman
          dark:      '#1a1a2e',   // Biru gelap — overlay hero
        },
      },
      fontFamily: {
        sans:      ['Inter', 'sans-serif'],
        playfair:  ['"Playfair Display"', 'serif'],
      },
      maxWidth: {
        container: '1400px',
      },
      height: {
        hero: '84vh',
      },
      boxShadow: {
        'card-hover': '0 20px 40px rgba(0,0,0,0.08)',
        'banner-hover': '0 20px 40px rgba(0,0,0,0.15)',
        'feature-hover': '0 15px 35px rgba(0,0,0,0.08)',
        'header': '0 1px 10px rgba(0,0,0,0.05)',
        'nav-stuck': '0 2px 10px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
};
