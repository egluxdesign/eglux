// src/hooks/useDisableNumberInputScroll.js
//
// Browser (terutama Chrome) punya behavior default: kalau <input type="number">
// sedang fokus, scroll mouse di atasnya akan nambah/ngurangin value secara
// otomatis. Ini sering bikin user nggak sengaja ubah data (misal stok/harga)
// pas lagi scroll halaman biasa.
//
// Fix: begitu wheel event kedeteksi sementara elemen fokus adalah input
// number, langsung blur elemen itu. Scroll halaman tetap jalan normal,
// cuma value input-nya nggak ikut berubah.
//
// Cara pakai: panggil sekali di komponen root (App.jsx), tidak perlu
// diulang di tiap form/input.

import { useEffect } from 'react';

export function useDisableNumberInputScroll() {
  useEffect(() => {
    const handleWheel = () => {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && active.type === 'number') {
        active.blur();
      }
    };

    // passive: true karena kita tidak preventDefault — cuma blur elemen,
    // jadi scroll halaman tetap smooth seperti biasa.
    document.addEventListener('wheel', handleWheel, { passive: true });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);
}