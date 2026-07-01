// src/components/sections/BestSellers.jsx
// TODO: Ganti BEST_SELLERS dengan fetch dari Supabase:
//       const { data } = await supabase.from('products').select('*').eq('tag','best-seller')
import { BEST_SELLERS } from '../../../data';
import SectionHeader from '../../ui/SectionHeader';
import ProductCard   from '../../ui/ProductCard';

const BestSellers = () => (
  <section className="py-20 bg-eglux-light">
    <div className="max-w-container mx-auto px-8">
      <SectionHeader
        title="Produk Terlaris"
        subtitle="Pilihan favorit pelanggan kami"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {BEST_SELLERS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  </section>
);

export default BestSellers;
