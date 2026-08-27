// src/pages/ClaimPointsPage.jsx
// ============================================================================
// ClaimPointsPage — Customer klaim poin dari pembelian marketplace
// ============================================================================
// Flow:
//   1. User login (wajib)
//   2. Isi form: marketplace (dropdown) + order ID + nama + WA (auto-fill dari profile)
//   3. Submit → INSERT ke marketplace_claims (status='pending')
//   4. Admin verify → approve/reject → points added
//   5. Customer lihat status klaim di list bawah form
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import HeaderProducts from '../components/layout/HeaderProducts';
import Footer from '../components/layout/Footer';
import { useCartActions } from './CartPage';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../hooks/useToast';
import Toast from '../components/ui/Toast';
import '/src/assets/styles/eglux-design-system.css';

const MARKETPLACES = [
  { value: 'shopee', label: 'Shopee' },
  { value: 'tokopedia', label: 'Tokopedia' },
  { value: 'tiktok_shop', label: 'TikTok Shop' },
  { value: 'bukalapak', label: 'Bukalapak' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'blibli', label: 'Blibli' },
  { value: 'other', label: 'Lainnya' },
];

const STATUS_BADGE = {
  pending: { text: 'Menunggu Verifikasi', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { text: 'Disetujui', cls: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { text: 'Ditolak', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const ClaimPointsPage = () => {
  const { user, profile } = useAuth();
  const { openCart } = useCartActions();
  const { toast, showToast, closeToast } = useToast();

  const [form, setForm] = useState({ marketplace: 'shopee', orderId: '' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auto-fill nama + phone dari profile
  useEffect(() => {
    if (profile) {
      setName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  // Fetch existing claims
  const fetchClaims = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('marketplace_claims')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setClaims(data || []);
    } catch (e) {
      console.warn('[ClaimPoints] fetch error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('Nama wajib diisi', 'error'); return; }
    if (!phone.trim()) { showToast('Nomor WhatsApp wajib diisi', 'error'); return; }
    if (!form.orderId.trim()) { showToast('Order ID wajib diisi', 'error'); return; }

    setSubmitting(true);
    try {
      // Normalize phone ke E.164
      let phoneE164 = phone;
      let digits = phone.replace(/\D/g, '');
      if (digits.startsWith('0')) digits = '62' + digits.slice(1);
      else if (!digits.startsWith('62')) digits = '62' + digits;
      phoneE164 = `+${digits}`;

      const { error } = await supabase
        .from('marketplace_claims')
        .insert({
          user_id: user.id,
          name: name.trim(),
          phone: phoneE164,
          marketplace: form.marketplace,
          order_id: form.orderId.trim(),
          status: 'pending',
        });

      if (error) {
        if (error.code === '23505') {
          showToast('Order ID ini sudah pernah diklaim untuk marketplace tersebut.', 'error');
        } else {
          throw new Error(error.message);
        }
      } else {
        showToast('Klaim poin berhasil dikirim! Tim kami akan verifikasi dalam 1-2 hari kerja.', 'success');
        setForm({ marketplace: 'shopee', orderId: '' });
        fetchClaims();
      }
    } catch (e) {
      showToast('Gagal mengirim klaim: ' + e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Login required
  if (!user) {
    return (
      <div className="section-full-mobile w-full">
        <div className="mobile-viewport-group">
          <HeaderProducts onCartOpen={openCart} forceScrolled />
          <section className="section-mobile relative flex flex-col items-center justify-center text-center px-4">
            <div className="text-4xl mb-3">🎁</div>
            <p className="text-gray-500 mb-4">Login dulu untuk klaim poin dari pembelian marketplace.</p>
            <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">Masuk ke akun</Link>
          </section>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <div className="max-w-2xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-eglux-primary">Klaim Poin Marketplace</h1>
          <Link to="/rewards" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            ← Poin Saya
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Belanja di Shopee/Tokopedia/TikTok Shop? Klaim poin Anda di sini.
        </p>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-xs text-blue-800">
          <p className="font-medium mb-1">ℹ️ Cara Klaim Poin:</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-700">
            <li>Pastikan pesanan Anda sudah <strong>diterima</strong> di marketplace</li>
            <li>Cari <strong>No. Pesanan</strong> / Order ID di app marketplace Anda</li>
            <li>Isi form di bawah → tim kami akan verifikasi (1-2 hari kerja)</li>
            <li>Setelah disetujui, poin otomatis masuk ke akun Anda</li>
          </ol>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 mb-8">
          {/* Nama */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Nama <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
            />
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Nomor WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
            />
          </div>

          {/* Marketplace */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              Marketplace <span className="text-red-500">*</span>
            </label>
            <select
              value={form.marketplace}
              onChange={(e) => setForm({ ...form, marketplace: e.target.value })}
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors cursor-pointer"
            >
              {MARKETPLACES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Order ID */}
          <div>
            <label className="block text-[0.8rem] font-semibold text-eglux-primary uppercase tracking-[0.5px] mb-1.5">
              No. Pesanan / Order ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.orderId}
              onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              placeholder="mis. INV/123456/789"
              required
              className="w-full py-3 px-4 border-[1.5px] border-[#ddd] rounded-[10px] text-[0.88rem] text-eglux-primary bg-white outline-none focus:border-eglux-secondary transition-colors"
            />
            <p className="text-[0.7rem] text-gray-400 mt-1">
              Cek di app marketplace → Pesanan → Detail Pesanan → No. Pesanan/Invoice
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-eglux-primary text-white border-none rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? '⏳ Mengirim...' : 'Klaim Poin'}
          </button>
        </form>

        {/* Claims History */}
        <div>
          <h2 className="text-base font-bold text-eglux-primary mb-3">Riwayat Klaim Saya</h2>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : claims.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-sm text-gray-500">Belum ada klaim poin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim) => {
                const badge = STATUS_BADGE[claim.status] || STATUS_BADGE.pending;
                const mp = MARKETPLACES.find(m => m.value === claim.marketplace);
                return (
                  <div key={claim.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-eglux-primary">
                          {mp?.label || claim.marketplace}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{claim.order_id}</p>
                      </div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                    <p className="text-[0.7rem] text-gray-400">
                      Diklaim: {new Date(claim.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {claim.status === 'approved' && claim.points_awarded && (
                      <p className="text-xs text-green-600 font-medium mt-1">
                        ✅ +{claim.points_awarded} poin ditambahkan
                      </p>
                    )}
                    {claim.status === 'rejected' && claim.admin_notes && (
                      <p className="text-xs text-red-500 mt-1">
                        ❌ {claim.admin_notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Footer />
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
};

export default ClaimPointsPage;
