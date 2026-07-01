// src/pages/admin/AdminPage.jsx
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AdminLayout from './AdminLayout';
import { t } from './i18n';

const Overview   = lazy(() => import('./modules/Overview'));
const Orders     = lazy(() => import('./modules/Orders'));
const Products   = lazy(() => import('./modules/Products'));
const Customers  = lazy(() => import('./modules/Customers'));
const Payments   = lazy(() => import('./modules/Payments'));
const Settings   = lazy(() => import('./modules/Settings'));

const S = {
  primary: '#554521',
  gold:    '#b8943f',
  goldBg:  'rgba(184,148,63,0.1)',
};

// ── Login Form ────────────────────────────────────────────────
const LoginForm = () => {
  const lang = localStorage.getItem('eglux_admin_lang') || 'id';
  const tr = (k) => t(lang, k);

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(tr('login_error')); setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f7f5f0', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, border: '0.5px solid var(--border)',
        padding: '36px 32px', width: '100%', maxWidth: 380,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 44, height: 44, borderRadius: 12, background: S.primary, marginBottom: 12,
          }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 500, letterSpacing: 2 }}>E</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)' }}>
            {tr('login_title')}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {tr('login_sub')}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
            }}>{tr('login_email')}</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@eglux.id" required
              style={{
                width: '100%', padding: '10px 12px', border: '0.5px solid var(--border)',
                borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
                background: '#fff', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={(e) => { e.target.style.borderColor = S.gold; }}
              onBlur={(e)  => { e.target.style.borderColor = 'var(--border)'; }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
            }}>{tr('login_password')}</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', padding: '10px 36px 10px 12px', border: '0.5px solid var(--border)',
                  borderRadius: 8, fontSize: 13, color: 'var(--text-primary)',
                  background: '#fff', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={(e) => { e.target.style.borderColor = S.gold; }}
                onBlur={(e)  => { e.target.style.borderColor = 'var(--border)'; }}
              />
              <button
                type="button" onClick={() => setShowPass((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 0,
                }}
              >
                <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: 15 }} aria-hidden="true" />
              </button>
            </div>
          </div>

          {error && (
            <div style={{
              background: 'var(--bg-danger)', color: 'var(--text-danger)',
              fontSize: 12, padding: '8px 12px', borderRadius: 8, marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '11px', background: S.primary, color: '#fff',
              border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#6b5829'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = S.primary; }}
          >
            {loading ? tr('login_loading') : tr('login_btn')}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Fallback loader ────────────────────────────────────────────
const ModuleLoader = () => (
  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
    Memuat...
  </div>
);

// ── AdminPage ─────────────────────────────────────────────────
const AdminPage = () => {
  const [session,      setSession]      = useState(undefined);
  const [activeModule, setActiveModule] = useState('overview');
  const [pendingCount, setPendingCount] = useState(0);

  // Auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Fetch pending count buat badge di sidebar
  useEffect(() => {
    if (!session) return;
    const fetchPending = async () => {
      const { count } = await supabase
        .from('orders').select('id', { count: 'exact' }).eq('status', 'pending');
      setPendingCount(count ?? 0);
    };
    fetchPending();
  }, [session, activeModule]);

  if (session === undefined) return null;
  if (!session) return <LoginForm />;

  const MODULES = {
    overview:  <Overview  onNavigate={setActiveModule} />,
    orders:    <Orders    onPendingChange={setPendingCount} />,
    products:  <Products  />,
    customers: <Customers />,
    payments:  <Payments  />,
    settings:  <Settings  />,
  };

  return (
    <AdminLayout
      activeModule={activeModule}
      onNavigate={setActiveModule}
      pendingCount={pendingCount}
    >
      <Suspense fallback={<ModuleLoader />}>
        {MODULES[activeModule]}
      </Suspense>
    </AdminLayout>
  );
};

export default AdminPage;