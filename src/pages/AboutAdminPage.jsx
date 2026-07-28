// src/pages/AboutAdminPage.jsx
import { useState, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import AboutAdminPanel from '../components/admin/AboutAdminPanel';

const AboutAdminPage = () => {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <AdminLayout title="About Page" subtitle="Edit konten halaman About">
      <AboutAdminPanel showToast={showToast} />
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[3000] px-4 py-3 rounded-lg shadow-2xl text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white'
          : toast.type === 'success' ? 'bg-green-600 text-white'
          : 'bg-gray-900 text-white'
        }`}>{toast.message}</div>
      )}
    </AdminLayout>
  );
};

export default AboutAdminPage;
