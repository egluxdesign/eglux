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
import MembershipPage from './pages/MembershipPage';
import RegisterPage from './pages/RegisterPage';
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
import AdminPointsPage from './pages/AdminPointsPage';
import UsersAdminPage from './pages/UsersAdminPage';
import ClaimPointsPage from './pages/ClaimPointsPage';
import RewardsPage from './pages/RewardsPage';
import DashboardAdminPage from './pages/DashboardAdminPage';
import UnsubscribePage from './pages/UnsubscribePage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Protected route wrapper
import ProtectedRoute from './components/ui/ProtectedRoute';

const App = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <CartPage>
            <Routes>
              {/* ── Storefront routes ── */}
              <Route path="/" element={<HomePage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/membership" element={<MembershipPage />} />
              <Route path="/claim-points" element={<ClaimPointsPage />} />
              <Route path="/rewards" element={<RewardsPage />} />

              {/* ── Standalone routes ── */}
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/order-history" element={<OrderHistoryPage />} />
              <Route path="/track" element={<TrackOrderPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />

              {/* ── Auth routes (public) ── */}
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* ── Protected user routes ── */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin', 'pro', 'verified']}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* ── Protected admin routes ──
                  ⭐ page prop = check canAccess() for custom permissions */}

              {/* Dashboard — all admin roles */}
              <Route
                path="/dashboard-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="dashboard">
                    <DashboardAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Products — all admin roles */}
              <Route
                path="/products-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="products">
                    <AdminProductsPage />
                  </ProtectedRoute>
                }
              />

              {/* Orders — all admin roles */}
              <Route
                path="/orders-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="orders">
                    <AdminOrdersPage />
                  </ProtectedRoute>
                }
              />

              {/* Homepage — team_dev + master only */}
              <Route
                path="/homepage-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="homepage">
                    <HomepageAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Discount & Voucher — team_dev + master only */}
              <Route
                path="/discount-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="discount">
                    <DiscountAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Points Management — team_dev + master only */}
              <Route
                path="/points-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="points">
                    <AdminPointsPage />
                  </ProtectedRoute>
                }
              />

              {/* User Management — team_dev + master only */}
              <Route
                path="/users-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="users">
                    <UsersAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Blog — team_dev + master only */}
              <Route
                path="/blog-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="blog">
                    <BlogAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* About — team_dev + master only */}
              <Route
                path="/about-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="about">
                    <AboutAdminPage />
                  </ProtectedRoute>
                }
              />

              {/* Contact — team_dev + master only */}
              <Route
                path="/contact-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="contact">
                    <ContactAdminPage />
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
