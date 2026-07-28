// src/pages/BlogAdminPage.jsx
// ============================================================================
// BlogAdminPage — Wrapper page untuk BlogAdminPanel
// ============================================================================

import { useState, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import BlogAdminPanel from '../components/admin/BlogAdminPanel';

const BlogAdminPage = () => {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <AdminLayout title="Blog" subtitle="Kelola artikel blog EGLUX">
      <BlogAdminPanel showToast={showToast} />

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

export default BlogAdminPage;
