// ============================================================
//  EGLUX — Centralized Data
//  ⭐ v2: Fix SIDEBAR_CATEGORIES filter values
//    - 'new' → 'produkbaru' (match HomePage filterProducts convention)
//    - Parent hasSubmenu items: href tetap '#' (klik parent = toggle submenu)
//    - Submenu items: format /?filter=<parent>&sub=<keyword>
//      HomePage akan filter: category=<parent> + name contains <keyword>
// ============================================================

// ── Navigation ───────────────────────────────────────────────
// `key` dipakai untuk matching dengan prop `activePage` di DuplicateNav.
export const NAV_LINKS = [
  { label: 'Beranda',      href: '/',          key: 'home'      },
  { label: 'Blog',         href: '/blog',      key: 'blog'      },
  { label: 'Tentang Kami', href: '/about',     key: 'about'     },
  { label: 'Kontak',       href: '/contact',   key: 'contact'   },
  { label: 'Affiliate',    href: '/affiliate', key: 'affiliate' },
];

export const SOCIAL_LINKS = [
  { label: 'Shopee',    href: 'https://shopee.co.id/eglux'           },
  { label: 'TikTok',    href: 'https://www.tiktok.com/@egluxdecor'   },
  { label: 'Instagram', href: 'https://www.instagram.com/eglux_id'   },
];

// ── Sidebar Categories ────────────────────────────────────────
// ⭐ v2 FIX:
//   - 'New Arrival': '/?filter=new' → '/?filter=produkbaru'
//     (HomePage.filterProducts kenal 'produkbaru', BUKAN 'new')
//   - Parent hasSubmenu (Kitchen, Home Decor): href '#' (klik = toggle submenu)
//   - Submenu items: /?filter=<parent>&sub=<keyword>
//     HomePage akan filter: category=<parent> + name contains <keyword>
export const SIDEBAR_CATEGORIES = [
  {
    label: 'New Arrival',
    // ⭐ FIXED: was '/?filter=new' → now '/?filter=produkbaru'
    href:  '/?filter=produkbaru',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
  },
  {
    label: 'Best Seller',
    href:  '/?filter=bestseller',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
  },
  {
    label: 'All Products',
    href:  '/',
    image: 'https://down-tx-id.img.susercontent.com/id-11134210-7rbk4-m6npp1bog9rg6c',
  },
  {
    label: 'Kitchen',
    href:  '#',  // Parent toggle (klik → expand submenu, gak navigate)
    hasSubmenu: true,
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820n5-mn9v2pvit5om4b.webp',
    // ⭐ Submenu: filter=kitchen + sub=<keyword> (filter by name contains)
    submenu: [
      { label: 'Prasmanan',    href: '/?filter=kitchen&sub=prasmanan' },
      { label: 'Tempat Bumbu', href: '/?filter=kitchen&sub=bumbu'     },
      { label: 'Toples',       href: '/?filter=kitchen&sub=toples'    },
      { label: 'Nampan',       href: '/?filter=kitchen&sub=nampan'    },
    ],
  },
  {
    label: 'Home Decor',
    href:  '#',  // Parent toggle
    hasSubmenu: true,
    image: 'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    // ⭐ Submenu: filter=homedecor + sub=<keyword>
    submenu: [
      { label: 'Wall Decor',  href: '/?filter=homedecor&sub=wall'    },
      { label: 'Pajangan',    href: '/?filter=homedecor&sub=pajangan' },
      { label: 'Vas Bunga',   href: '/?filter=homedecor&sub=vas'      },
      { label: 'Taplak Meja', href: '/?filter=homedecor&sub=taplak'   },
    ],
  },
  {
    label: 'Bathroom',
    href:  '/?filter=bathroom',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdvm-mdjp4ct77ggp63.webp',
  },
  {
    label: 'Storage',
    href:  '/?filter=storage',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdy8-mcj15f3yq0frd3.webp',
  },
];

// ── Hero ─────────────────────────────────────────────────────
export const HERO_DATA = {
  bgImage:  '/src/assets/img/heroBg.jpg',
  logo1:  '/src/assets/img/Logo2.png',
  subtitle: 'Kitchen & Home Decor',
  ctaLabel: 'Shop Now',
  ctaHref:  '/',
  tagline:  'Gunakan Eglux, Biar Tetangga Iri',
};

// ── Promo Banners ─────────────────────────────────────────────
export const PROMO_BANNERS = [
  {
    id:      'flash-sale',
    tag:     '🔥 Flash Sale',
    title:   'Diskon Hingga 50%',
    desc:    'Perlengkapan Dapur Premium — Hanya Hari Ini!',
    cta:     'Beli Sekarang',
    // ⭐ FIXED: was '/?filter=flashsale' (invalid) → now '/?filter=produkbaru'
    href:    '/?filter=produkbaru',
    variant: 'primary',
    image:   'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
    tall:    true,
  },
  {
    id:      'new-arrival',
    tag:     '✨ New Arrival',
    title:   'Koleksi Terbaru 2026',
    desc:    'Temukan produk home decor & kitchen terbaru dari Eglux',
    cta:     'Lihat Koleksi',
    // ⭐ FIXED: was '/?filter=new' (invalid) → now '/?filter=produkbaru'
    href:    '/?filter=produkbaru',
    variant: 'dark',
    image:   'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=1200&q=80',
    tall:    false,
  },
];

