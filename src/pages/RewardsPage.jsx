// src/pages/RewardsPage.jsx
// ============================================================================
// RewardsPage — Customer tukar poin dengan voucher belanja
// ============================================================================
// Flow:
//   1. User login (wajib)
//   2. Lihat balance poin + katalog rewards
//   3. Klik "Tukar" → call redeem-points edge function
//   4. Dapat voucher code → bisa dipakai di checkout (expire 90 hari)
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

const RewardsPage = () => {
  const { user } = useAuth();
  const { openCart } = useCartActions();
  const { toast, showToast, closeToast } = useToast();

  const [balance, setBalance] = useState(0);
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(null);

  // Fetch balance + rewards + redemptions
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [balanceRes, rewardsRes, redemptionsRes] = await Promise.all([
        supabase.from('user_points').select('balance, total_earned, total_spent').eq('user_id', user.id).maybeSingle(),
        supabase.from('point_rewards').select('*').eq('is_active', true).order('points_cost', { ascending: true }),
        supabase.from('point_redemptions').select(`
          id, voucher_code, status, points_spent, created_at, expires_at,
          reward:point_rewards(name)
        `).eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      ]);

      setBalance(balanceRes.data?.balance ?? 0);
      setRewards(rewardsRes.data || []);
      setRedemptions(redemptionsRes.data || []);
    } catch (e) {
      console.warn('[Rewards] fetch error:', e?.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Redeem points
  const handleRedeem = async (reward) => {
    if (balance < reward.points_cost) {
      showToast(`Poin tidak cukup. Butuh ${reward.points_cost} poin.`, 'error');
      return;
    }

    if (!confirm(`Tukar ${reward.points_cost} poin untuk "${reward.name}"?\n\nVoucher berlaku 90 hari.`)) return;

    setRedeeming(reward.id);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) { showToast('Sesi berakhir, silakan login ulang.', 'error'); return; }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-points`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reward_id: reward.id }),
      });

      const result = await resp.json();

      if (result.success) {
        showToast(`✅ Berhasil! Voucher: ${result.voucher_code}`, 'success');
        fetchData(); // refresh balance + redemptions
      } else {
        showToast(result.error || 'Gagal redeem poin', 'error');
      }
    } catch (e) {
      showToast('Gagal terhubung ke server: ' + e.message, 'error');
    } finally {
      setRedeeming(null);
    }
  };

  // Login required
  if (!user) {
    return (
      <div className="section-full-mobile w-full">
        <div className="mobile-viewport-group">
          <HeaderProducts onCartOpen={openCart} forceScrolled />
          <section className="section-mobile relative flex flex-col items-center justify-center text-center px-4">
            <div className="text-4xl mb-3">🏆</div>
            <p className="text-gray-500 mb-4">Login dulu untuk lihat poin & tukar dengan voucher.</p>
            <Link to="/admin" className="text-eglux-secondary font-semibold hover:underline">Masuk ke akun</Link>
          </section>
        </div>
        <Footer />
      </div>
    );
  }

  const formatDiscount = (reward) => {
    if (reward.discount_type === 'fixed') return `Rp ${reward.discount_value.toLocaleString('id-ID')}`;
    if (reward.discount_type === 'percentage') return `${reward.discount_value}%`;
    if (reward.discount_type === 'free_shipping') return 'Free Shipping';
    return '-';
  };

  return (
    <>
      <HeaderProducts onCartOpen={openCart} forceScrolled />

      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-8">
        {/* Header + Balance */}
        <div className="flex items-center justify-between mb-1 gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-eglux-primary">Poin Saya</h1>
          <Link to="/claim-points" className="text-xs text-eglux-secondary font-medium hover:underline whitespace-nowrap">
            Klaim Poin Marketplace →
          </Link>
        </div>

        {/* Balance Card */}
        <div className="bg-gradient-to-r from-eglux-primary to-gray-800 rounded-2xl p-6 mb-8 text-white">
          <p className="text-[0.7rem] uppercase tracking-wider text-white/60 mb-1">Saldo Poin Anda</p>
          <p className="text-4xl font-bold mb-2">
            {loading ? '...' : balance.toLocaleString('id-ID')} <span className="text-lg font-normal text-white/60">poin</span>
          </p>
          <p className="text-xs text-white/50">1 poin = Rp 1.000 · Expire 1 tahun setelah didapat</p>
        </div>

        {/* Rewards Catalog */}
        <h2 className="text-base font-bold text-eglux-primary mb-4">Tukar Poin dengan Voucher</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-eglux-secondary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rewards.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
            <div className="text-4xl mb-3">🎁</div>
            <p className="text-gray-500">Belum ada rewards tersedia.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {rewards.map((reward) => {
              const canAfford = balance >= reward.points_cost;
              return (
                <div
                  key={reward.id}
                  className={`bg-white border rounded-xl p-5 transition-all ${
                    canAfford ? 'border-eglux-secondary/30 hover:shadow-lg hover:border-eglux-secondary' : 'border-gray-200 opacity-70'
                  }`}
                >
                  {/* Discount Value */}
                  <div className="text-center mb-3">
                    <p className="text-2xl font-bold text-eglux-secondary">
                      {formatDiscount(reward)}
                    </p>
                    {reward.discount_type === 'fixed' && (
                      <p className="text-xs text-gray-400">Potongan langsung</p>
                    )}
                    {reward.discount_type === 'percentage' && (
                      <p className="text-xs text-gray-400">Dari total belanja</p>
                    )}
                    {reward.discount_type === 'free_shipping' && (
                      <p className="text-xs text-gray-400">Gratis ongkir 1x</p>
                    )}
                  </div>

                  {/* Name + Description */}
                  <p className="text-sm font-semibold text-eglux-primary text-center mb-1">{reward.name}</p>
                  {reward.description && (
                    <p className="text-[0.7rem] text-gray-400 text-center mb-3 leading-relaxed">{reward.description}</p>
                  )}

                  {/* Points Cost */}
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="8" r="6" />
                      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
                    </svg>
                    <span className={`text-sm font-bold ${canAfford ? 'text-amber-600' : 'text-gray-400'}`}>
                      {reward.points_cost} poin
                    </span>
                  </div>

                  {/* Min Purchase Info */}
                  <p className="text-[0.65rem] text-gray-400 text-center mb-3">
                    Min. belanja: Rp {reward.min_purchase.toLocaleString('id-ID')}
                  </p>

                  {/* Redeem Button */}
                  <button
                    onClick={() => handleRedeem(reward)}
                    disabled={!canAfford || redeeming === reward.id}
                    className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none ${
                      canAfford
                        ? 'bg-eglux-secondary text-white hover:opacity-90 disabled:opacity-60'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {redeeming === reward.id ? '⏳ Memproses...' : canAfford ? 'Tukar Sekarang' : 'Poin Belum Cukup'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Voucher History */}
        {redemptions.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-eglux-primary mb-3">Voucher Saya</h2>
            <div className="space-y-3">
              {redemptions.map((r) => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-eglux-primary">
                      {r.reward?.name || 'Voucher'}
                    </p>
                    <p className="text-xs text-gray-500">
                      Code: <span className="font-mono font-semibold text-eglux-secondary">{r.voucher_code}</span>
                    </p>
                    <p className="text-[0.7rem] text-gray-400">
                      {r.points_spent} poin · Expire: {new Date(r.expires_at).toLocaleDateString('id-ID')}
                    </p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[0.65rem] font-semibold border whitespace-nowrap ${
                    r.status === 'active' ? 'bg-green-50 text-green-700 border-green-200'
                    : r.status === 'used' ? 'bg-gray-100 text-gray-500 border-gray-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {r.status === 'active' ? 'Aktif' : r.status === 'used' ? 'Sudah Dipakai' : 'Expired'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Footer />
      <Toast toast={toast} onClose={closeToast} />
    </>
  );
};

export default RewardsPage;
