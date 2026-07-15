// src/hooks/useMidtransSnap.js
import { useState, useEffect } from 'react';

const MIDTRANS_CLIENT_KEY = import.meta.env.VITE_MIDTRANS_CLIENT_KEY;
const MIDTRANS_IS_PRODUCTION = import.meta.env.VITE_MIDTRANS_IS_PRODUCTION === 'true';

const SNAP_SRC = MIDTRANS_IS_PRODUCTION
  ? 'https://app.midtrans.com/snap/snap.js'
  : 'https://app.sandbox.midtrans.com/snap/snap.js';

export function useMidtransSnap() {
  const [snapReady, setSnapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // Kalau script udah pernah dimuat (misal komponen lain sudah manggil hook ini duluan)
    if (window.snap && typeof window.snap.pay === 'function') {
      setSnapReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = SNAP_SRC;
    script.setAttribute('data-client-key', MIDTRANS_CLIENT_KEY);
    script.async = true;
    
    script.onload = () => {
      if (window.snap && typeof window.snap.pay === 'function') {
        setSnapReady(true);
      } else {
        setLoadError('Snap.js loaded but API not ready');
      }
    };
    
    script.onerror = () => setLoadError('Gagal memuat Snap.js. Cek koneksi atau Client Key.');

    document.body.appendChild(script);

    return () => {
      // Sengaja gak dihapus pas unmount — script Snap.js aman dipakai ulang
      // di halaman lain, gak perlu di-load ulang tiap pindah halaman.
    };
  }, []);

  return { snapReady, loadError };
}