// src/pages/DiscountAdminPage.jsx
// ============================================================================
// DiscountAdminPage — Wrapper page untuk DiscountManagementPanel
// ============================================================================
// Route: /discount-admin (protected — admin only)
//
// Render:
//   - <AdminLayout> dengan UserMenu yang sama dengan storefront
//   - <DiscountManagementPanel> (variant discounts + voucher placeholder)
// ============================================================================

import { useState, useCallback } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import DiscountManagementPanel from '../components/admin/DiscountManagementPanel';

const DiscountAdminPage = () => {
  // ⭐ Toast handler inline (sederhana)
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <AdminLayout title="Discount & Voucher" subtitle="Kelola discount per variant & voucher codes">
      <DiscountManagementPanel showToast={showToast} />

      {/* Inline toast (simple) */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[3000] px-4 py-3 rounded-lg shadow-2xl text-sm font-medium ${
          toast.type === 'error' ? 'bg-red-600 text-white'
          : toast.type === 'success' ? 'bg-green-600 text-white'
          : toast.type === 'warning' ? 'bg-amber-600 text-white'
          : 'bg-gray-900 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </AdminLayout>
  );
};

export default DiscountAdminPage;
