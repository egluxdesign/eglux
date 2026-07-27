// src/pages/HomepageAdminPage.jsx
// ============================================================================
// HomepageAdminPage — Wrapper page untuk HomepageContentPanel
// ============================================================================
// Route: /homepage-admin (protected — admin only)
//
// Render:
//   - <AdminLayout> dengan UserMenu yang sama dengan HeaderProducts
//   - <HomepageContentPanel> (banner + categories management)
// ============================================================================

import { useState, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import HomepageContentPanel from '../components/admin/HomepageContentPanel';

const HomepageAdminPage = () => {
  // ⭐ Toast handler inline (sederhana) — HomepageContentPanel butuh showToast
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <AdminLayout title="Homepage Content" subtitle="Kelola banner & kategori homepage">
      <HomepageContentPanel showToast={showToast} />

      {/* Inline toast (simple) */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[3000] px-4 py-3 rounded-lg shadow-2xl text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white'
          : toast.type === 'success' ? 'bg-green-600 text-white'
          : 'bg-gray-900 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </AdminLayout>
  );
};

export default HomepageAdminPage;
