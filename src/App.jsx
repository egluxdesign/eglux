// src/App.jsx
// ============================================================================
// App routing — flat routes, tiap page handle layout sendiri.
//
// CartPage di sini sebagai PROVIDER yang wrap seluruh app supaya
// useCartActions() available di semua page. CartPage juga render
// CartPanel + CheckoutModal (WhatsApp) + CheckoutModalDoku (DOKU) + Toast.
//
// [v3] Switch dari Midtrans → DOKU Checkout (CheckoutModalDoku)
//
// Pattern tiap page:
//   <HeaderProducts onCartOpen={openCart} />   ← sticky header + primary nav + swiper
//   <HeroSection />                            ← page-specific hero
//   <DuplicateNav activePage="..." />          ← content sticky nav (self-contained)
//   <main>{content}</main>                     ← page content
//   <Footer />                                 ← footer
// ============================================================================

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import CartPage from './pages/CartPage';
import { supabase } from './lib/supabaseClient';

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
import AdminReviewsPage from './pages/AdminReviewsPage';
import AdminReturnsPage from './pages/AdminReturnsPage';
import ShippingInfoPage from './pages/ShippingInfoPage';
import ReturnPolicyPage from './pages/ReturnPolicyPage';
import SalesReportPage from './pages/SalesReportPage';
import PaymentSuccessPage from './pages/PaymentSuccessPage';
import PaymentFailedPage from './pages/PaymentFailedPage';

// Protected route wrapper
import ProtectedRoute from './components/ui/ProtectedRoute';

// ⭐ Customer activity tracking hook (track page views + presence)
import { useUserActivity } from './hooks/useUserActivity';

// ⭐ Wrapper component untuk call hook di dalam BrowserRouter
const StorefrontActivityTracker = () => {
  useUserActivity();
  return null;
};

// ============================================================================
// ⭐ MagicLinkHandler — auto-detect magic link hash fragment + redirect
// ============================================================================
const MagicLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;

    if (!hash.includes('access_token=') || !hash.includes('type=magiclink')) {
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search
          );
          navigate('/', { replace: true });
          subscription?.unsubscribe();
        } else if (event === 'SIGNED_OUT') {
          console.warn('[MagicLinkHandler] SIGNED_OUT — magic link exchange failed, redirect to /admin');
          navigate('/admin', { replace: true });
          subscription?.unsubscribe();
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return null;
};

const App = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <StorefrontActivityTracker />
          <MagicLinkHandler />
          <CartPage>
            <Routes>
              {/* ── Storefront routes ── */}
              <Route path="/" element={<HomePage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/shipping" element={<ShippingInfoPage />} />
              <Route path="/returns-policy" element={<ReturnPolicyPage />} />
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

              {/* ── Payment result routes ── */}
              <Route path="/payment-success" element={<PaymentSuccessPage />} />
              <Route path="/payment-failed" element={<PaymentFailedPage />} />

              {/* ── Protected user routes ── */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin', 'pro', 'verified']}>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />

              {/* ── Protected admin routes ── */}

              <Route
                path="/dashboard-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="dashboard">
                    <DashboardAdminPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/products-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="products">
                    <AdminProductsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/orders-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="orders">
                    <AdminOrdersPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/homepage-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="homepage">
                    <HomepageAdminPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/discount-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="discount">
                    <DiscountAdminPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/points-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="points">
                    <AdminPointsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/users-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="users">
                    <UsersAdminPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reviews-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="reviews">
                    <AdminReviewsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                  path="/returns-admin"
                  element={
                    <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="returns">
                      <AdminReturnsPage />
                    </ProtectedRoute>
                }
              />

              <Route
                path="/sales-report"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="sales_report">
                    <SalesReportPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/blog-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="blog">
                    <BlogAdminPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/about-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="about">
                    <AboutAdminPage />
                  </ProtectedRoute>
                }
              />

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
