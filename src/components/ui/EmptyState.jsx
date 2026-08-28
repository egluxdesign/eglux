// src/components/ui/EmptyState.jsx
// ============================================================================
// EmptyState — Reusable empty state dengan icon, title, description, action
// ============================================================================
//
// Cara pakai:
//   import EmptyState from '../components/ui/EmptyState';
//
//   <EmptyState
//     icon="📊"
//     title="Belum ada data order"
//     description="Data akan muncul setelah ada customer checkout."
//     action={{ label: 'Lihat cara promosi', href: '/blog-admin' }}
//   />
//
//   // Atau dengan custom action button
//   <EmptyState
//     icon="📭"
//     title="Tidak ada aktivitas"
//     description="Belum ada order atau transaksi poin hari ini."
//     action={{ label: 'Refresh', onClick: () => fetchData() }}
//   />
// ============================================================================

import { Link } from 'react-router-dom';

const EmptyState = ({
  icon = '📭',
  title = 'Tidak ada data',
  description = '',
  action = null,
  size = 'md', // 'sm' | 'md' | 'lg'
}) => {
  const sizeClasses = {
    sm: { icon: 'text-3xl', title: 'text-sm', desc: 'text-xs', padding: 'py-6' },
    md: { icon: 'text-4xl', title: 'text-sm', desc: 'text-xs', padding: 'py-8' },
    lg: { icon: 'text-5xl', title: 'text-base', desc: 'text-sm', padding: 'py-12' },
  };
  const s = sizeClasses[size] || sizeClasses.md;

  return (
    <div className={`text-center ${s.padding}`}>
      <div className={`${s.icon} mb-3`}>{icon}</div>
      <p className={`${s.title} font-semibold text-gray-700 mb-1`}>{title}</p>
      {description && (
        <p className={`${s.desc} text-gray-400 max-w-xs mx-auto`}>{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link
              to={action.href}
              className="inline-block px-4 py-2 bg-eglux-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 no-underline transition-opacity"
            >
              {action.label}
            </Link>
          ) : action.onClick ? (
            <button
              onClick={action.onClick}
              className="px-4 py-2 bg-eglux-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 cursor-pointer border-none transition-opacity"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
