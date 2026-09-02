// src/pages/UsersAdminPage.jsx
// ============================================================================
// UsersAdminPage — Admin manage user roles + permissions + audit log
// ============================================================================
// 3 Tabs:
//   1. User List  — list all admin/master users, edit permissions per user, demote
//   2. Promote    — search registered user by email, directly promote to admin/master
//   3. Audit Log  — who changed what when (grant/revoke/reset/promote/demote)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { ADMIN_PAGES, DASHBOARD_SECTIONS, getDefaultPermissions } from '../lib/permissions';

function shortId(uuid) { return (uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase(); }

const UsersAdminPage = () => {
  const { user: adminUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [editingPermissions, setEditingPermissions] = useState(null);
  const [saving, setSaving] = useState(false);

  // Promote state
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState(null);       // { id, email, full_name, role, is_protected }
  const [searchError, setSearchError] = useState('');
  const [promoteRole, setPromoteRole] = useState('admin');
  const [promotePermissions, setPromotePermissions] = useState(getDefaultPermissions('admin'));
  const [promoting, setPromoting] = useState(false);

  // ⭐ Cache token supaya gak panggil supabase.auth.getSession() tiap callApi (save ~20ms per call)
  const tokenRef = useRef(null);
  const getToken = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    tokenRef.current = token;
    return token;
  }, []);

  // Invalidate token cache kalau auth state berubah (logout, refresh token, dll)
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      tokenRef.current = null;
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── API helpers ──
  const callApi = useCallback(async (payload) => {
    const token = await getToken();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-permissions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }, [getToken]);

  // Fetch users (admin/master only)
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callApi({ action: 'list_users' });
      if (result.success) setUsers(result.users || []);
    } catch (e) { console.warn('[UsersAdmin] fetch error:', e?.message); }
    finally { setLoading(false); }
  }, [callApi]);

  // Fetch audit log
  const fetchLogs = useCallback(async () => {
    try {
      const result = await callApi({ action: 'get_audit_log' });
      if (result.success) setLogs(result.logs || []);
    } catch (e) { console.warn('[UsersAdmin] audit fetch error:', e?.message); }
  }, [callApi]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (activeTab === 'audit') fetchLogs(); }, [activeTab, fetchLogs]);

  // ── USER LIST: expand user → load current permissions ──
  const handleExpand = (user) => {
    if (expandedUserId === user.id) {
      setExpandedUserId(null);
      setEditingPermissions(null);
      return;
    }
    setExpandedUserId(user.id);
    const defaults = getDefaultPermissions(user.role);
    const custom = user.admin_permissions || {};
    setEditingPermissions({ ...defaults, ...custom });
  };

  // Save permissions (for existing admin user — no role change)
  const handleSave = async (userId) => {
    setSaving(true);
    try {
      const result = await callApi({ action: 'update_permissions', target_user_id: userId, permissions: editingPermissions });
      if (result.success) {
        alert('✅ Permissions berhasil diupdate');
        setExpandedUserId(null);
        fetchUsers();
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  // Reset permissions
  const handleReset = async (userId) => {
    if (!confirm('Reset permissions ke default role?')) return;
    try {
      const result = await callApi({ action: 'reset_permissions', target_user_id: userId });
      if (result.success) { alert('✅ Permissions direset'); setExpandedUserId(null); fetchUsers(); }
      else { alert('Gagal: ' + result.error); }
    } catch (e) { alert('Error: ' + e.message); }
  };

  // Demote admin → verified
  const handleDemote = async (user) => {
    if (!confirm(`Demote ${user.email} dari ${user.role} → verified? User akan kehilangan akses admin panel.`)) return;
    try {
      const result = await callApi({ action: 'demote_user', target_user_id: user.id });
      if (result.success) {
        alert(`✅ ${user.email} berhasil di-demote ke verified`);
        setExpandedUserId(null);
        fetchUsers();
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
  };

  // ── PROMOTE TAB: search user by email ──
  const handleSearch = async () => {
    if (!searchEmail.trim() || !searchEmail.includes('@')) {
      setSearchError('Email tidak valid');
      setFoundUser(null);
      return;
    }
    setSearching(true);
    setSearchError('');
    setFoundUser(null);
    try {
      const result = await callApi({ action: 'search_user', email: searchEmail.trim() });
      if (!result.success) {
        setSearchError(result.error || 'Gagal mencari user');
      } else if (!result.found) {
        setSearchError(`Email "${searchEmail}" belum terdaftar sebagai user. User harus register dulu sebelum bisa di-promote.`);
      } else {
        setFoundUser(result.user);
        // If user is admin already, preload their existing permissions
        if (result.user.role === 'admin' && result.user.admin_permissions) {
          const defaults = getDefaultPermissions('admin');
          setPromotePermissions({ ...defaults, ...result.user.admin_permissions });
        } else {
          setPromotePermissions(getDefaultPermissions('admin'));
        }
      }
    } catch (e) {
      setSearchError('Error: ' + e.message);
    } finally { setSearching(false); }
  };

  // ── PROMOTE TAB: promote found user ──
  const handlePromote = async () => {
    if (!foundUser) return;
    if (foundUser.is_protected) {
      alert('User ini sudah team_dev/master — tidak bisa diubah.');
      return;
    }
    setPromoting(true);
    try {
      const result = await callApi({
        action: 'promote_user',
        target_user_id: foundUser.id,
        role: promoteRole,
        permissions: promoteRole === 'admin' ? promotePermissions : null,
      });
      if (result.success) {
        alert(`✅ ${foundUser.email} berhasil di-promote ke ${promoteRole}!`);
        // Reset form
        setSearchEmail('');
        setFoundUser(null);
        setSearchError('');
        setPromoteRole('admin');
        setPromotePermissions(getDefaultPermissions('admin'));
        // Refresh user list (in case they're now in admin list)
        fetchUsers();
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setPromoting(false); }
  };

  // ── Render ──
  return (
    <AdminLayout title="User Management" subtitle="Kelola akses admin & promote user baru">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button onClick={() => setActiveTab('users')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'users' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            👥 User List
          </button>
          <button onClick={() => setActiveTab('promote')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'promote' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            ⬆️ Promote User
          </button>
          <button onClick={() => setActiveTab('audit')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'audit' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            📋 Audit Log
          </button>
        </div>

        {/* === TAB 1: USER LIST === */}
        {activeTab === 'users' && (
          <div>
            {loading ? (
              // ⭐ Skeleton loading (gantian spinner) — terasa lebih cepat
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-gray-200 rounded w-1/3 animate-pulse" />
                      <div className="h-2.5 bg-gray-200 rounded w-1/2 animate-pulse" />
                    </div>
                    <div className="w-16 h-5 bg-gray-200 rounded-full animate-pulse" />
                  </div>
                ))}
              </div>
            ) : users.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center"><div className="text-4xl mb-3">👥</div><p className="text-gray-500">Belum ada admin user. Gunakan tab <strong>Promote User</strong> untuk menambah admin.</p></div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => {
                  const isExpanded = expandedUserId === u.id;
                  const isProtected = u.role === 'team_dev' || u.role === 'master';
                  const roleBadge = { team_dev: 'bg-purple-100 text-purple-700', master: 'bg-blue-100 text-blue-700', admin: 'bg-gray-100 text-gray-600' };
                  return (
                    <div key={u.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      {/* User header */}
                      <div className="flex items-center justify-between gap-3 p-4 cursor-pointer hover:bg-gray-50" onClick={() => !isProtected && handleExpand(u)}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-full bg-eglux-secondary/10 text-eglux-secondary flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 truncate">{u.full_name || 'N/A'}</p>
                            <p className="text-xs text-gray-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${roleBadge[u.role] || roleBadge.admin}`}>{u.role}</span>
                          {!isProtected && (
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                          )}
                          {isProtected && <span className="text-[0.6rem] text-gray-400">🔒 Full Access</span>}
                        </div>
                      </div>

                      {/* Permissions panel (expandable — admin only, not team_dev/master) */}
                      {isExpanded && !isProtected && editingPermissions && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                          <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Page Access</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                            {ADMIN_PAGES.map((page) => (
                              <label key={page.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors">
                                <input
                                  type="checkbox"
                                  checked={editingPermissions[page.key] === true}
                                  onChange={(e) => setEditingPermissions({ ...editingPermissions, [page.key]: e.target.checked })}
                                  className="w-4 h-4 cursor-pointer accent-eglux-secondary"
                                />
                                <span className="text-xs text-gray-700">{page.icon} {page.label}</span>
                              </label>
                            ))}
                          </div>

                          {/* ⭐ Dashboard sub-sections (hanya tampil kalau dashboard checkbox = true) */}
                          {editingPermissions.dashboard === true && (
                            <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg">
                              <p className="text-[0.65rem] font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                📊 Dashboard Sections
                                <span className="text-gray-400 normal-case font-normal">(granular control per section)</span>
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {DASHBOARD_SECTIONS.map((section) => (
                                  <label key={section.key} className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-gray-50 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={editingPermissions[section.key] === true}
                                      onChange={(e) => setEditingPermissions({ ...editingPermissions, [section.key]: e.target.checked })}
                                      className="w-3.5 h-3.5 cursor-pointer accent-eglux-secondary"
                                    />
                                    <span className="text-[0.7rem] text-gray-600">{section.icon} {section.label}</span>
                                  </label>
                                ))}
                              </div>
                              <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                                <button
                                  onClick={() => {
                                    const updated = { ...editingPermissions };
                                    DASHBOARD_SECTIONS.forEach(s => { updated[s.key] = true; });
                                    setEditingPermissions(updated);
                                  }}
                                  className="text-[0.65rem] text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none"
                                >
                                  ✅ Enable All
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = { ...editingPermissions };
                                    DASHBOARD_SECTIONS.forEach(s => { updated[s.key] = false; });
                                    setEditingPermissions(updated);
                                  }}
                                  className="text-[0.65rem] text-gray-400 font-semibold hover:underline cursor-pointer bg-transparent border-none"
                                >
                                  ❌ Disable All
                                </button>
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => handleSave(u.id)} disabled={saving} className="px-4 py-2 bg-eglux-secondary text-white rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none">
                              {saving ? '⏳ Menyimpan...' : '💾 Save Custom'}
                            </button>
                            <button onClick={() => handleReset(u.id)} className="px-4 py-2 bg-white text-gray-600 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 cursor-pointer">
                              ↺ Reset to Default
                            </button>
                            <button onClick={() => handleDemote(u)} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 cursor-pointer ml-auto">
                              ⬇️ Demote ke Verified
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* === TAB 2: PROMOTE USER === */}
        {activeTab === 'promote' && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-2xl">
            <h3 className="text-base font-bold text-gray-900 mb-2">⬆️ Promote User ke Admin</h3>
            <p className="text-sm text-gray-500 mb-6">Cari user yang sudah terdaftar by email, lalu langsung promote ke role admin/master. Tidak perlu kirim undangan.</p>

            {/* Step 1: Search by email */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Email User <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={searchEmail}
                  onChange={(e) => { setSearchEmail(e.target.value); setSearchError(''); setFoundUser(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="user@eglux.co.id"
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-4 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 cursor-pointer border-none whitespace-nowrap"
                >
                  {searching ? '⏳ Mencari...' : '🔍 Cari'}
                </button>
              </div>
              {searchError && <p className="mt-2 text-xs text-red-500">⚠️ {searchError}</p>}
            </div>

            {/* Step 2: Preview found user */}
            {foundUser && (
              <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-eglux-secondary/10 text-eglux-secondary flex items-center justify-center font-bold text-sm">
                    {(foundUser.full_name || foundUser.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{foundUser.full_name || 'N/A'}</p>
                    <p className="text-xs text-gray-500 truncate">{foundUser.email}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-gray-100 text-gray-600">{foundUser.role || 'verified'}</span>
                </div>
                {foundUser.is_protected ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                    🔒 User ini adalah <strong>{foundUser.role}</strong> — tidak bisa diubah (full access).
                  </p>
                ) : foundUser.role === 'admin' ? (
                  <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded p-2">
                    ℹ️ User sudah admin. Submit akan update role/permissions yang ada.
                  </p>
                ) : (
                  <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded p-2">
                    ✅ User ditemukan. Pilih role di bawah untuk promote.
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Pick role + permissions */}
            {foundUser && !foundUser.is_protected && (
              <>
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Role Target</label>
                  <select
                    value={promoteRole}
                    onChange={(e) => { setPromoteRole(e.target.value); setPromotePermissions(getDefaultPermissions(e.target.value)); }}
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary cursor-pointer bg-white"
                  >
                    <option value="admin">Admin (custom permissions)</option>
                    <option value="master">Master (full access)</option>
                  </select>
                </div>

                {promoteRole === 'admin' && (
                  <div className="mb-6">
                    <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">Page Access</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ADMIN_PAGES.map((page) => (
                        <label key={page.key} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={promotePermissions[page.key] === true}
                            onChange={(e) => setPromotePermissions({ ...promotePermissions, [page.key]: e.target.checked })}
                            className="w-4 h-4 cursor-pointer accent-eglux-secondary"
                          />
                          <span className="text-xs text-gray-700">{page.icon} {page.label}</span>
                        </label>
                      ))}
                    </div>

                    {/* ⭐ Dashboard sub-sections */}
                    {promotePermissions.dashboard === true && (
                      <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-[0.65rem] font-semibold text-gray-500 uppercase mb-2">📊 Dashboard Sections</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {DASHBOARD_SECTIONS.map((section) => (
                            <label key={section.key} className="flex items-center gap-1.5 cursor-pointer p-1.5 rounded hover:bg-white transition-colors">
                              <input
                                type="checkbox"
                                checked={promotePermissions[section.key] === true}
                                onChange={(e) => setPromotePermissions({ ...promotePermissions, [section.key]: e.target.checked })}
                                className="w-3.5 h-3.5 cursor-pointer accent-eglux-secondary"
                              />
                              <span className="text-[0.7rem] text-gray-600">{section.icon} {section.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePromote}
                  disabled={promoting}
                  className="px-5 py-2.5 bg-eglux-secondary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
                >
                  {promoting ? '⏳ Memproses...' : `⬆️ Promote ke ${promoteRole}`}
                </button>
              </>
            )}

            {/* Empty hint */}
            {!foundUser && !searchError && (
              <div className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
                💡 Cari email user yang sudah register. Setelah ketemu, pilih role & permissions lalu klik Promote.
              </div>
            )}
          </div>
        )}

        {/* === TAB 3: AUDIT LOG === */}
        {activeTab === 'audit' && (
          <div>
            {logs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-10 text-center"><div className="text-4xl mb-3">📋</div><p className="text-gray-500">Belum ada activity log.</p></div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-[0.7rem] font-semibold text-gray-500 uppercase">Waktu</th>
                      <th className="px-4 py-3 text-left text-[0.7rem] font-semibold text-gray-500 uppercase">Admin</th>
                      <th className="px-4 py-3 text-left text-[0.7rem] font-semibold text-gray-500 uppercase">Target User</th>
                      <th className="px-4 py-3 text-left text-[0.7rem] font-semibold text-gray-500 uppercase">Page</th>
                      <th className="px-4 py-3 text-left text-[0.7rem] font-semibold text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-700">{log.changed_by_email || shortId(log.changed_by_id)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700">{log.target_user_email || shortId(log.target_user_id)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700 capitalize">{log.page}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-semibold ${
                            log.action === 'grant' ? 'bg-green-50 text-green-700'
                            : log.action === 'revoke' ? 'bg-red-50 text-red-700'
                            : log.action === 'promote' ? 'bg-blue-50 text-blue-700'
                            : log.action === 'demote' ? 'bg-orange-50 text-orange-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>{log.action}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default UsersAdminPage;
