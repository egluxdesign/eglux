// src/components/ui/ProfileModal.jsx
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Preset avatars: 12 gambar di bucket 'avatars', folder 'presets/' ──
// Naming convention: avatar-01.webp ... avatar-12.webp
const PRESET_AVATAR_COUNT = 12;

function buildPresetAvatarUrls() {
  const urls = [];
  for (let i = 1; i <= PRESET_AVATAR_COUNT; i++) {
    const fileName = `avatar-${String(i).padStart(2, '0')}.webp`;
    const { data } = supabase.storage.from('avatars').getPublicUrl(`presets/${fileName}`);
    urls.push({ id: fileName, url: data.publicUrl });
  }
  return urls;
}

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    address: '',
  });
  const [selectedAvatarUrl, setSelectedAvatarUrl] = useState(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Preset URLs dihitung sekali saja (tidak perlu request ulang tiap render)
  const presetAvatars = useMemo(() => buildPresetAvatarUrls(), []);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        address: profile.address || '',
      });
      setSelectedAvatarUrl(profile.avatar_url || null);
      setAvatarChanged(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(false);
      setAvatarChanged(false);
      setPickerOpen(false);
    }
  }, [isOpen]);

  const handlePickAvatar = (url) => {
    setSelectedAvatarUrl(url);
    setAvatarChanged(true);
    setPickerOpen(false);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError('Nama lengkap wajib diisi');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Sesi login habis.');
        setSaving(false);
        return;
      }

      // Avatar preset sudah berupa public URL langsung dari Storage,
      // jadi tidak perlu upload/blob — tinggal kirim URL-nya.
      const avatarUrl = avatarChanged ? selectedAvatarUrl : (profile?.avatar_url || null);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/update-profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          full_name: form.full_name,
          address: form.address,
          avatar_url: avatarUrl,
        }),
      });

      const result = await resp.json();
      if (!resp.ok || !result.success) {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }

      setSuccess(true);
      await refreshProfile();
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl max-w-[440px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-eglux-primary">Profil Saya</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer border-none"
            aria-label="Tutup"
          >✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 text-center">
              ✓ Profil berhasil disimpan
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              ⚠ {error}
            </div>
          )}

          {/* Avatar — click to open preset picker */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-eglux-secondary cursor-pointer hover:opacity-80 transition-opacity group"
              title="Klik untuk pilih avatar"
            >
              {selectedAvatarUrl ? (
                <img src={selectedAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-eglux-secondary flex items-center justify-center text-white text-2xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[0.6rem] text-white font-medium">Ganti</span>
              </div>
            </button>
            <p className="text-[0.65rem] text-gray-400">Klik foto untuk pilih avatar</p>

            {/* Preset avatar grid */}
            {pickerOpen && (
              <div className="w-full mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="grid grid-cols-4 gap-2.5">
                  {presetAvatars.map((avatar) => {
                    const isSelected = selectedAvatarUrl === avatar.url;
                    return (
                      <button
                        key={avatar.id}
                        onClick={() => handlePickAvatar(avatar.url)}
                        className={`relative aspect-square rounded-full overflow-hidden border-2 transition-all cursor-pointer
                          ${isSelected ? 'border-eglux-secondary ring-2 ring-eglux-secondary/40' : 'border-transparent hover:border-gray-300'}`}
                        title={avatar.id}
                      >
                        <img
                          src={avatar.url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover bg-white"
                        />
                        {isSelected && (
                          <span className="absolute inset-0 bg-eglux-secondary/20 flex items-center justify-center">
                            <span className="w-5 h-5 rounded-full bg-eglux-secondary text-white text-xs flex items-center justify-center">✓</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="profile-full-name" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Nama Lengkap
            </label>
            <input
              id="profile-full-name"
              name="full_name"
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Nama lengkap"
              className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
            />
          </div>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Email</label>
            <div className="w-full py-2.5 px-3 border-[1.5px] border-gray-100 rounded-lg text-sm text-gray-400 bg-gray-50">
              {user?.email || '—'}
            </div>
          </div>

          {/* Phone (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Nomor WhatsApp</label>
            <div className="w-full py-2.5 px-3 border-[1.5px] border-gray-100 rounded-lg text-sm text-gray-400 bg-gray-50">
              {profile?.phone || '—'}
            </div>
          </div>

          {/* Address */}
          <div>
            <label htmlFor="profile-address" className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Alamat Pengiriman
            </label>
            <textarea
              id="profile-address"
              name="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kota, kode pos"
              rows={2}
              className="w-full py-2.5 px-3 border-[1.5px] border-gray-300 rounded-lg text-sm text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors resize-y"
            />
            <p className="text-[0.65rem] text-gray-400 mt-1">Alamat ini akan otomatis terisi saat checkout</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-eglux-primary rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Menyimpan...
              </>
            ) : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;