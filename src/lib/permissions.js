// src/lib/permissions.js
// ============================================================================
// canAccess — Check if user can access a specific admin page
// ============================================================================
//
// Logic:
//   1. team_dev = god mode (always true, gak bisa di-restrict)
//   2. master = always full access (gak bisa di-restrict)
//   3. admin = cek admin_permissions JSONB:
//      - Kalau ada key untuk page → pakai value (true/false)
//      - Kalau gak ada key → pakai role default
//      - Kalau admin_permissions = NULL → pakai role default
//
// Usage:
//   import { canAccess } from '../lib/permissions';
//   if (canAccess('discount', profile)) { ... }
// ============================================================================

// Role default permissions
const ROLE_DEFAULTS = {
  team_dev: {
    dashboard: true, products: true, orders: true, discount: true,
    points: true, homepage: true, blog: true, about: true, contact: true,
    users: true,
  },
  master: {
    dashboard: true, products: true, orders: true, discount: true,
    points: true, homepage: true, blog: true, about: true, contact: true,
    users: true,
  },
  admin: {
    dashboard: true, products: true, orders: true, discount: false,
    points: false, homepage: false, blog: false, about: false, contact: false,
    users: false,
  },
};

// All available admin pages
export const ADMIN_PAGES = [
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard-admin', icon: '📊' },
  { key: 'products', label: 'Products Admin', href: '/products-admin', icon: '📦' },
  { key: 'orders', label: 'Pesanan Aktif', href: '/orders-admin', icon: '📋' },
  { key: 'discount', label: 'Discount & Voucher', href: '/discount-admin', icon: '🏷️' },
  { key: 'points', label: 'Points Management', href: '/points-admin', icon: '⭐' },
  { key: 'users', label: 'User Management', href: '/users-admin', icon: '👥' },
  { key: 'homepage', label: 'Homepage Content', href: '/homepage-admin', icon: '🏠' },
  { key: 'blog', label: 'Blog', href: '/blog-admin', icon: '📝' },
  { key: 'about', label: 'About Page', href: '/about-admin', icon: 'ℹ️' },
  { key: 'contact', label: 'Contact Page', href: '/contact-admin', icon: '📞' },
];

/**
 * Check if user can access a specific admin page
 * @param {string} page - Page key (e.g., 'dashboard', 'products', 'discount')
 * @param {object} profile - User profile from useAuth()
 * @returns {boolean} - true if user can access, false otherwise
 */
export function canAccess(page, profile) {
  if (!profile) return false;

  const role = profile.role;
  
  // team_dev + master = always full access
  if (role === 'team_dev' || role === 'master') return true;

  // Get role defaults
  const defaults = ROLE_DEFAULTS[role] || {};

  // Get custom permissions (override)
  const custom = profile.admin_permissions || {};

  // Custom override wins over default
  if (custom[page] !== undefined && custom[page] !== null) {
    return custom[page] === true;
  }

  // Fall back to role default
  return defaults[page] === true;
}

/**
 * Get list of pages user can access (for sidebar rendering)
 * @param {object} profile - User profile
 * @returns {Array} - Array of page objects that user can access
 */
export function getAccessiblePages(profile) {
  return ADMIN_PAGES.filter(page => canAccess(page.key, profile));
}

/**
 * Get default permissions for a role (for reset button in user management)
 * @param {string} role
 * @returns {object} - permissions object
 */
export function getDefaultPermissions(role) {
  return { ...ROLE_DEFAULTS[role] };
}

export default canAccess;
