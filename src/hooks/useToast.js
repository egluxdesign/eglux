// src/hooks/useToast.js
// ============================================================================
// useToast — hook untuk menampilkan notifikasi toast singkat.
//
// Pemakaian:
//   const { toast, showToast, closeToast } = useToast();
//   // ... di JSX:
//   <Toast toast={toast} onClose={closeToast} />
//
//   // trigger:
//   showToast('Item ditambahkan ke keranjang', 'success');
//   showToast('Gagal upload foto', 'error');
//   showToast('Tips: gunakan kode POS untuk cek ongkir', 'info');
// ============================================================================

import { useState, useCallback } from 'react';

export const useToast = () => {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    // Generate ID supaya Toast component tau kalau ini toast baru
    // (effect re-run untuk auto-dismiss timer)
    setToast({ id: Date.now(), message, type });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return { toast, showToast, closeToast };
};

export default useToast;
