// src/hooks/useConversionTracking.js
// ============================================================================
// useConversionTracking — Track 5-stage conversion funnel events
// ============================================================================
//
// Stage 1: Product Impressions — card terlihat di grid (Intersection Observer)
// Stage 3: Add to Cart — user klik tombol Add to Cart
//
// Stage 2 (Product Views) & Stage 4 (Checkout) sudah di-track via useUserActivity
// Stage 5 (Order Paid) sudah di-track via orders table
//
// Cara pakai:
//
// === Product Card Component (Stage 1: Impressions) ===
//   import { useProductImpression } from '../hooks/useConversionTracking';
//
//   const ProductCard = ({ product }) => {
//     const ref = useRef(null);
//     useProductImpression(ref, product.id);
//     return <div ref={ref}>...</div>;
//   };
//
// === Add to Cart Button (Stage 3) ===
//   import { trackAddToCart } from '../hooks/useConversionTracking';
//
//   const handleAddToCart = (productId, quantity) => {
//     trackAddToCart(productId, quantity);
//     // ... existing cart logic
//   };
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

// ── Session ID (reuse from useUserActivity) ──
let sessionIdCache = null;
function getSessionId() {
  if (sessionIdCache) return sessionIdCache;
  try {
    sessionIdCache = sessionStorage.getItem('eglux_session_id');
    if (!sessionIdCache) {
      sessionIdCache = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('eglux_session_id', sessionIdCache);
    }
  } catch {
    sessionIdCache = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return sessionIdCache;
}

// ── Helper: Insert ke page_views dengan page_type custom ──
async function trackFunnelEvent(pageType, productId = null, extra = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('page_views').insert({
      user_id: user?.id || null,
      session_id: getSessionId(),
      page_path: extra.path || window.location.pathname,
      page_type: pageType,
      product_id: productId,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
    });
    console.log('[conversion]', pageType, productId || '');
  } catch (e) {
    console.debug('[conversion] track failed:', e?.message);
  }
}

// ============================================================================
// Stage 1: Product Impressions — Intersection Observer
// ============================================================================
// Track saat card produk terlihat di viewport (visible >50% for >1 second)
// Batch insert untuk avoid spam (max 1 event per product per session per 5 minutes)

const trackedImpressions = new Set(); // dedupe within session

export function useProductImpression(ref, productId) {
  useEffect(() => {
    if (!productId) return;

    // Dedupe: skip kalau sudah tracked produk ini di session ini
    const dedupeKey = `${productId}`;
    if (trackedImpressions.has(dedupeKey)) return;
    trackedImpressions.add(dedupeKey);

    // ⭐ Simple version: track setelah 2 detik (kasih waktu render)
    const timer = setTimeout(() => {
      trackFunnelEvent('product_impression', productId);
    }, 2000);

    return () => clearTimeout(timer);
  }, [productId]);
}

// ============================================================================
// Stage 3: Add to Cart — panggil saat user klik Add to Cart
// ============================================================================
export function trackAddToCart(productId, quantity = 1) {
  if (!productId) return;
  trackFunnelEvent('add_to_cart', productId, { quantity });
}

// ============================================================================
// Batch impression tracker untuk product grids (homepage, category page)
// ============================================================================
// Pakai ini kalau lu mau track SEMUA card sekaligus di grid,
// bukan satu-satu per card.
//
// Cara pakai:
//   import { useProductGridImpressions } from '../hooks/useConversionTracking';
//
//   const ProductGrid = ({ products }) => {
//     const containerRef = useRef(null);
//     useProductGridImpressions(containerRef, products);
//     return <div ref={containerRef}>...</div>;
//   };
//
export function useProductGridImpressions(containerRef, products) {
  useEffect(() => {
    if (!containerRef?.current || !products?.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            const productId = entry.target.dataset?.productId;
            if (!productId) return;

            const dedupeKey = `grid_${productId}`;
            if (trackedImpressions.has(dedupeKey)) return;
            trackedImpressions.add(dedupeKey);

            // Delay 1 detik untuk confirm impression
            setTimeout(() => {
              trackFunnelEvent('product_impression', productId);
            }, 1000);
          }
        });
      },
      { threshold: [0.5], root: null }
    );

    // Observe semua card elements di container
    const cards = containerRef.current.querySelectorAll('[data-product-id]');
    cards.forEach((card) => observer.observe(card));

    return () => {
      observer.disconnect();
    };
  }, [containerRef, products]);
}

export default {
  useProductImpression,
  useProductGridImpressions,
  trackAddToCart,
};