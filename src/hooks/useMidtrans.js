// src/hooks/useMidtrans.js
import { useEffect } from 'react';

export const useMidtrans = (clientKey) => {
  useEffect(() => {
    console.log("Hook useMidtrans dipanggil, ClientKey:", clientKey); // <--- CEK INI
    
    if (!clientKey) {
      console.error("Midtrans Client Key tidak ditemukan!");
      return;
    }

    const script = document.createElement('script');
    // ... sisa kode Anda ...
    script.onload = () => console.log("Snap script berhasil dimuat"); // <--- CEK INI
    
    document.body.appendChild(script);
    // ...
  }, [clientKey]);
};