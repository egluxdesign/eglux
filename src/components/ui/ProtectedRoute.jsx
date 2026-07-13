// src/components/ui/ProtectedRoute.jsx
// ============================================================================
// ProtectedRoute — gate untuk route yang butuh auth + role check
// ============================================================================
// Usage:
//   <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
//     <AdminProductsPage />
//   </ProtectedRoute>
//
//   <ProtectedRoute>  ← tanpa roles = cukup login saja
//     <OrderHistory />
//   </ProtectedRoute>
// ============================================================================

import { useAuth } from '../../context/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children, roles = null }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-eglux-secondary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Memuat...</p>
        </div>
      </div>
    );
  }

  // Not logged in → redirect to /admin login page
  if (!user) {
    return <Navigate to="/admin" state={{ from: location.pathname }} replace />;
  }

  // Role check (kalau roles specified)
  if (roles && role && !roles.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Akses Ditolak</h2>
          <p className="text-gray-500 text-sm mb-6">
            Role Anda ({role}) tidak memiliki izin untuk mengakses halaman ini.
            <br />
            Hubungi administrator jika Anda merasa ini adalah kesalahan.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-eglux-primary text-white rounded-xl font-bold text-sm hover:opacity-90 cursor-pointer"
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  // All checks passed → render children
  return children;
};

export default ProtectedRoute;
