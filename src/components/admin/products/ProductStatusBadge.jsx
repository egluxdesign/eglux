// src/components/admin/products/ProductStatusBadge.jsx
const STATUS_CONFIG = {
  active:   { label: 'Active',    bg: 'bg-emerald-50',   text: 'text-emerald-600',   border: 'border-emerald-100',   dot: 'bg-emerald-500' },
  inactive: { label: 'Inactive',  bg: 'bg-gray-50',      text: 'text-gray-600',      border: 'border-gray-100',      dot: 'bg-gray-400' },
  draft:    { label: 'Draft',     bg: 'bg-amber-50',     text: 'text-amber-600',     border: 'border-amber-100',     dot: 'bg-amber-500' },
  archived: { label: 'Archived',  bg: 'bg-red-50',       text: 'text-red-600',       border: 'border-red-100',       dot: 'bg-red-500' },
};

const ProductStatusBadge = ({ status, size = 'md' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-[0.7rem]' 
    : 'px-3 py-1 text-[0.75rem]';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses} font-medium capitalize`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
};

export default ProductStatusBadge;