// src/App.jsx
// ============================================================================
// App routing — flat routes, tiap page handle layout sendiri.
//
// CartPage di sini sebagai PROVIDER yang wrap seluruh app supaya
// useCartActions() available di semua page. CartPage juga render
// CartPanel + CheckoutModal + CheckoutModalMidtrans + Toast.
//
// Pattern tiap page:
//   <HeaderProducts onCartOpen={openCart} />   ← sticky header + primary nav + swiper
//   <HeroSection />                            ← page-specific hero
//   <DuplicateNav activePage="..." />          ← content sticky nav (self-contained)
//   <main>{content}</main>                     ← page content
//   <Footer />                                 ← footer
// ============================================================================

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import CartPage from './pages/CartPage';
import { useDisableNumberInputScroll } from './hooks/useDisableNumberInputScroll';

// Pages
import HomePage from './pages/HomePage';
import ProductPage from './pages/ProductPage';
import BlogPage from './pages/BlogPage';
import Contact from './pages/ContactPage';
import AboutPage from './pages/AboutPage';
import AffiliatePage from './pages/AffiliatePage';
import RegisterPage from './pages/RegisterPage';
import AdminPage from './pages/AdminPage';
import AdminProductsPage from './pages/AdminProductsPage';
import OrdersPage from './pages/OrdersPage';
import TrackOrderPage from './pages/TrackOrderPage';
import OrderHistoryPage from './pages/OrderHistoryPage';

import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';

// Protected route wrapper
import ProtectedRoute from './components/ui/ProtectedRoute';

const App = () => {
  // Cegah scroll wheel mengubah value di semua <input type="number">
  // di seluruh aplikasi (berlaku global, tidak perlu diulang per form).
  useDisableNumberInputScroll();

  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          {/* CartPage sebagai provider — wrap seluruh app supaya
              useCartActions() available di semua page. CartPage juga
              render CartPanel + CheckoutModal + CheckoutModalMidtrans + Toast. */}
          <CartPage>
            <Routes>
              {/* ── Storefront routes ──
                  Tiap page render layout sendiri (Header + Hero + DuplicateNav + main + Footer). */}
              <Route path="/" element={<HomePage />} />
              <Route path="/products" element={<ProductPage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/affiliate" element={<AffiliatePage />} />

              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />

              {/* ── Standalone routes (tanpa storefront layout) ── */}
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/admin" element={<AdminPage />} />

              {/* ── Account routes ──
                  Terbuka untuk semua role yang sudah login (tidak pakai
                  ProtectedRoute). OrdersPage/OrdersList sudah handle sendiri
                  kasus user belum login (tampil pesan + link masuk). */}
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/track" element={<TrackOrderPage />} />
              <Route path="/order-history" element={<OrderHistoryPage />} />
              {/* ── Protected admin route ──
                  Hanya bisa diakses oleh role: team_dev, master, admin. */}
              <Route
                path="/products-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <AdminProductsPage />
                  </ProtectedRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<HomePage />} />
            </Routes>
          </CartPage>
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
};

export default App;