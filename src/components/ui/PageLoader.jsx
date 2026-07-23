// src/components/ui/PageLoader.jsx
// ============================================================================
// PageLoader — Reusable React loader untuk situasi async (checkout, route
// transitions, fetch, dll). Pakai animasi yang sama dengan pre-hydration
// loader: logo EGLUX image naik dari bawah + opacity 50% → 100%.
// ============================================================================
//
// Usage:
//   import PageLoader from '../components/ui/PageLoader';
//
//   {isProcessing && <PageLoader label="Memproses Pembayaran..." />}
//   {isProcessing && <PageLoader />}  // tanpa label
//
// Props:
//   - label: string (optional) — text di bawah logo
//   - backdrop: 'solid' | 'blur' (default 'blur')
//   - inline: boolean (default false) — kalau true, gak fixed full-screen,
//             tapi relative di dalam parent container
// ============================================================================

import { useEffect, useState } from 'react';
import '/src/assets/styles/eglux-design-system.css';

// ⭐ Logo URL — sama dengan yang dipakai di index.html pre-hydration loader
// SVG dipakai supaya crisp di semua resolusi (retina/4K) & file lebih kecil
const EGLUX_LOGO_URL = 'https://mbuwpjxpxvnsxjusrnlk.supabase.co/storage/v1/object/public/logo/Logo-Loading.svg';

const PageLoader = ({
  label,
  backdrop = 'blur',
  inline = false,
  minDuration = 0, // ⭐ minimum display duration (ms) — cegah flicker
}) => {
  const [visible, setVisible] = useState(minDuration > 0);

  useEffect(() => {
    if (minDuration > 0) {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
  }, [minDuration]);

  const wrapperClass = inline
    ? 'eglux-page-loader eglux-page-loader--inline'
    : 'eglux-page-loader eglux-page-loader--fixed';

  const backdropClass = backdrop === 'solid'
    ? 'eglux-page-loader--solid'
    : 'eglux-page-loader--blur';

  return (
    <div
      className={`${wrapperClass} ${backdropClass} ${visible ? 'is-visible' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label || 'Memuat'}
    >
      <div className="eglux-page-loader__logo">
        <img
          src={EGLUX_LOGO_URL}
          alt=""
          draggable={false}
        />
        {label && <p className="eglux-page-loader__label">{label}</p>}
      </div>
    </div>
  );
};

export default PageLoader;
