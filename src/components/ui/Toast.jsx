// src/components/ui/Toast.jsx
// ============================================================================
// Toast — notifikasi singkat yang muncul di pojok layar (top-right).
// Auto-dismiss setelah 3 detik. Bisa di-close manual.
//
// Pemakaian:
//   const { toast, showToast } = useToast();
//   return (
//     <>
//       <button onClick={() => showToast('Item ditambahkan', 'success')}>Test</button>
//       <Toast toast={toast} onClose={closeToast} />
//     </>
//   );
//
// Atau kalau mau pakai tanpa hook (controlled):
//   <Toast toast={{ message: 'Halo', type: 'success', id: 1 }} onClose={() => {}} />
// ============================================================================

import { useEffect } from 'react';

// ── Minimalist line icons (1-color) ──
const IconCheck = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconAlert = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconInfo = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const IconClose = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Style mapping per type ──
const TOAST_STYLES = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    Icon: IconCheck,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-600',
    Icon: IconAlert,
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    Icon: IconInfo,
  },
};

const Toast = ({ toast, onClose }) => {
  useEffect(() => {
    if (!toast || !onClose) return;
    const timer = setTimeout(() => onClose(), 3000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
  const { Icon } = style;

  const handleClose = () => {
    if (typeof onClose === 'function') onClose();
  };

  return (
    <div
      key={toast.id}
      className={`fixed top-4 right-4 z-[4000] flex items-center gap-3 px-4 py-3 rounded-xl border ${style.bg} ${style.border} ${style.text} shadow-lg max-w-sm`}
      role="status"
      aria-live="polite"
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-[0.85rem] font-medium">{toast.message}</span>
      <button
        onClick={handleClose}
        aria-label="Tutup notifikasi"
        className="ml-2 p-1 hover:bg-black/5 rounded-full transition-colors cursor-pointer border-none bg-transparent"
      >
        <IconClose className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default Toast;
