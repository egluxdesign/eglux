// migrate-images.mjs
// Jalankan sekali di terminal: node migrate-images.mjs
// Pastikan sudah: npm install @supabase/supabase-js node-fetch
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL     = 'https://mbuwpjxpxvnsxjusrnlk.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // jangan hardcode!
const BUCKET           = 'product-images';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Peta slug → URL imgbox lama
const IMAGES = [
  { slug: 'eglux-tempat-prasmanan-motif-bintik-emas',         url: 'https://thumbs2.imgbox.com/b5/ff/tGzl7ApN_t.png' },
  { slug: 'eglux-tempat-prasmanan-tempat-buah-wadah-saji',    url: 'https://thumbs2.imgbox.com/cd/de/NLXbS2v9_t.png' },
  { slug: 'vas-bunga-hiasan-dekorasi-ruang-tamu-mewah',       url: 'https://thumbs2.imgbox.com/a0/77/tMELsUSH_t.png' },
  { slug: 'eglux-rak-bumbu-putar-360',                        url: 'https://thumbs2.imgbox.com/bc/de/oFJkkB4t_t.png' },
  { slug: 'taplak-meja-cantik',                               url: 'https://thumbs2.imgbox.com/27/65/V4h2Jx0x_t.png' },
  { slug: 'eglux-tempat-prasmanan-aesthetics',                url: 'https://thumbs2.imgbox.com/20/ef/T2apVdCw_t.png' },
  { slug: 'eglux-tempat-prasmanan-kotak-kaca-marmer',         url: 'https://thumbs2.imgbox.com/c2/f8/xgSNg6u4_t.png' },
  { slug: 'bunga-hias-artificial-gold',                       url: 'https://thumbs2.imgbox.com/9e/44/wTSp77tN_t.png' },
  { slug: 'eglux-dispenser-sabun-pompa',                      url: 'https://thumbs2.imgbox.com/87/d9/PsvxRTF4_t.png' },
  { slug: 'eglux-tempat-prasmanan-gagang-retak-seribu',       url: 'https://thumbs2.imgbox.com/42/81/DPjbY6v8_t.png' },
  { slug: 'food-container-kotak-bumbu-makanan',               url: 'https://thumbs2.imgbox.com/8a/96/ZccZVHga_t.png' },
  { slug: 'eglux-botol-pompa-sabun-detergen-1000ml',          url: 'https://thumbs2.imgbox.com/70/ff/oZ1OQB1P_t.png' },
  { slug: 'toples-kaca-rusa-mewah',                           url: 'https://thumbs2.imgbox.com/e8/dd/NRansuVf_t.png' },
  { slug: 'eglux-toples-kotak-2-motif',                       url: 'https://thumbs2.imgbox.com/4e/25/ktQMhFgh_t.png' },
  { slug: 'toples-plastik-kaki-emas-mewah',                   url: 'https://thumbs2.imgbox.com/b9/98/Pgfdcj82_t.png' },
  { slug: 'vas-bunga-besar-mewah',                            url: 'https://thumbs2.imgbox.com/a4/0a/0CWgpV7F_t.png' },
  { slug: 'eglux-set-toples-bulat-bening-3pcs',               url: 'https://thumbs2.imgbox.com/10/5e/bS2CYJVy_t.png' },
  { slug: 'oil-pot-tempat-minyak-stainless',                  url: 'https://thumbs2.imgbox.com/cd/86/akLooc1B_t.png' },
  { slug: 'kotak-tisu-transparan-minimalis',                  url: 'https://thumbs2.imgbox.com/93/71/9tvArtbq_t.png' },
  { slug: 'eglux-toples-3pcs-set-plastik-sultan',             url: 'https://thumbs2.imgbox.com/ac/d8/dk5xZIfw_t.png' },
  { slug: 'toples-motif-pita-mewah-3pcs',                     url: 'https://thumbs2.imgbox.com/0e/e5/RIpYuq7K_t.png' },
];

const migrate = async () => {
  console.log('🚀 Mulai migrasi foto produk ke Supabase Storage...\n');

  for (const item of IMAGES) {
    try {
      // 1. Fetch foto dari imgbox
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`Gagal fetch: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const filename = `products/${item.slug}.png`;

      // 2. Upload ke Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filename, buffer, {
          contentType: 'image/png',
          upsert: true, // overwrite kalau sudah ada
        });
      if (uploadError) throw uploadError;

      // 3. Ambil public URL dari Supabase
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filename);

      // 4. Update tabel product_images dengan URL baru
      const { error: updateError } = await supabase
        .from('product_images')
        .update({ url: publicUrl })
        .eq('url', item.url); // match URL imgbox lama
      if (updateError) throw updateError;

      console.log(`✅ ${item.slug}`);
    } catch (err) {
      console.error(`❌ ${item.slug}: ${err.message}`);
    }
  }

  console.log('\n✨ Selesai! Semua foto sudah dipindah ke Supabase Storage.');
};

migrate();
