// src/data/countries.js
// Simplified: ASEAN (10) + China only.
// Default: Indonesia (id, +62).

export const COUNTRIES = [
  { code: 'id', dial: '62', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'sg', dial: '65', name: 'Singapore', flag: '🇸🇬' },
  { code: 'my', dial: '60', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'th', dial: '66', name: 'Thailand', flag: '🇹🇭' },
  { code: 'vn', dial: '84', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'ph', dial: '63', name: 'Philippines', flag: '🇵🇭' },
  { code: 'bn', dial: '673', name: 'Brunei', flag: '🇧🇳' },
  { code: 'kh', dial: '855', name: 'Cambodia', flag: '🇰🇭' },
  { code: 'la', dial: '856', name: 'Laos', flag: '🇱🇦' },
  { code: 'mm', dial: '95', name: 'Myanmar', flag: '🇲🇲' },
  { code: 'cn', dial: '86', name: 'China', flag: '🇨🇳' },
];

export const COUNTRY_BY_CODE = COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c;
  return acc;
}, {});

export const DEFAULT_COUNTRY = COUNTRY_BY_CODE.id;

export default COUNTRIES;