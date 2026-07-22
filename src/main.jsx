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
import './assets/styles/globals.css';
import './assets/styles/header.css';  // atau path yang sesuai
import './styles/eglux-design-system.css';

// ⭐ Startup validation: cek semua required env vars
const { valid, missing } = validateEnv();

if (!valid) {
  // Render EnvErrorPage sebagai pengganti App
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <EnvErrorPage missing={missing} />
    </React.StrictMode>
  );
} else {
  // Env OK — render App normal
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
