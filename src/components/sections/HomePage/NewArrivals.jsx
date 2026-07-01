// src/components/sections/NewArrivals.jsx
// TODO: Ganti NEW_ARRIVALS dengan fetch dari Supabase:
//       const { data } = await supabase.from('products').select('*').eq('tag','new-arrival')
import { NEW_ARRIVALS } from '../../../data';
import SectionHeader from '../../ui/SectionHeader';
import ProductCard   from '../../ui/ProductCard';

const NewArrivals = () => (
  <section className="py-20 bg-white">
    <div className="max-w-container mx-auto px-8">
      <SectionHeader
        title="Produk Terbaru"
        subtitle="Koleksi terkini dari EGLUX"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {NEW_ARRIVALS.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  </section>
);

export default NewArrivals;
