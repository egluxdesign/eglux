// src/hooks/useMidtrans.js
import { useEffect } from 'react';

export const useMidtrans = (clientKey) => {
  useEffect(() => {
    if (!clientKey) return;

    // Tentukan URL berdasarkan mode di .env
    const isProduction = import.meta.env.VITE_MIDTRANS_MODE === 'production';
    const baseUrl = isProduction 
      ? "https://app.midtrans.com/snap/snap.js" 
      : "https://app.sandbox.midtrans.com/snap/snap.js";

    const script = document.createElement('script');
    script.src = baseUrl;
    script.setAttribute('data-client-key', clientKey);
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, [clientKey]);
};