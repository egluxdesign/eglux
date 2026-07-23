// src/main.jsx
// ============================================================================
// App entry point
// ============================================================================
//
// ⚠️ CRITICAL: Sebelum render App, validateEnv() dipanggil.
// Kalau ada required env var yang missing (mis. VITE_MIDTRANS_CLIENT_KEY),
// EnvErrorPage render sebagai pengganti App — dengan instruksi yang jelas.
//
// Tanpa validation ini, user baru tau env var missing saat fitur tertentu
// gagal (mis. klik "Lanjutkan Pembayaran" → "Midtrans client key not configured"
// yang mysterious). Dengan EnvErrorPage, error terdeteksi di startup.
// ============================================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { validateEnv } from './lib/env';
import EnvErrorPage from './components/ui/EnvErrorPage';

// ⭐ Startup validation: cek semua required env vars
const { valid, missing } = validateEnv();

const root = ReactDOM.createRoot(document.getElementById('root'));

const hideLoader = () => {
  // ⭐ Hide pre-hydration loader setelah App render.
  // requestAnimationFrame → pastikan paint pertama selesai dulu, supaya
  // gak ada flash of empty content (FOEC) sebelum App visible.
  requestAnimationFrame(() => {
    if (typeof window.hideEgluxLoader === 'function') {
      window.hideEgluxLoader();
    }
  });
};

if (!valid) {
  // Render EnvErrorPage sebagai pengganti App
  root.render(
    <React.StrictMode>
      <EnvErrorPage missing={missing} />
    </React.StrictMode>
  );
  hideLoader();
} else {
  // Env OK — render App normal
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // ⭐ Hide loader setelah React commit pertama selesai.
  // flushSync gak dipakai di sini karena createRoot.render sudah synchronous
  // untuk initial mount di React 18+ — requestAnimationFrame cukup.
  hideLoader();
}
