// src/hooks/useMidtransSnap.js
//
// Hook buat load script Snap.js Midtrans secara dinamis (gak perlu taruh
// <script> manual di index.html — otomatis milih URL sandbox/production).
//
// Cara pakai:
//   const { snapReady } = useMidtransSnap();
//   ...
//   if (snapReady) window.snap.pay(token, { onSuccess, onPending, onError, onClose });

import { useState, useEffect } from 'react';

// GANTI sesuai environment lu. Client Key AMAN ditaruh di frontend (bukan rahasia),
// beda sama Server Key yang cuma boleh ada di Edge Function.
const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY; // atau process.env.NEXT_PUBLIC_... kalau Next.js
const MIDTRANS_IS_PRODUCTION = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true';

const SNAP_SRC = MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/snap.js'
  : 'https://app.sandbox.midtrans.com/snap/snap.js';

export function useMidtransSnap() {
  const [snapReady, setSnapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // Kalau script udah pernah dimuat (misal komponen lain sudah manggil hook ini duluan)
    if (window.snap) {
      setSnapReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = SNAP_SRC;
    script.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    script.async = true;
    script.onload = () => setSnapReady(true);
    script.onerror = () => setLoadError('Gagal memuat Snap.js. Cek koneksi atau Client Key.');

    document.body.appendChild(script);

    return () => {
      // Sengaja gak dihapus pas unmount — script Snap.js aman dipakai ulang
      // di halaman lain, gak perlu di-load ulang tiap pindah halaman.
    };
  }, []);

  return { snapReady, loadError };
}