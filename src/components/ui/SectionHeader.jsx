// src/components/ui/SectionHeader.jsx
// Komponen reusable: judul section + subtitle terpusat
const SectionHeader = ({ title, subtitle }) => (
  <div className="text-center mb-12">
    <h2 className="text-[2.2rem] font-bold text-eglux-primary mb-2">{title}</h2>
    {subtitle && <p className="text-[#666] text-base">{subtitle}</p>}
  </div>
);

export default SectionHeader;
