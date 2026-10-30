// src/main.jsx
// ============================================================================
// App entry point
// ============================================================================
//
// ⚠️ CRITICAL: Sebelum render App, validateEnv() dipanggil.
// Kalau ada required env var yang missing (VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, VITE_DOKU_MODE), EnvErrorPage render sebagai
// pengganti App — dengan instruksi yang jelas.
//
// [v3] Required env vars sekarang: Supabase + DOKU_MODE.
//      Midtrans env vars sudah optional (legacy, gak dipakai setelah switch).
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
  hideLoader();
}
