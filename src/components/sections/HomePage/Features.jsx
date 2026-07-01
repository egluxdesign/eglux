// src/components/sections/Features.jsx
import { FEATURES } from '../../../data';
import SectionHeader from '../../ui/SectionHeader';

const FeatureCard = ({ icon, title, desc }) => (
  <article
    className="bg-white p-10 rounded-[20px] text-center
               transition-all duration-300 hover:-translate-y-1.5 hover:shadow-feature-hover"
  >
    <div
      className="w-[70px] h-[70px] bg-eglux-accent rounded-[20px]
                 flex items-center justify-center mx-auto mb-6 text-[1.8rem]"
      aria-hidden="true"
    >
      {icon}
    </div>
    <h3 className="text-[1.2rem] font-semibold mb-3 text-eglux-primary">{title}</h3>
    <p className="text-[#666] text-[0.95rem] leading-relaxed">{desc}</p>
  </article>
);

const Features = () => (
  <section className="py-20 bg-eglux-light">
    <div className="max-w-container mx-auto px-8">
      <SectionHeader
        title="Mengapa Memilih Eglux?"
        subtitle="Kualitas dan inovasi di setiap produk"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {FEATURES.map((f) => (
          <FeatureCard key={f.title} {...f} />
        ))}
      </div>
    </div>
  </section>
);

export default Features;
