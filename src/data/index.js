// ============================================================
//  EGLUX — Centralized Data
//  Ganti nilai `image` dengan URL dari Supabase Storage nanti.
//  Contoh: supabase.storage.from('eglux-assets').getPublicUrl('...')
// ============================================================

// ── Navigation ───────────────────────────────────────────────
// `key` dipakai untuk matching dengan prop `activePage` di DuplicateNav.
// Misalnya <DuplicateNav activePage="blog" /> akan highlight link dengan
// key="blog". Kalau `activePage` tidak di-pass, fallback ke useLocation
// pathname (link.href === pathname).
//
// Jangan hardcode `active: true` — active state harus dynamic, di-detect
// dari URL/activePage prop.
export const NAV_LINKS = [
  { label: 'Beranda',      href: '/',          key: 'home'      },
  // { label: 'Produk',       href: '/products',  key: 'products'  },
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
export const SIDEBAR_CATEGORIES = [
  {
    label: 'New Arrival',
    href:  '/products?filter=new',
    // TODO: Ganti URL ini dengan path dari Supabase Storage
    // Contoh: supabase.storage.from('category-images').getPublicUrl('new-arrival.webp')
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
  },
  {
    label: 'Best Seller',
    href:  '/products?filter=bestseller',
    // TODO: Supabase Storage path — best-seller category image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
  },
  {
    label: 'All Products',
    href:  '/products',
    // TODO: Supabase Storage path — all products category image
    image: 'https://down-tx-id.img.susercontent.com/id-11134210-7rbk4-m6npp1bog9rg6c',
  },
  {
    label: 'Kitchen',
    href:  '#',
    hasSubmenu: true,
    // TODO: Supabase Storage path — kitchen category image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820n5-mn9v2pvit5om4b.webp',
    submenu: [
      { label: 'Prasmanan',    href: '/products?filter=prasmanan' },
      { label: 'Tempat Bumbu', href: '/products?filter=bumbu'     },
      { label: 'Toples',       href: '/products?filter=toples'    },
      { label: 'Nampan',       href: '/products?filter=nampan'    },
    ],
  },
  {
    label: 'Home Decor',
    href:  '#',
    hasSubmenu: true,
    // TODO: Supabase Storage path — home decor category image
    image: 'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    submenu: [
      { label: 'Wall Decor',  href: '/products?filter=walldecor' },
      { label: 'Pajangan',    href: '/products?filter=pajangan'  },
      { label: 'Vas Bunga',   href: '/products?filter=vas'       },
      { label: 'Taplak Meja', href: '/products?filter=taplak'    },
    ],
  },
  {
    label: 'Bathroom',
    href:  '/products?filter=bathroom',
    // TODO: Supabase Storage path — bathroom category image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdvm-mdjp4ct77ggp63.webp',
  },
  {
    label: 'Storage',
    href:  '/products?filter=storage',
    // TODO: Supabase Storage path — storage category image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdy8-mcj15f3yq0frd3.webp',
  },
];

// ── Hero ─────────────────────────────────────────────────────
export const HERO_DATA = {
  // TODO: Ganti dengan URL Supabase Storage
  // Contoh: supabase.storage.from('eglux-assets').getPublicUrl('hero/heroBg.png')
  bgImage:  '/src/assets/img/heroBg.jpg',
  // TODO: Logo putih untuk overlay hero
  logo1:  '/src/assets/img/Logo2.png',
  subtitle: 'Kitchen & Home Decor',
  ctaLabel: 'Shop Now',
  ctaHref:  '/products',
  tagline:  'Gunakan Eglux, Biar Tetangga Iri',
};

// ── Promo Banners ─────────────────────────────────────────────
export const PROMO_BANNERS = [
  // {
  //   id:      'flash-sale',
  //   tag:     '🔥 Flash Sale',
  //   title:   'Diskon Hingga 50%',
  //   desc:    'Perlengkapan Dapur Premium — Hanya Hari Ini!',
  //   cta:     'Beli Sekarang',
  //   href:    '/products?filter=flashsale',
  //   variant: 'primary',   // coklat overlay
  //   // TODO: Ganti dengan hero banner dari Supabase Storage
  //   image:   'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80',
  //   tall:    true,
  // },
  {
    id:      'new-arrival',
    tag:     '✨ New Arrival',
    title:   'Koleksi Terbaru 2026',
    desc:    'Temukan produk home decor & kitchen terbaru dari Eglux',
    cta:     'Lihat Koleksi',
    href:    '/products?filter=new',
    variant: 'dark',      // biru gelap overlay
    // TODO: Ganti dengan banner new arrival dari Supabase Storage
    image:   'https://images.unsplash.com/photo-1556909114-44e3e70034e2?w=1200&q=80',
    tall:    false,
  },
];