// ── Category Cards ────────────────────────────────────────────
export const CATEGORY_CARDS = [
  {
    label: 'Perlengkapan Penyimpanan',
    href:  '/?filter=storage',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdy8-mcj15f3yq0frd3.webp',
    alt:   'Storage',
  },
  {
    label: 'Perlengkapan Dapur',
    href:  '/?filter=kitchen',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820n5-mn9v2pvit5om4b.webp',
    alt:   'Kitchen',
  },
  {
    label: 'Perlengkapan Kamar Mandi',
    href:  '/?filter=bathroom',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdvm-mdjp4ct77ggp63.webp',
    alt:   'Bathroom',
  },
  {
    label: 'Hiasan Rumah',
    href:  '/?filter=homedecor',
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-mdjse24iesx0a6.webp',
    alt:   'Home Decor',
  },
];

// ── Best Seller Products ──────────────────────────────────────
export const BEST_SELLERS = [
  {
    id:       'bs-1',
    name:     'EGLUX Tempat Prasmanan Motif Bintik Emas',
    model:    'Bulat Putih S+Kaki',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Motif-Bintik-Emas-wadah-prasmanan-aesthetics-i.1082449101.43165997982',
  },
  {
    id:       'bs-2',
    name:     'EGLUX Tempat Prasmanan Tempat Buah Wadah Saji Tempat Roti',
    model:    'Perpan kecil transparan',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-lz62cs0ixm2vbb.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-Tempat-buah-Wadah-Saji-Tempat-Roti-aesthetic-Nampan-dengan-tutup-i.1082449101.24385020393',
  },
  {
    id:       'bs-3',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'bs-4',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Wadah-Saji-tempat-buah-dengan-tutup-aesthetic-i.1082449101.28572331206',
  },
];

// ── New Arrivals Products ─────────────────────────────────────
export const NEW_ARRIVALS = [
  {
    id:       'na-1',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'na-2',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Wadah-Saji-tempat-buah-dengan-tutup-aesthetic-i.1082449101.28572331206',
  },
  {
    id:       'na-3',
    name:     'EGLUX Tempat Prasmanan Motif Bintik Emas',
    model:    'Bulat Putih S+Kaki',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Motif-Bintik-Emas-wadah-prasmanan-aesthetics-i.1082449101.43165997982',
  },
  {
    id:       'na-4',
    name:     'EGLUX Tempat Prasmanan Tempat Buah Nampan dengan Tutup',
    model:    'Perpan kecil transparan',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-lz62cs0ixm2vbb.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-Tempat-buah-Wadah-Saji-Tempat-Roti-aesthetic-Nampan-dengan-tutup-i.1082449101.24385020393',
  },
  {
    id:       'na-5',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'na-6',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    image:    'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Wadah-Saji-tempat-buah-dengan-tutup-aesthetic-i.1082449101.28572331206',
  },
];

// ── Features ──────────────────────────────────────────────────
export const FEATURES = [
  {
    icon:  '🔬',
    title: 'Pusat R&D',
    desc:  'Tim desainer profesional yang berdedikasi untuk menciptakan produk inovatif dengan fungsionalitas terbaik.',
  },
  {
    icon:  '🏭',
    title: 'Pusat Manufaktur',
    desc:  'Fasilitas produksi seluas 40.000 m² dengan standar kualitas ketat dan teknik produksi modern.',
  },
  {
    icon:  '🏆',
    title: 'Penghargaan',
    desc:  'Diakui dengan berbagai penghargaan desain internasional termasuk Red Dot Design Award dan iF Design Award.',
  },
];

// ── Footer ────────────────────────────────────────────────────
export const FOOTER_LINKS = {
  navigasi: [
    { label: 'Beranda',      href: '/'          },
    { label: 'Produk',       href: '/'          },
    { label: 'Blog',         href: '/blog'      },
    { label: 'Tentang Kami', href: '/about'     },
    { label: 'Kontak',       href: '/contact'   },
    { label: 'Affiliate',    href: '/affiliate' },
  ],
  kategori: [
    // ⭐ FIXED: 'new' → 'produkbaru'
    { label: 'New Arrival',  href: '/?filter=produkbaru'  },
    { label: 'Best Seller',  href: '/?filter=bestseller'  },
    { label: 'Semua Produk', href: '/'                    },
    { label: 'Kitchen',      href: '/?filter=kitchen'     },
    { label: 'Homedecor',    href: '/?filter=homedecor'   },
    { label: 'Bathroom',     href: '/?filter=bathroom'    },
    { label: 'Storage',      href: '/?filter=storage'     },
  ],
  bantuan: [
    { label: 'Pengiriman',   href: '/contact?section=shipping' },
    { label: 'Pengembalian', href: '/contact?section=returns' },
  ],
};
