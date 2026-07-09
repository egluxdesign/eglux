import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import CartPage from './pages/CartPage';
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import BlogPage from './pages/BlogPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import AffiliatePage from './pages/AffiliatePage';
import AdminProductsPage from './pages/AdminProductsPage';

// ── Lazy-load AdminPage agar Supabase + Recharts + seluruh komponen admin
//    tidak ikut dimuat di bundle utama. Visitor storefront (99% traffic)
//    tidak pernah men-download kode admin panel. ──────────────────────────
const AdminPage = lazy(() => import('./pages/AdminPage'));

// ── Loading fallback sederhana saat chunk admin di-download ─────────────
const AdminFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#f8f9fc]">
    <div className="w-8 h-8 border-3 border-[#c9a96e] border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <BrowserRouter>
    <CartProvider>
      <CartPage>
        <Routes>
          <Route path="/"         element={<HomePage />} />
          <Route path="/products" element={<ProductPage />} />
          <Route path="/blog"     element={<BlogPage />} />
          <Route path="/about"    element={<AboutPage />} />
          <Route path="/contact"  element={<ContactPage />} />
          <Route path="/affiliate" element={<AffiliatePage />} />
          <Route path="/products-admin" element={<AdminProductsPage />} />
          <Route
            path="/admin"
            element={
              <Suspense fallback={<AdminFallback />}>
                <AdminPage />
              </Suspense>
            }
          />
        </Routes>
      </CartPage>
    </CartProvider>
  </BrowserRouter>
);

export default App;
