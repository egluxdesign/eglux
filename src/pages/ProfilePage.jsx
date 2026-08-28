// src/pages/ProfilePage.jsx
// ============================================================================
// ProfilePage — Halaman profil user dengan 3 tab
// ============================================================================
// Tab 1: Data Diri (full_name, phone, address, city, postal_code, avatar preset)
// Tab 2: Keamanan (ganti/set password)
// Tab 3: Newsletter (opt-in email/WA marketing)
//
// ⭐ Avatar: pilih dari preset yang ada di Storage bucket 'avatars/preset/'
//   - List file di-fetch dynamic via Storage API (gak hardcoded)
//   - Admin bisa add/remove/rename file avatar kapan saja
//   - Frontend auto-detect file baru saat modal dibuka
//   - Cache list supaya gak fetch terus-terusan
//
// Routing: /profile (protected, any authenticated user)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AVATAR_BUCKET = 'avatars';
const AVATAR_FOLDER = 'preset';  // ⭐ sesuai struktur di Storage: avatars/preset/

const ProfilePage = () => {
  const { user, profile, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  // ── Tab 1: Data Diri state ──
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [address, setAddress] = useState(profile?.address || '');
  const [city, setCity] = useState(profile?.city || '');
  const [postalCode, setPostalCode] = useState(profile?.postal_code || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Avatar presets state (dynamic dari Storage API) ──
  const [avatarPresets, setAvatarPresets] = useState([]);  // array of public URLs
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [presetsError, setPresetsError] = useState('');
  const presetsCacheRef = useRef(null);  // cache hasil fetch supaya gak refetch terus

  // ── Tab 2: Keamanan state ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [hasPasswordProvider, setHasPasswordProvider] = useState(true);

  // ── Tab 3: Newsletter state ──
  const [newsletterData, setNewsletterData] = useState(null);
  const [loadingNewsletter, setLoadingNewsletter] = useState(true);
  const [savingNewsletter, setSavingNewsletter] = useState(false);

  // ── Init state dari profile ──
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setAddress(profile.address || '');
      setCity(profile.city || '');
      setPostalCode(profile.postal_code || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  // ── Cek apakah user OAuth (gak punya password) ──
  useEffect(() => {
    const providers = user?.app_metadata?.providers || user?.user_metadata?.providers || [];
    const hasEmail = providers.includes('email') || providers.includes('password');
    setHasPasswordProvider(hasEmail);
  }, [user]);

  // ── Fetch newsletter data ──
  const fetchNewsletter = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (!error) setNewsletterData(data);
    } catch (e) { console.warn('[ProfilePage] newsletter fetch error:', e?.message); }
    finally { setLoadingNewsletter(false); }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'newsletter' && user) fetchNewsletter();
  }, [activeTab, user, fetchNewsletter]);

  // ── Token cache untuk callApi ──
  const tokenRef = useRef(null);
  const getToken = useCallback(async () => {
    if (tokenRef.current) return tokenRef.current;
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    tokenRef.current = token;
    return token;
  }, []);
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => { tokenRef.current = null; });
    return () => sub.subscription.unsubscribe();
  }, []);

  const callApi = useCallback(async (endpoint, payload) => {
    const token = await getToken();
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }, [getToken]);

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 1: DATA DIRI — handlers
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Fetch list avatar dari Storage API (bucket 'avatars', folder 'preset') ──
  // Cache di ref supaya gak fetch setiap kali modal dibuka.
  // Refresh: kalau mau force refresh, pass `force=true`.
  const fetchAvatarPresets = useCallback(async (force = false) => {
    // Pakai cache kalau ada dan gak force refresh
    if (!force && presetsCacheRef.current) {
      setAvatarPresets(presetsCacheRef.current);
      setPresetsError('');
      return;
    }

    setLoadingPresets(true);
    setPresetsError('');
    try {
      const { data, error } = await supabase.storage
        .from(AVATAR_BUCKET)
        .list(AVATAR_FOLDER, {
          limit: 100,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.warn('[ProfilePage] Storage list error:', error.message);
        setPresetsError('Gagal memuat daftar avatar: ' + error.message);
        setAvatarPresets([]);
        return;
      }

      if (!data || data.length === 0) {
        setPresetsError('Belum ada avatar di folder preset. Upload avatar ke Storage bucket "avatars/preset/".');
        setAvatarPresets([]);
        return;
      }

      // Filter: hanya file gambar (skip folder, skip hidden files)
      const imageFiles = data.filter(file => {
        if (!file.name) return false;
        // Skip folder (folder punya metadata.size = 0 dan id null)
        if (file.id === null && file.metadata === null) return false;
        const lower = file.name.toLowerCase();
        return lower.endsWith('.png') || lower.endsWith('.jpg') ||
               lower.endsWith('.jpeg') || lower.endsWith('.webp') ||
               lower.endsWith('.gif') || lower.endsWith('.svg');
      });

      // Convert ke public URLs
      const urls = imageFiles.map(file =>
        `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${AVATAR_FOLDER}/${file.name}`
      );

      presetsCacheRef.current = urls;  // cache
      setAvatarPresets(urls);
      console.log(`[ProfilePage] ✓ Loaded ${urls.length} avatar presets from Storage`);
    } catch (e) {
      console.error('[ProfilePage] Fetch presets error:', e);
      setPresetsError('Error: ' + e.message);
      setAvatarPresets([]);
    } finally {
      setLoadingPresets(false);
    }
  }, []);

  // Saat modal picker dibuka, fetch presets kalau belum ada
  useEffect(() => {
    if (showAvatarPicker) {
      fetchAvatarPresets();
    }
  }, [showAvatarPicker, fetchAvatarPresets]);

  // Pilih avatar dari preset grid
  const handleSelectAvatar = useCallback((presetUrl) => {
    setAvatarUrl(presetUrl);
    setShowAvatarPicker(false);
  }, []);

  // Save profile (name, phone, address, avatar)
  const handleSaveProfile = async () => {
    if (fullName.trim().length < 2) {
      alert('Nama minimal 2 karakter');
      return;
    }
    setSavingProfile(true);
    try {
      // Avatar URL langsung dari preset (sudah public URL, gak perlu upload)
      const finalAvatarUrl = avatarUrl || null;

      const result = await callApi('update-profile', {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        postal_code: postalCode.trim() || null,
        avatar_url: finalAvatarUrl,
      });

      if (result.success) {
        if (refreshProfile) await refreshProfile();
        alert('✅ Profile berhasil diupdate');
      } else {
        alert('Gagal: ' + (result.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    finally { setSavingProfile(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 2: KEAMANAN — handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const handleChangePassword = async () => {
    setPasswordError('');

    if (!hasPasswordProvider) {
      if (newPassword.length < 8) { setPasswordError('Password minimal 8 karakter'); return; }
      if (newPassword !== confirmPassword) { setPasswordError('Konfirmasi password tidak cocok'); return; }
    } else {
      if (!currentPassword) { setPasswordError('Password lama wajib diisi'); return; }
      if (newPassword.length < 8) { setPasswordError('Password baru minimal 8 karakter'); return; }
      if (newPassword !== confirmPassword) { setPasswordError('Konfirmasi password tidak cocok'); return; }
      if (currentPassword === newPassword) { setPasswordError('Password baru tidak boleh sama dengan password lama'); return; }
    }

    setChangingPassword(true);
    try {
      // ── STEP 1: Verify current password di frontend (untuk non-OAuth user) ──
      // Pakai supabase.auth.signInWithPassword (anon key, bukan service_role)
      // Supabase auto rate-limit login attempts → anti brute-force
      if (hasPasswordProvider) {
        setPasswordError('Memverifikasi password lama...');
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

        if (signInErr || !signInData?.user) {
          setPasswordError('Password lama salah');
          setChangingPassword(false);
          return;
        }
        setPasswordError('');
        console.log('[ProfilePage] ✓ Current password verified');
      }

      // ── STEP 2: Call edge function untuk update password ──
      const result = await callApi('change-password', {
        new_password: newPassword,
        verified: true,  // ⭐ flag: frontend sudah verify current password
      });

      if (result.success) {
        alert('✅ Password berhasil ' + (hasPasswordProvider ? 'diubah' : 'di-set') + '. Anda akan dialihkan ke halaman login.');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
        await supabase.auth.signOut({ scope: 'global' });
        if (logout) await logout();
        navigate('/login', { replace: true });
      } else {
        setPasswordError(result.error || 'Gagal mengubah password');
      }
    } catch (e) { setPasswordError('Error: ' + e.message); }
    finally { setChangingPassword(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB 3: NEWSLETTER — handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const handleSaveNewsletter = async () => {
    setSavingNewsletter(true);
    try {
      if (newsletterData) {
        const { error } = await supabase
          .from('newsletter_subscribers')
          .update({
            marketing_email_opt_in: newsletterData.marketing_email_opt_in,
            marketing_wa_opt_in: newsletterData.marketing_wa_opt_in,
            subscribed_at: new Date().toISOString(),
          })
          .eq('id', newsletterData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('newsletter_subscribers')
          .insert({
            user_id: user.id,
            email: user.email,
            full_name: profile?.full_name,
            phone: profile?.phone,
            status: 'active',
            marketing_email_opt_in: true,
            marketing_wa_opt_in: false,
            subscribed_at: new Date().toISOString(),
          });
        if (error) throw error;
      }
      await fetchNewsletter();
      alert('✅ Pengaturan newsletter diupdate');
    } catch (e) { alert('Gagal: ' + e.message); }
    finally { setSavingNewsletter(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  const initial = (profile?.full_name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-gray-50 pt-[60px] md:pt-[72px]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-gray-400 hover:text-gray-600 text-sm">← Beranda</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-base md:text-lg font-bold text-eglux-primary">Profil Saya</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6">
        {/* User Header Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 flex items-center gap-4">
          {/* Avatar — klik untuk buka picker */}
          <button
            onClick={() => setShowAvatarPicker(true)}
            className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-eglux-secondary cursor-pointer hover:opacity-80 transition-opacity group flex-shrink-0"
            title="Klik untuk ganti avatar"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-eglux-secondary flex items-center justify-center text-white text-xl font-bold">
                {initial}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-[0.6rem] text-white font-medium">✎ Ganti</span>
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate">{profile?.full_name || 'N/A'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400 mt-0.5">{profile?.phone || 'No phone'}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[0.65rem] font-bold bg-gray-100 text-gray-600 capitalize">{profile?.role || 'user'}</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 mb-6">
          <button onClick={() => setActiveTab('profile')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'profile' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            👤 Data Diri
          </button>
          <button onClick={() => setActiveTab('security')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'security' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            🔒 Keamanan
          </button>
          <button onClick={() => setActiveTab('newsletter')} className={`px-4 py-2 text-sm font-semibold border-b-2 cursor-pointer transition-colors ${activeTab === 'newsletter' ? 'border-eglux-primary text-eglux-primary' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            📧 Newsletter
          </button>
        </div>

        {/* === TAB 1: DATA DIRI === */}
        {activeTab === 'profile' && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 mb-2">Data Diri</h3>
            <p className="text-xs text-gray-500 mb-4">Email tidak bisa diubah. Hubungi admin kalau perlu ganti email.</p>

            {/* Avatar — klik untuk buka picker preset */}
            <div className="flex flex-col items-center gap-2 pb-2">
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-eglux-secondary cursor-pointer hover:opacity-80 transition-opacity group"
                title="Klik untuk pilih avatar"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-eglux-secondary flex items-center justify-center text-white text-2xl font-bold">
                    {initial}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="text-[0.6rem] text-white font-medium">✎ Ganti</span>
                </div>
              </button>
              <p className="text-[0.65rem] text-gray-400">Klik foto untuk pilih avatar</p>
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-400 cursor-not-allowed"
              />
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Nama Lengkap</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nama lengkap Anda"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Nomor WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+628xxx atau 08xxx"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
              <p className="text-[0.7rem] text-gray-400 mt-1">Format: +628xxx atau 08xxx</p>
            </div>

            {/* Address (Alamat Pengiriman) */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Alamat Pengiriman</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jalan, nomor rumah, RT/RW, kelurahan"
                rows={2}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary resize-y"
              />
              <p className="text-[0.7rem] text-gray-400 mt-1">Alamat ini akan otomatis terisi saat checkout</p>
            </div>

            {/* City + Postal Code (2 kolom) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Kota</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Tangerang"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Kode Pos</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="15121"
                  maxLength={10}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                />
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="px-5 py-2.5 bg-eglux-secondary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
            >
              {savingProfile ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
            </button>
          </div>
        )}

        {/* === TAB 2: KEAMANAN === */}
        {activeTab === 'security' && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 mb-2">
              {hasPasswordProvider ? 'Ganti Password' : 'Set Password Baru'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {hasPasswordProvider
                ? 'Password baru minimal 8 karakter. Setelah ganti password, semua device akan di-logout.'
                : 'Akun Anda login via Google. Set password baru untuk bisa login dengan email + password.'}
            </p>

            {hasPasswordProvider && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Password Lama <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Password Baru <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                placeholder="Minimal 8 karakter"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1.5">Konfirmasi Password Baru <span className="text-red-500">*</span></label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                placeholder="Ulangi password baru"
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-eglux-secondary"
              />
            </div>

            {passwordError && <p className="text-xs text-red-500">⚠️ {passwordError}</p>}

            <button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="px-5 py-2.5 bg-eglux-secondary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
            >
              {changingPassword ? '⏳ Memproses...' : (hasPasswordProvider ? '🔒 Ganti Password' : '🔑 Set Password')}
            </button>
          </div>
        )}

        {/* === TAB 3: NEWSLETTER === */}
        {activeTab === 'newsletter' && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900 mb-2">Pengaturan Newsletter</h3>
            <p className="text-xs text-gray-500 mb-4">Kelola persetujuan menerima promo & info dari EGLUX.</p>

            {loadingNewsletter ? (
              <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={newsletterData?.marketing_email_opt_in || false}
                      onChange={(e) => setNewsletterData({
                        ...(newsletterData || {}),
                        marketing_email_opt_in: e.target.checked,
                      })}
                      className="w-4 h-4 mt-0.5 cursor-pointer accent-eglux-secondary"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">📧 Promo via Email</p>
                      <p className="text-xs text-gray-500">Saya bersedia menerima email promo, diskon, dan update produk dari EGLUX.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={newsletterData?.marketing_wa_opt_in || false}
                      onChange={(e) => setNewsletterData({
                        ...(newsletterData || {}),
                        marketing_wa_opt_in: e.target.checked,
                      })}
                      className="w-4 h-4 mt-0.5 cursor-pointer accent-eglux-secondary"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">💬 Promo via WhatsApp</p>
                      <p className="text-xs text-gray-500">Saya bersedia menerima WhatsApp promo & info flash sale dari EGLUX.</p>
                    </div>
                  </label>
                </div>

                <div className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                  Status: <strong>{newsletterData?.status || 'belum subscribe'}</strong>
                  {newsletterData?.subscribed_at && (
                    <span> · Terakhir update: {new Date(newsletterData.subscribed_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  )}
                </div>

                <button
                  onClick={handleSaveNewsletter}
                  disabled={savingNewsletter}
                  className="px-5 py-2.5 bg-eglux-secondary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer border-none"
                >
                  {savingNewsletter ? '⏳ Menyimpan...' : '💾 Simpan Pengaturan'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* === AVATAR PICKER MODAL === */}
      {showAvatarPicker && (
        <div
          className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowAvatarPicker(false)}
        >
          <div className="bg-white rounded-2xl max-w-[440px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-eglux-primary">Pilih Avatar</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchAvatarPresets(true)}
                  disabled={loadingPresets}
                  className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-eglux-secondary cursor-pointer border-none disabled:opacity-50"
                  title="Refresh daftar avatar"
                >
                  <svg className={`w-4 h-4 ${loadingPresets ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowAvatarPicker(false)}
                  className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
                  aria-label="Tutup"
                >✕</button>
              </div>
            </div>

            {/* Grid avatar */}
            <div className="p-6">
              {loadingPresets ? (
                // Loading state
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-gray-500">Memuat daftar avatar...</p>
                </div>
              ) : presetsError ? (
                // Error state
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">⚠️</div>
                  <p className="text-sm text-gray-600 mb-2">{presetsError}</p>
                  <button
                    onClick={() => fetchAvatarPresets(true)}
                    className="text-xs text-eglux-secondary font-semibold hover:underline cursor-pointer bg-transparent border-none mt-2"
                  >
                    Coba lagi
                  </button>
                </div>
              ) : avatarPresets.length === 0 ? (
                // Empty state
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">📁</div>
                  <p className="text-sm text-gray-600 mb-1">Belum ada avatar tersedia.</p>
                  <p className="text-xs text-gray-400">Upload avatar ke Storage bucket "avatars/preset/".</p>
                </div>
              ) : (
                // Grid avatar
                <>
                  <p className="text-xs text-gray-500 mb-4">
                    Pilih salah satu avatar di bawah. Klik untuk konfirmasi.
                    <span className="text-gray-400 ml-1">({avatarPresets.length} avatar)</span>
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    {avatarPresets.map((url, idx) => {
                      // Extract filename untuk display
                      const filename = url.split('/').pop() || `Avatar ${idx + 1}`;
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelectAvatar(url)}
                          className={`relative aspect-square rounded-full overflow-hidden border-2 cursor-pointer transition-all hover:opacity-80 ${
                            avatarUrl === url
                              ? 'border-eglux-secondary ring-2 ring-eglux-secondary/30'
                              : 'border-gray-200'
                          }`}
                          title={filename}
                        >
                          <img
                            src={url}
                            alt={filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
              // Hide image yang gagal load (mungkin file corrupt atau RLS block)
                              e.target.style.display = 'none';
                              e.target.parentElement.style.backgroundColor = '#f3f4f6';
                            }}
                          />
                          {avatarUrl === url && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-eglux-secondary rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Reset to letter avatar */}
              {avatarUrl && !loadingPresets && !presetsError && (
                <button
                  onClick={() => handleSelectAvatar('')}
                  className="mt-4 w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg cursor-pointer bg-transparent"
                >
                  ↺ Hapus avatar (pakai inisial nama)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
