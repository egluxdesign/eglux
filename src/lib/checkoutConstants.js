// src/lib/checkoutConstants.js
// ============================================================================
// Shared constants for checkout flow.
// Extracted from CheckoutModalMidtrans.jsx to break circular import:
//   CartDrawer → CheckoutModalMidtrans → CartContext → (transitive) → CartDrawer
// By moving constants here, CartDrawer imports constants from this file
// (not from CheckoutModalMidtrans), breaking the synchronous cycle.
// ============================================================================

// sessionStorage key untuk checkout intent (auth-gated checkout flow)
// CartDrawer sets this when user clicks "Bayar Sekarang" without login.
// After login redirect back, CheckoutModalMidtrans reads this to auto-open.
export const CHECKOUT_INTENT_KEY = 'eglux_checkout_intent';

// Fallback PPN percentage (3%) jika tidak ada di app_settings table
export const TAX_PERCENT_FALLBACK = 3;