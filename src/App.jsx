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

// Protected route wrapper
import ProtectedRoute from './components/ui/ProtectedRoute';

// ⭐ Customer activity tracking hook (track page views + presence)
import { useUserActivity } from './hooks/useUserActivity';

// ⭐ Wrapper component untuk call hook di dalam BrowserRouter
// (useLocation() butuh Router context)
const StorefrontActivityTracker = () => {
  useUserActivity();
  return null; // gak render apa-apa, cuma track
};

// ============================================================================
// ⭐ MagicLinkHandler — auto-detect magic link hash fragment + redirect
// ============================================================================
// Setelah OTP verify sukses, edge function generate Supabase magic link.
// Magic link redirect balik ke storefront dengan URL kayak:
//   http://localhost:5173/#access_token=eyJ...&type=magiclink
//
// supabase-js seharusnya auto-exchange token ini jadi session, TAPI kalau
// SPA gak detect hash dengan benar, session gak ke-set. Handler ini:
//   1. Detect URL hash berisi access_token + type=magiclink
//   2. Listen onAuthStateChange buat SIGNED_IN event
//   3. Setelah session set → clean hash dari URL (security best practice)
//   4. Redirect ke /orders (atau path lain yang sesuai)
//
// Dipanggil di dalam <BrowserRouter> supaya useNavigate() jalan.
// ============================================================================
const MagicLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;

    // Cek apakah URL hash berisi magic link tokens (dari OTP login)
    if (!hash.includes('access_token=') || !hash.includes('type=magiclink')) {
      return; // Bukan magic link URL, skip
    }

    // console.log('[MagicLinkHandler] Magic link hash detected, waiting for session...');

    // supabase-js auto-exchange hash tokens jadi session (detectSessionInUrl: true default).
    // Tunggu SIGNED_IN event, lalu redirect ke /orders.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // console.log('[MagicLinkHandler] Auth event:', event, 'Email:', session?.user?.email);

        if (event === 'SIGNED_IN' && session?.user) {
          // Bersihkan hash dari URL (security — biar token gak keliatan di address bar)
          window.history.replaceState(
            null,
            '',
            window.location.pathname + window.location.search
          );

          // console.log('[MagicLinkHandler] ✓ Session set, redirecting to /orders...');

          // Redirect ke /orders (atau route lain kalau mau)
          navigate('/', { replace: true });

          // Unsubscribe setelah redirect (one-time handler)
          subscription?.unsubscribe();
        } else if (event === 'SIGNED_OUT') {
          // Kalau session gak ke-set (exchange gagal), kembali ke /admin login
          console.warn('[MagicLinkHandler] SIGNED_OUT — magic link exchange failed, redirect to /admin');
          navigate('/admin', { replace: true });
          subscription?.unsubscribe();
        }
      }
    );

    // Cleanup kalau component unmount sebelum SIGNED_IN
    return () => {
      subscription?.unsubscribe();
    };
  }, [navigate]);

  return null; // Gak render apa-apa
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

              {/* Reviews — all admin roles */}
              <Route
                path="/reviews-admin"
                element={
                  <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="reviews">
                    <AdminReviewsPage />
                  </ProtectedRoute>
                }
              />

              {/* Returns & Refunds — team_dev + master only */}
              <Route
                  path="/returns-admin"
                  element={
                    <ProtectedRoute roles={['team_dev', 'master', 'admin']} page="returns">
                      <AdminReturnsPage />
                    </ProtectedRoute>
                }
              />

              {/* Sales Report (Shopee-style) — team_dev + master only */}
              <Route
                path="/sales-report"
                element={
                  <ProtectedRoute roles={['team_dev', 'master']} page="sales_report">
                    <SalesReportPage />
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