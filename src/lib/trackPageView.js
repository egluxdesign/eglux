// src/lib/trackPageView.js
// ============================================================================
// Helper untuk track page views ke Supabase (untuk dashboard conversion rate)
// ============================================================================
//
// Cara pakai:
//   import { trackPageView } from '../lib/trackPageView';
//
//   // Di HomePage.jsx (useEffect)
//   useEffect(() => { trackPageView('home'); }, []);
//
//   // Di ProductDetailPage.jsx (useEffect, dengan product_id)
//   useEffect(() => { trackPageView('product', product.id); }, [product.id]);
//
//   // Di CategoryPage.jsx
//   useEffect(() => { trackPageView('category'); }, []);
//
// Non-blocking: gak await, gak throw error kalau gagal.
// ============================================================================

import { supabase } from './supabaseClient';

let sessionId = null;

// Generate session ID (persist di sessionStorage supaya 1 session = 1 visitor)
function getSessionId() {
  if (sessionId) return sessionId;
  try {
    sessionId = sessionStorage.getItem('eglux_session_id');
    if (!sessionId) {
      sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('eglux_session_id', sessionId);
    }
  } catch {
    // sessionStorage might be disabled (incognito, etc) — fallback to random
    sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return sessionId;
}

/**
 * Track page view ke Supabase page_views table.
 *
 * @param {string} pageType - 'home' | 'product' | 'category' | 'checkout' | 'other'
 * @param {string|null} productId - UUID produk (hanya untuk pageType='product')
 * @param {object} extra - { referrer, customPath } optional
 */
export async function trackPageView(pageType = 'other', productId = null, extra = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const insertData = {
      user_id: user?.id || null,
      session_id: getSessionId(),
      page_path: extra.customPath || window.location.pathname,
      page_type: pageType,
      product_id: productId,
      referrer: extra.referrer || document.referrer || null,
      user_agent: navigator.userAgent,
    };

    // Insert via anon key (RLS allow anon INSERT)
    await supabase.from('page_views').insert(insertData);
  } catch (e) {
    // Silent fail — tracking gak boleh break user experience
    console.debug('[trackPageView] Failed (silent):', e?.message);
  }
}

/**
 * Helper khusus untuk product page.
 * Pakai ini di ProductDetailPage.jsx
 */
export function trackProductView(productId) {
  return trackPageView('product', productId);
}

/**
 * Helper khusus untuk homepage.
 * Pakai ini di HomePage.jsx
 */
export function trackHomeView() {
  return trackPageView('home');
}

/**
 * Helper khusus untuk checkout page.
 * Pakai ini di CheckoutModal.jsx saat modal dibuka
 */
export function trackCheckoutView() {
  return trackPageView('checkout');
}

/**
 * Helper khusus untuk category page.
 */
export function trackCategoryView() {
  return trackPageView('category');
}
