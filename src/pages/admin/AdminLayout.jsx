// src/pages/admin/AdminLayout.jsx
import { useState, useCallback, createContext, useContext } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { LANGUAGES, t } from './i18n';

// ── Lang Context ──────────────────────────────────────────────
export const LangContext = createContext({ lang: 'id', t: (k) => k });
export const useLang = () => useContext(LangContext);

// ── Constants ─────────────────────────────────────────────────
const S = {
  primary:     '#554521',
  primaryHov:  '#6b5829',
  gold:        '#b8943f',
  goldBg:      'rgba(184,148,63,0.12)',
  goldBorder:  'rgba(184,148,63,0.25)',
  sidebarText: 'rgba(255,255,255,0.5)',
  sidebarHov:  'rgba(255,255,255,0.07)',
};

const NAV = [
  { key: 'overview',   icon: 'ti-layout-dashboard', section: 'main'   },
  { key: 'orders',     icon: 'ti-shopping-bag',     section: 'main',  badge: true },
  { key: 'products',   icon: 'ti-package',          section: 'main'   },
  { key: 'customers',  icon: 'ti-users',            section: 'data'   },
  { key: 'payments',   icon: 'ti-credit-card',      section: 'data'   },
  { key: 'settings',   icon: 'ti-settings',         section: 'system' },
];

// ── Sidebar ───────────────────────────────────────────────────
const Sidebar = ({ activeModule, onNavigate, pendingCount, lang, onLangChange, onLogout, isMobileOpen, onMobileClose }) => {
  const tr = (k) => t(lang, k);

  const sections = [
    { id: 'main',   label: tr('nav_main')   },
    { id: 'data',   label: tr('nav_data')   },
    { id: 'system', label: tr('nav_system') },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          onClick={onMobileClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 39 }}
        />
      )}

      <aside style={{
        width: 210, background: S.primary, display: 'flex', flexDirection: 'column',
        flexShrink: 0, height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 40,
        transform: isMobileOpen ? 'translateX(0)' : undefined,
        transition: 'transform 0.25s ease',
      }}
        className="admin-sidebar"
      >
        {/* Logo */}
        <div style={{ padding: '22px 18px 18px', borderBottom: '0.5px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 500, letterSpacing: 3 }}>EGLUX</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 1, marginTop: 3 }}>ADMIN PANEL</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          {sections.map((section) => {
            const items = NAV.filter((n) => n.section === section.id);
            return (
              <div key={section.id} style={{ marginBottom: 22 }}>
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9, letterSpacing: 2, padding: '0 8px', marginBottom: 6 }}>
                  {section.label}
                </div>
                {items.map((item) => {
                  const isActive = activeModule === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => { onNavigate(item.key); onMobileClose?.(); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                        width: '100%', border: isActive ? `0.5px solid ${S.goldBorder}` : '0.5px solid transparent',
                        background: isActive ? S.goldBg : 'transparent',
                        color: isActive ? S.gold : S.sidebarText,
                        fontSize: 13, marginBottom: 1, transition: 'all 0.15s',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = S.sidebarHov; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; }}}
                      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = S.sidebarText; }}}
                    >
                      <i className={`ti ${item.icon}`} style={{ fontSize: 15, width: 16, flexShrink: 0 }} aria-hidden="true" />
                      {tr(`nav_${item.key}`)}
                      {item.badge && pendingCount > 0 && (
                        <span style={{
                          marginLeft: 'auto', background: '#e05c5c', color: '#fff',
                          fontSize: 10, fontWeight: 500, padding: '1px 6px',
                          borderRadius: 10, minWidth: 18, textAlign: 'center',
                        }}>
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Bottom: lang switcher + user */}
        <div style={{ padding: '12px 10px', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
          {/* Lang switcher */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => onLangChange(l.code)}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
                  border: `0.5px solid ${lang === l.code ? S.goldBorder : 'rgba(255,255,255,0.1)'}`,
                  background: lang === l.code ? S.goldBg : 'transparent',
                  color: lang === l.code ? S.gold : 'rgba(255,255,255,0.35)',
                  fontSize: 11, textAlign: 'center', transition: 'all 0.15s',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* User row */}
          <button
            onClick={onLogout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '8px 6px', borderRadius: 8, border: 'none', background: 'transparent',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: S.goldBg,
              border: `0.5px solid ${S.goldBorder}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: S.gold, fontSize: 11, fontWeight: 500, flexShrink: 0,
            }}>A</div>
            <div style={{ flex: 1, textAlign: 'left', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
              Admin EGLUX
            </div>
            <i className="ti ti-logout" style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .admin-sidebar {
            transform: translateX(${isMobileOpen ? '0' : '-100%'}) !important;
          }
        }
      `}</style>
    </>
  );
};

// ── Topbar ────────────────────────────────────────────────────
const Topbar = ({ title, lang, pendingCount, onMenuToggle }) => {
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const now = new Date();
  const dateStr = lang === 'zh'
    ? `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`
    : lang === 'en'
    ? now.toLocaleDateString('en-GB', { weekday:'long', day:'2-digit', month:'short', year:'numeric' })
    : `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <header style={{
      height: 56, background: '#fff', borderBottom: '0.5px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Hamburger — mobile only */}
        <button
          className="mobile-menu-btn"
          onClick={onMenuToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'none' }}
        >
          <i className="ti ti-menu-2" style={{ fontSize: 20, color: 'var(--text-secondary)' }} aria-hidden="true" />
        </button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{dateStr}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {pendingCount > 0 && (
          <div style={{ position: 'relative' }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, border: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}>
              <i className="ti ti-bell" style={{ fontSize: 14 }} aria-hidden="true" />
            </div>
            <span style={{
              position: 'absolute', top: 5, right: 5, width: 7, height: 7,
              borderRadius: '50%', background: '#e05c5c', border: '1.5px solid #fff',
            }} />
          </div>
        )}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: S.goldBg, border: `0.5px solid ${S.goldBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: S.gold, fontSize: 12, fontWeight: 500,
        }}>A</div>
      </div>

      <style>{`
        @media (max-width: 768px) { .mobile-menu-btn { display: block !important; } }
      `}</style>
    </header>
  );
};

// ── AdminLayout ───────────────────────────────────────────────
const AdminLayout = ({ children, activeModule, onNavigate, pendingCount }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('eglux_admin_lang') || 'id');
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLangChange = useCallback((code) => {
    setLang(code);
    localStorage.setItem('eglux_admin_lang', code);
  }, []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const tr = (k) => t(lang, k);
  const titles = {
    overview: tr('overview_title'), orders: tr('orders_title'),
    products: tr('products_title'), customers: tr('customers_title'),
    payments: tr('payments_title'), settings: tr('settings_title'),
  };

  return (
    <LangContext.Provider value={{ lang, t: (k) => t(lang, k) }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f5f0' }}>
        <Sidebar
          activeModule={activeModule}
          onNavigate={onNavigate}
          pendingCount={pendingCount}
          lang={lang}
          onLangChange={handleLangChange}
          onLogout={handleLogout}
          isMobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        {/* Main content — offset by sidebar width */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: 210, minWidth: 0 }}
          className="admin-main">
          <Topbar
            title={titles[activeModule] || 'Admin'}
            lang={lang}
            pendingCount={pendingCount}
            onMenuToggle={() => setMobileOpen((o) => !o)}
          />
          <main style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {children}
          </main>
        </div>

        <style>{`
          @media (max-width: 768px) {
            .admin-main { margin-left: 0 !important; }
          }
        `}</style>
      </div>
    </LangContext.Provider>
  );
};

export default AdminLayout;