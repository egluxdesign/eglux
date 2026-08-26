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

// Pages
import HomePage from './pages/HomePage';
import BlogPage from './pages/BlogPage';
import Contact from './pages/ContactPage';
import AboutPage from './pages/AboutPage';
import AffiliatePage from './pages/AffiliatePage';
import RegisterPage from './pages/RegisterPage';
import MembershipPage from './pages/MembershipPage';
import AdminPage from './pages/AdminPage';
import AdminProductsPage from './pages/AdminProductsPage';
import OrdersPage from './pages/OrdersPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import TrackOrderPage from './pages/TrackOrderPage';
import HomepageAdminPage from './pages/HomepageAdminPage';
import DiscountAdminPage from './pages/DiscountAdminPage';
import BlogAdminPage from './pages/BlogAdminPage';
import AboutAdminPage from './pages/AboutAdminPage';
import ContactAdminPage from './pages/ContactAdminPage';
import AdminOrdersPage from './pages/AdminOrdersPage';
import UnsubscribePage from './pages/UnsubscribePage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';

// Protected route wrapper
import ProtectedRoute from './components/ui/ProtectedRoute';

const App = () => {
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
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/membership" element={<MembershipPage />} />

              {/* ── Standalone routes (tanpa storefront layout) ── */}
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/order-history" element={<OrderHistoryPage />} />
              <Route path="/track" element={<TrackOrderPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />

              {/* ── Protected admin routes ──
                  Hanya bisa diakses oleh role: team_dev, master, admin. */}
              <Route
                path="/products-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <AdminProductsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/homepage-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <HomepageAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/discount-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <DiscountAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/blog-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <BlogAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/about-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <AboutAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contact-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <ContactAdminPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/orders-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']}>
                    <AdminOrdersPage />
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
