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

// ⭐ Supabase Storage — dashboard-icons bucket
// URL pattern: https://{project}.supabase.co/storage/v1/object/public/dashboard-icons/{filename}
export const SUPABASE_PROJECT_ID = 'mbuwpjxpxvnsxjusrnlk';
export const DASHBOARD_ICONS_BUCKET = 'dashboard-icons';
export const DASHBOARD_ICONS_BASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co/storage/v1/object/public/${DASHBOARD_ICONS_BUCKET}`;

/** Build full SVG URL for a given icon key */
export const iconUrl = (key) => `${DASHBOARD_ICONS_BASE_URL}/${key}.svg`;

// Role default permissions
const ROLE_DEFAULTS = {
  team_dev: {
    dashboard: true, products: true, orders: true, discount: true,
    points: true, homepage: true, blog: true, about: true, contact: true,
    users: true, reviews: true, returns: true,
    // ⭐ Dashboard sub-sections (granular control)
    dashboard_revenue: true, dashboard_health: true, dashboard_conversion: true,
    dashboard_marketing: true, dashboard_finance: true, dashboard_category: true,
    dashboard_traffic: true, dashboard_visitor: true, dashboard_team: true,
    dashboard_customer: true,
  },
  master: {
    dashboard: true, products: true, orders: true, discount: true,
    points: true, homepage: true, blog: true, about: true, contact: true,
    users: true, reviews: true, returns: true,
    // ⭐ Dashboard sub-sections (granular control)
    dashboard_revenue: true, dashboard_health: true, dashboard_conversion: true,
    dashboard_marketing: true, dashboard_finance: true, dashboard_category: true,
    dashboard_traffic: true, dashboard_visitor: true, dashboard_team: true,
    dashboard_customer: true,
  },
  admin: {
    dashboard: true, products: true, orders: true, discount: false,
    points: false, homepage: false, blog: false, about: false, contact: false,
    users: false, reviews: false, returns: false,
    // ⭐ Dashboard sub-sections (default: all true for admin, bisa di-override)
    dashboard_revenue: true, dashboard_health: true, dashboard_conversion: true,
    dashboard_marketing: true, dashboard_finance: true, dashboard_category: true,
    dashboard_traffic: true, dashboard_visitor: true, dashboard_team: true,
    dashboard_customer: true,
  },
};

// All available admin pages
// `icon`       — emoji fallback (kalau SVG gagal load / untuk place older)
// `iconSvg`    — full URL ke SVG di Supabase storage bucket `dashboard-icons`
//                Pattern: https://mbuwpjxpxvnsxjusrnlk.supabase.co/storage/v1/object/public/dashboard-icons/{key}.svg
export const ADMIN_PAGES = [
  { key: 'dashboard', label: 'Dashboard',          href: '/dashboard-admin', icon: '📊', iconSvg: iconUrl('dashboard') },
  { key: 'products',  label: 'Products Admin',     href: '/products-admin',  icon: '📦', iconSvg: iconUrl('products') },
  { key: 'orders',    label: 'Pesanan Aktif',      href: '/orders-admin',    icon: '📋', iconSvg: iconUrl('orders') },
  { key: 'discount',  label: 'Discount & Voucher', href: '/discount-admin',  icon: '🏷️', iconSvg: iconUrl('discounts') },
  { key: 'points',    label: 'Points Management',  href: '/points-admin',    icon: '⭐', iconSvg: iconUrl('points') },
  { key: 'users',     label: 'User Management',    href: '/users-admin',     icon: '👥', iconSvg: iconUrl('users') },
  { key: 'reviews',   label: 'Reviews',            href: '/reviews-admin',   icon: '⭐', iconSvg: iconUrl('review') },
  { key: 'returns',   label: 'Return & Refund',    href: '/returns-admin',  icon: '↩️', iconSvg: iconUrl('returns') },
  { key: 'homepage',  label: 'Homepage Content',   href: '/homepage-admin',  icon: '🏠', iconSvg: iconUrl('homepage') },
  { key: 'blog',      label: 'Blog',               href: '/blog-admin',       icon: '📝', iconSvg: iconUrl('blog') },
  { key: 'about',     label: 'About Page',         href: '/about-admin',      icon: 'ℹ️', iconSvg: iconUrl('about') },
  { key: 'contact',   label: 'Contact Page',       href: '/contact-admin',    icon: '📞', iconSvg: iconUrl('contact') },
];

// ⭐ Dashboard sub-sections (granular control per admin)
// Dipakai di UsersAdminPage untuk render sub-checkboxes di bawah "Dashboard"
// Note: sub-sections tetap pakai emoji (SVG icons hanya untuk sidebar nav utama)
export const DASHBOARD_SECTIONS = [
  { key: 'dashboard_revenue',    label: 'Revenue & KPI Cards',           icon: '💰' },
  { key: 'dashboard_health',     label: 'Shop Health Score',            icon: '🏪' },
  { key: 'dashboard_conversion', label: 'Conversion Funnel',             icon: '📈' },
  { key: 'dashboard_marketing',  label: 'Marketing Center',             icon: '📣' },
  { key: 'dashboard_finance',    label: 'Finance Summary',              icon: '💵' },
  { key: 'dashboard_category',   label: 'Sales by Category',           icon: '📊' },
  { key: 'dashboard_traffic',    label: 'Traffic Sources',              icon: '🌐' },
  { key: 'dashboard_visitor',    label: 'Visitor Analytics',            icon: '👁️' },
  { key: 'dashboard_team',       label: 'Team Activity & Online Admins', icon: '🟢' },
  { key: 'dashboard_customer',   label: 'Customer Activity & Online',   icon: '👥' },
];

/**
 * Check if user can access a specific admin page or dashboard section
 * @param {string} page - Page key (e.g., 'dashboard', 'dashboard_finance', 'products')
 * @param {object} profile - User profile from useAuth()
 * @returns {boolean} - true if user can access, false otherwise
 */
export function canAccess(page, profile) {
  if (!profile) return false;

  const role = profile.role;

  // team_dev + master = always full access (semua section dashboard + semua page)
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
 * Alias untuk canAccess — dipakai di DashboardAdminPage untuk check per section
 * @param {string} sectionKey - e.g., 'dashboard_finance', 'dashboard_team'
 * @param {object} profile - User profile
 * @returns {boolean}
 */
export function canAccessSection(sectionKey, profile) {
  return canAccess(sectionKey, profile);
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
