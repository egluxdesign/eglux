// src/components/admin/products/ProductStatusBadge.jsx
const STATUS_CONFIG = {
  active:   { label: 'Active',   bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  inactive: { label: 'Inactive', bg: 'bg-gray-50',     text: 'text-gray-600',     border: 'border-gray-100',    dot: 'bg-gray-400' },
};

// is_active di database cuma boolean — komponen ini yang nerjemahin ke label/warna.
const ProductStatusBadge = ({ isActive, size = 'md' }) => {
  const config = isActive ? STATUS_CONFIG.active : STATUS_CONFIG.inactive;
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[0.7rem]'
    : 'px-3 py-1 text-[0.75rem]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

export default ProductStatusBadge;