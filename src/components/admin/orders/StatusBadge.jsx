// src/components/admin/orders/StatusBadge.jsx
const STATUS_CONFIG = {
  pending:   { label: 'Pending',   bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100',   dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmed', bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100',    dot: 'bg-blue-500' },
  paid:      { label: 'Paid',      bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', dot: 'bg-emerald-500' },
  shipped:   { label: 'Shipped',   bg: 'bg-violet-50',  text: 'text-violet-600',  border: 'border-violet-100',  dot: 'bg-violet-500' },
  cancelled: { label: 'Cancelled', bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100',     dot: 'bg-red-500' },
};

const StatusBadge = ({ status, size = 'md' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
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

export default StatusBadge;