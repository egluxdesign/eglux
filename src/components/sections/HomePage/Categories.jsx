// src/components/sections/Categories.jsx
// TODO: Data kategori bisa di-fetch dari tabel `categories` Supabase
//       supabase.from('categories').select('*')
import { CATEGORY_CARDS } from '../../../data';
import SectionHeader from '../../ui/SectionHeader';

const CategoryCard = ({ card }) => {
  const { label, href, image, alt } = card;

  return (
    <div
      className="group relative rounded-[20px] overflow-hidden cursor-pointer
                 transition-all duration-300 hover:-translate-y-2.5 hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]"
      onClick={() => window.location.href = href}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && (window.location.href = href)}
      aria-label={label}
    >
      {/* Image
          TODO: `image` → supabase.storage.from('categories').getPublicUrl(card.image_path) */}
      <img
        src={image}
        alt={alt}
        className="w-full h-[300px] object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />

      {/* Overlay */}
      <div
        className="absolute bottom-0 left-0 right-0 pt-8 pb-6 px-6"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)' }}
      >
        <h3 className="text-white text-[1.2rem] font-semibold">{label}</h3>
      </div>
    </div>
  );
};

const Categories = () => (
  <section className="py-20 bg-white">
    <div className="max-w-container mx-auto px-8">
      <SectionHeader
        title="Kategori Produk"
        subtitle="Temukan solusi penyimpanan dan organisasi untuk setiap ruangan"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CATEGORY_CARDS.map((card) => (
          <CategoryCard key={card.label} card={card} />
        ))}
      </div>
    </div>
  </section>
);

export default Categories;
