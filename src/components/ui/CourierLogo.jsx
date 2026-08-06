// src/components/ui/CourierLogo.jsx
// ============================================================================
// CourierLogo — Display logo kurir dengan fallback chain (3 layers)
// ============================================================================
//
// Pakai:
//   <CourierLogo courierCode="jne" size={32} />
//   <CourierLogo courierCode="sicepat" size={40} className="rounded" />
//
// Strategy (fallback chain):
//   1. INLINE_SVGS — kalau ada di map (kurir paling umum di Indonesia)
//      → guaranteed work, gak perlu network request
//   2. CDN URLs — coba beberapa pattern Biteship CDN (urut):
//      a. https://cdn.biteship.com/assets/couriers/{code}.svg
//      b. https://dashboard.biteship.com/images/couriers/{code}.png
//      c. https://main.d2h93sqnrhkbps.amplifyapp.com/couriers/{code}.svg
//   3. Letter avatar dengan brand colors — last resort
//
// Reference: https://dashboard.biteship.com/setting/couriers
// ============================================================================

import { useState, useEffect } from 'react';

// ============================================================================
// LAYER 1: Inline SVG logos untuk kurir paling umum
// ============================================================================
// SVG sederhana dengan brand colors. Guaranteed work (gak perlu network).
// Format: code → { svg, name, brandColor, letter }
// ============================================================================