// ── Category Cards ────────────────────────────────────────────
export const CATEGORY_CARDS = [
  {
    label: 'Perlengkapan Penyimpanan',
    href:  '/products-sections?filter=storage',
    // TODO: Supabase Storage path — storage category card image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdy8-mcj15f3yq0frd3.webp',
    alt:   'Storage',
  },
  {
    label: 'Perlengkapan Dapur',
    href:  '/products-sections?filter=kitchen',
    // TODO: Supabase Storage path — kitchen category card image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-820n5-mn9v2pvit5om4b.webp',
    alt:   'Kitchen',
  },
  {
    label: 'Perlengkapan Kamar Mandi',
    href:  '/products-sections?filter=bathroom',
    // TODO: Supabase Storage path — bathroom category card image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdvm-mdjp4ct77ggp63.webp',
    alt:   'Bathroom',
  },
  {
    label: 'Hiasan Rumah',
    href:  '/products-sections?filter=homedecor',
    // TODO: Supabase Storage path — homedecor category card image
    image: 'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-mdjse24iesx0a6.webp',
    alt:   'Home Decor',
  },
];

// ── Best Seller Products ──────────────────────────────────────
// TODO: Nanti data ini akan di-fetch dari tabel `products` Supabase
// Contoh query: supabase.from('products').select('*').eq('tag','best-seller')
export const BEST_SELLERS = [
  {
    id:       'bs-1',
    name:     'EGLUX Tempat Prasmanan Motif Bintik Emas',
    model:    'Bulat Putih S+Kaki',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Motif-Bintik-Emas-wadah-prasmanan-aesthetics-i.1082449101.43165997982',
  },
  {
    id:       'bs-2',
    name:     'EGLUX Tempat Prasmanan Tempat Buah Wadah Saji Tempat Roti',
    model:    'Perpan kecil transparan',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-lz62cs0ixm2vbb.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-Tempat-buah-Wadah-Saji-Tempat-Roti-aesthetic-Nampan-dengan-tutup-i.1082449101.24385020393',
  },
  {
    id:       'bs-3',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'bs-4',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Wadah-Saji-tempat-buah-dengan-tutup-aesthetic-i.1082449101.28572331206',
  },
];

// ── New Arrivals Products ─────────────────────────────────────
// TODO: Fetch dari Supabase: supabase.from('products').select('*').eq('tag','new-arrival')
export const NEW_ARRIVALS = [
  {
    id:       'na-1',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'na-2',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/id-11134207-7rasg-m5z7qgib73zc9d.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Wadah-Saji-tempat-buah-dengan-tutup-aesthetic-i.1082449101.28572331206',
  },
  {
    id:       'na-3',
    name:     'EGLUX Tempat Prasmanan Motif Bintik Emas',
    model:    'Bulat Putih S+Kaki',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-824gv-me0yfrozmpzae4.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-prasmanan-Motif-Bintik-Emas-wadah-prasmanan-aesthetics-i.1082449101.43165997982',
  },
  {
    id:       'na-4',
    name:     'EGLUX Tempat Prasmanan Tempat Buah Nampan dengan Tutup',
    model:    'Perpan kecil transparan',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-7rdx6-lz62cs0ixm2vbb.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-Tempat-buah-Wadah-Saji-Tempat-Roti-aesthetic-Nampan-dengan-tutup-i.1082449101.24385020393',
  },
  {
    id:       'na-5',
    name:     'EGLUX Tempat Prasmanan Aesthetics Wadah Saji Nampan Set',
    model:    'Bulat Putih S+Kaki',
    badge:    'Baru',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
    image:    'https://down-id.img.susercontent.com/file/sg-11134201-820nf-mn9v2qt7p6h23a.webp',
    shopLink: 'https://shopee.co.id/EGLUX-Tempat-Prasmanan-aesthetics-wadah-saji-nampan-set-i.1082449101.55409152909',
  },
  {
    id:       'na-6',
    name:     'EGLUX Tempat Prasmanan Wadah Saji Tempat Buah dengan Tutup',
    model:    'Perpan L Bening 3pcs',
    badge:    'Best Seller',
    category: 'kitchen',
    // TODO: Supabase Storage path — product image
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
    { label: 'Produk',       href: '/products'  },
    { label: 'Blog',         href: '/blog'      },
    { label: 'Tentang Kami', href: '/about'     },
    { label: 'Kontak',       href: '/contact'   },
    { label: 'Affiliate',    href: '/affiliate' },
  ],
  kategori: [
    { label: 'New Arrival',  href: '/products-sections?filter=new'        },
    { label: 'Best Seller',  href: '/products-sections?filter=bestseller' },
    { label: 'Semua Produk', href: '/products-sections'                   },
    { label: 'Kitchen',      href: '/products-sections?filter=kitchen'    },
    { label: 'Homedecor',    href: '/products-sections?filter=homedecor'  },
    { label: 'Bathroom',     href: '/products-sections?filter=bathroom'   },
    { label: 'Storage',      href: '/products-sections?filter=storage'    },
  ],
  bantuan: [
    { label: 'Pengiriman',   href: '/contact?section=shipping' },
    { label: 'Pengembalian', href: '/contact?section=returns' },
  ],
};
