// src/components/admin/profile/ProfilePage.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { User, ShieldCheck, Calendar, AlertTriangle } from 'lucide-react';

const ROLE_STYLE = {
  super_admin: { label: 'Super Admin', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100' },
  admin:       { label: 'Admin',       bg: 'bg-[#c9a96e]/10', text: 'text-[#c9a96e]', border: 'border-[#c9a96e]/20' },
  staff:       { label: 'Staff',       bg: 'bg-blue-50',  text: 'text-blue-600',  border: 'border-blue-100' },
};

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';

const ProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('Gagal memuat data akun.');
      setLoading(false);
      return;
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, role, created_at')
      .eq('id', user.id)
      .single();

    setProfile({
      email: user.email,
      full_name: profileRow?.full_name || null,
      role: profileRow?.role || 'admin',
      member_since: profileRow?.created_at || user.created_at,
    });

    if (profileError) {
      // Tetap tampilkan email walau row profiles belum ada
      setError('Sebagian data profil tidak tersedia.');
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Profile</h1>
          <p className="text-[0.85rem] text-[#9ca3af] mt-1">Your account information</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8ecf4] p-8 max-w-md animate-pulse">
          <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="h-4 bg-gray-200 rounded w-32 mx-auto mb-2" />
          <div className="h-3 bg-gray-200 rounded w-40 mx-auto" />
        </div>
      </div>
    );
  }

  const roleStyle = ROLE_STYLE[profile?.role] || ROLE_STYLE.admin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.5rem] font-bold text-[#1a1d2b]">Profile</h1>
        <p className="text-[0.85rem] text-[#9ca3af] mt-1">Your account information</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-amber-50 text-amber-600 px-4 py-3 rounded-xl text-[0.85rem] max-w-md">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e8ecf4] p-8 max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-[#c9a96e]/15 flex items-center justify-center mx-auto mb-4">
          <User className="w-7 h-7 text-[#c9a96e]" />
        </div>

        <h2 className="text-[1.05rem] font-bold text-[#1a1d2b]">
          {profile?.full_name || 'Admin'}
        </h2>
        <p className="text-[0.85rem] text-[#9ca3af] mt-0.5">{profile?.email}</p>

        <div className={`inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full text-[0.8rem] font-medium border ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
          <ShieldCheck className="w-3.5 h-3.5" />
          {roleStyle.label}
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[0.75rem] text-[#9ca3af] mt-5 pt-5 border-t border-[#f3f4f6]">
          <Calendar className="w-3.5 h-3.5" />
          Member since {formatDate(profile?.member_since)}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;