const INLINE_SVGS = {
  jne: {
    name: 'JNE',
    letter: 'J',
    brandColor: '#E2231A',  // JNE red
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#E2231A"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="42" font-weight="900" fill="white" text-anchor="middle">JNE</text></svg>`,
  },
  tiki: {
    name: 'TIKI',
    letter: 'T',
    brandColor: '#E62129',  // TIKI red
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#E62129"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="32" font-weight="900" fill="white" text-anchor="middle">TIKI</text></svg>`,
  },
  pos: {
    name: 'POS Indonesia',
    letter: 'P',
    brandColor: '#00472D',  // POS green
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#00472D"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="38" font-weight="900" fill="white" text-anchor="middle">POS</text></svg>`,
  },
  sicepat: {
    name: 'SiCepat',
    letter: 'S',
    brandColor: '#FF6B00',  // SiCepat orange
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#FF6B00"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="28" font-weight="900" fill="white" text-anchor="middle">SiCepat</text></svg>`,
  },
  anteraja: {
    name: 'AnterAja',
    letter: 'A',
    brandColor: '#FF7900',  // AnterAja orange
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#FF7900"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="26" font-weight="900" fill="white" text-anchor="middle">AnterAja</text></svg>`,
  },
  jnt: {
    name: 'J&T Express',
    letter: 'J',
    brandColor: '#D7000F',  // J&T red
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#D7000F"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="48" font-weight="900" fill="white" text-anchor="middle">J&T</text></svg>`,
  },
  ninja: {
    name: 'Ninja Xpress',
    letter: 'N',
    brandColor: '#7B1FA2',  // Ninja purple
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#7B1FA2"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="22" font-weight="900" fill="white" text-anchor="middle">NINJA</text></svg>`,
  },
  wahana: {
    name: 'Wahana',
    letter: 'W',
    brandColor: '#00529B',  // Wahana blue
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#00529B"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="28" font-weight="900" fill="white" text-anchor="middle">Wahana</text></svg>`,
  },
  lion: {
    name: 'Lion Parcel',
    letter: 'L',
    brandColor: '#ED1C24',  // Lion red
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#ED1C24"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="26" font-weight="900" fill="white" text-anchor="middle">LION</text></svg>`,
  },
  pandu: {
    name: 'Pandu Logistics',
    letter: 'P',
    brandColor: '#003DA5',  // Pandu blue
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="#003DA5"/><text x="50" y="68" font-family="Arial Black, sans-serif" font-size="24" font-weight="900" fill="white" text-anchor="middle">PANDU</text></svg>`,
  },
};

// ============================================================================
// LAYER 2: CDN URLs (fallback chain)
// ============================================================================
// Pattern URL Biteship yang VERIFIED (dari open image URL di dashboard):
//   https://dashboard.biteship.com/images/landing/sq_{code}.png
//
// Component akan coba urut dari yang paling likely work. Kalau fail (onError),
// coba URL berikutnya. URL pertama adalah verified pattern dari user.
// ============================================================================

const CDN_URL_PATTERNS = [
  // Pattern 1: ⭐ VERIFIED — Biteship dashboard landing images (PNG, square)
  // Format: sq_{code}.png — contoh: sq_jne.png, sq_jnt.png, sq_sicepat.png
  (code) => `https://dashboard.biteship.com/images/landing/sq_${code}.png`,
  // Pattern 2: Biteship main CDN (SVG) — backup
  (code) => `https://cdn.biteship.com/assets/couriers/${code}.svg`,
  // Pattern 3: Biteship dashboard images (PNG, tanpa sq_ prefix) — backup
  (code) => `https://dashboard.biteship.com/images/couriers/${code}.png`,
];

// ============================================================================
// Helpers
// ============================================================================

function getCourierInfo(code) {
  if (!code) return { name: 'Unknown', letter: '?', brandColor: '#888888' };
  const c = String(code).toLowerCase().trim();
  return INLINE_SVGS[c] || {
    name: code.toUpperCase(),
    letter: code.charAt(0).toUpperCase(),
    brandColor: '#9a7d4a',  // eglux-secondary gold sebagai default
  };
}

// ============================================================================
// LetterAvatar — last resort fallback dengan brand colors
// ============================================================================
const LetterAvatar = ({ info, size, showBorder, className = '' }) => (
  <div
    className={`flex items-center justify-center text-white font-bold flex-shrink-0 ${showBorder ? 'border border-gray-200' : ''} ${className}`}
    style={{
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: info.brandColor,
      fontSize: `${Math.max(10, size * 0.4)}px`,
      borderRadius: '6px',
    }}
    title={info.name}
    aria-label={info.name}
  >
    {info.letter}
  </div>
);

// ============================================================================
// CourierLogo Component
// ============================================================================
// ⭐ Strategy:
//   1. Coba URL Biteship (sq_{code}.png) — logo asli, paling akurat
//   2. Kalau fail, coba CDN patterns lain (backup)
//   3. Kalau semua CDN fail, pakai inline SVG (text-based, instant render)
//   4. Kalau gak ada di inline map, letter avatar dengan brand colors
// ============================================================================
const CourierLogo = ({ courierCode, size = 32, className = '', showBorder = true }) => {
  const info = getCourierInfo(courierCode);
  const code = courierCode ? String(courierCode).toLowerCase().trim() : '';

  // State untuk track URL yang sedang di-try (CDN fallback chain)
  const [cdnIndex, setCdnIndex] = useState(0);
  const [allCdnFailed, setAllCdnFailed] = useState(false);

  // Reset state saat courierCode berubah
  useEffect(() => {
    setCdnIndex(0);
    setAllCdnFailed(false);
  }, [code]);

  // ── LAYER 4: Letter avatar (kalau semua CDN fail DAN gak ada inline SVG) ──
  if (!code || (allCdnFailed && !INLINE_SVGS[code])) {
    return <LetterAvatar info={info} size={size} showBorder={showBorder} className={className} />;
  }

  // ── LAYER 3: Inline SVG (kalau semua CDN fail TAPI ada di inline map) ──
  if (allCdnFailed && INLINE_SVGS[code] && INLINE_SVGS[code].svg) {
    return (
      <img
        src={`data:image/svg+xml;base64,${btoa(INLINE_SVGS[code].svg)}`}
        alt={info.name}
        title={info.name}
        className={`object-contain flex-shrink-0 ${showBorder ? 'border border-gray-200 bg-white' : ''} ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '6px',
        }}
        loading="lazy"
      />
    );
  }

  // ── LAYER 1 & 2: CDN fallback chain (logo asli dari Biteship) ──
  const cdnUrl = CDN_URL_PATTERNS[cdnIndex](code);

  return (
    <img
      src={cdnUrl}
      alt={info.name}
      title={info.name}
      onError={() => {
        // Coba URL berikutnya dalam chain
        if (cdnIndex + 1 < CDN_URL_PATTERNS.length) {
          setCdnIndex(cdnIndex + 1);
        } else {
          // Semua CDN fail → fallback ke inline SVG atau letter avatar
          setAllCdnFailed(true);
        }
      }}
      className={`object-contain flex-shrink-0 ${showBorder ? 'border border-gray-200 bg-white p-0.5' : ''} ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '6px',
      }}
      loading="lazy"
    />
  );
};

export default CourierLogo;

// Export helpers
export { getCourierInfo, INLINE_SVGS, CDN_URL_PATTERNS };
