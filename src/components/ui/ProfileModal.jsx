// src/components/ui/ProfileModal.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// ── Generate pixel art avatar (random) ──
function generatePixelAvatar(size = 8) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pixelSize = 32;
  canvas.width = size * pixelSize;
  canvas.height = size * pixelSize;

  // Random color palette
  const hue = Math.floor(Math.random() * 360);
  const bgColor = `hsl(${hue}, 70%, 55%)`;
  const fgColor = `hsl(${(hue + 180) % 360}, 80%, 95%)`;

  // Generate symmetric pixel pattern
  const half = Math.ceil(size / 2);
  const grid = [];
  for (let y = 0; y < size; y++) {
    grid[y] = [];
    for (let x = 0; x < half; x++) {
      grid[y][x] = Math.random() > 0.5;
    }
  }

  // Draw
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = fgColor;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mirror = x >= half ? size - 1 - x : x;
      if (grid[y][mirror]) {
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
  }

  return canvas.toDataURL('image/png');
}

const ProfileModal = ({ isOpen, onClose }) => {
  const { user, profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: '',
    address: '',
  });
  const [avatarDataUrl, setAvatarDataUrl] = useState(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        address: profile.address || '',
      });
      setAvatarDataUrl(profile.avatar_url || null);
      setAvatarChanged(false);
    }
  }, [profile]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(false);
      setAvatarChanged(false);
    }
  }, [isOpen]);

  const handleGenerateAvatar = useCallback(() => {
    const dataUrl = generatePixelAvatar(8);
    setAvatarDataUrl(dataUrl);
    setAvatarChanged(true);
  }, []);

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

      let avatarUrl = profile?.avatar_url || null;

      // Upload avatar ke Storage kalau berubah
      if (avatarChanged && avatarDataUrl) {
        // Convert dataURL ke Blob
        const base64 = avatarDataUrl.split(',')[1];
        const blob = await (await fetch(avatarDataUrl)).blob();

        const filePath = `${user.id}/avatar.png`;
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(filePath, blob, { upsert: true, contentType: 'image/png' });

        if (uploadErr) {
          console.warn('Avatar upload failed, saving dataURL directly:', uploadErr.message);
          // Fallback: simpan dataURL langsung (lebih besar tapi works)
          avatarUrl = avatarDataUrl;
        } else {
          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);
          avatarUrl = urlData.publicUrl;
        }
      }

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

          {/* Avatar — click to generate random pixel art */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={handleGenerateAvatar}
              className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-eglux-secondary cursor-pointer hover:opacity-80 transition-opacity group"
              title="Klik untuk generate foto profil baru"
            >
              {avatarDataUrl ? (
                <img src={avatarDataUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-eglux-secondary flex items-center justify-center text-white text-2xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-[0.6rem] text-white font-medium">🎲 Generate</span>
              </div>
            </button>
            <p className="text-[0.65rem] text-gray-400">Klik foto untuk generate baru</p>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Nama Lengkap
            </label>
            <input
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
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              Alamat Pengiriman
            </label>
            <textarea
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
