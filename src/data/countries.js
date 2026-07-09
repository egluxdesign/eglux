// src/data/countries.js
// ============================================================================
// Top 50 negara untuk phone input selector.
// Format: { code, dial, name, flag }
//   - code: ISO 3166-1 alpha-2 (lowercase) — untuk key
//   - dial: ITU country calling code (tanpa "+")
//   - name: nama negara (English, untuk search & display)
//   - flag: emoji flag (rendered as 2-char regional indicator)
//
// Default: Indonesia (id, +62) — di-set di component, bukan di sini.
// ============================================================================

export const COUNTRIES = [
  // === ASEAN (10) ===
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

  // === East Asia (5) ===
  { code: 'jp', dial: '81', name: 'Japan', flag: '🇯🇵' },
  { code: 'kr', dial: '82', name: 'South Korea', flag: '🇰🇷' },
  { code: 'cn', dial: '86', name: 'China', flag: '🇨🇳' },
  { code: 'hk', dial: '852', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'tw', dial: '886', name: 'Taiwan', flag: '🇹🇼' },
];