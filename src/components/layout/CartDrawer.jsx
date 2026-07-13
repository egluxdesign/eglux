// src/components/layout/CartDrawer.jsx
// ============================================================================
// CartDrawer — slide-out panel dari kanan, menampilkan item keranjang.
//
// Fitur auth-gated checkout (sesuai request user):
//   - Tombol "Bayar Sekarang" cek auth terlebih dahulu.
//   - Kalau belum login → simpan intent di sessionStorage, redirect ke /admin.
//   - Setelah login/register berhasil → AdminPage redirect balik ke page asal
//     (state.from). useEffect di komponen ini deteksi intent flag + user login
//     → auto-buka CheckoutModalMidtrans.
//
// Pemakaian:
//   <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} showToast={showToast} />
//
// Catatan: CartDrawer juga dipakai sebagai "host" CheckoutModalMidtrans.
//   Modal checkout di-render di sini (bukan di page parent), jadi auto-open
//   logic juga tinggal di sini.
// ============================================================================

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart, rupiah } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import CheckoutModalMidtrans, { CHECKOUT_INTENT_KEY } from '../ui/CheckoutModalMidtrans';

// ── Minimalist line icons (1-color, stroke=currentColor) ──
const IconClose = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconTrash = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconMinus = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconPlus = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconBag = ({ className = 'w-16 h-16' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const CartDrawer = ({ isOpen, onClose, showToast }) => {
  const { cart, totalQty, totalPrice, updateQty, removeItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // State untuk CheckoutModalMidtrans (modal pembayaran)
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // ── Auto-open checkout modal setelah balik dari login ──
  // Trigger: user balik ke page ini setelah login, dan intent flag masih ada.
  useEffect(() => {
    if (
      user &&
      sessionStorage.getItem(CHECKOUT_INTENT_KEY) === 'true' &&
      cart.length > 0
    ) {
      sessionStorage.removeItem(CHECKOUT_INTENT_KEY);
      setCheckoutOpen(true);
    }
  }, [user, cart.length]);

  // ── Lock body scroll saat drawer terbuka ──
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // ── Handler: tombol "Bayar Sekarang" ──
  // Cek auth DULU sebelum buka checkout modal.
  // Kalau belum login → simpan intent + redirect ke /admin.
  // Kalau sudah login → tutup drawer DULU, baru buka checkout modal.
  //   Urutan penting: onClose() harus dipanggil supaya drawer slide-out
  //   dan tidak menumpuk di belakang modal checkout.
  const handleCheckout = () => {
    if (cart.length === 0) return;

    if (!user) {
      try {
        sessionStorage.setItem(CHECKOUT_INTENT_KEY, 'true');
      } catch (e) {
        // sessionStorage mungkin disabled — fail silently
      }
      onClose?.(); // tutup drawer
      navigate('/admin', {
        state: { from: location.pathname + location.search },
        replace: true,
      });
      return;
    }

    // User sudah login → tutup drawer, lalu buka checkout modal.
    // onClose() trigger transition slide-out (300ms). Modal langsung buka
    // barengan — visually clean karena drawer off-screen (translate-x-full)
    // dan overlay-nya opacity-0 + pointer-events-none.
    onClose?.();
    setCheckoutOpen(true);
  };

  // ── ESC key handler ──
  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-[3000] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-[420px] bg-white z-[3001]
                    shadow-2xl flex flex-col transition-transform duration-300 ease-out
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Keranjang Belanja"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#eee]">
          <div className="flex items-center gap-2">
            <h2 className="text-[1rem] font-bold text-eglux-primary uppercase tracking-wide">
              Keranjang
            </h2>
            {totalQty > 0 && (
              <span className="text-[0.7rem] font-semibold text-eglux-secondary bg-eglux-secondary/10 px-2 py-0.5 rounded-full">
                {totalQty} item
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup keranjang"
            className="p-1.5 text-eglux-primary hover:text-eglux-secondary hover:bg-[#faf6ef] rounded-lg transition-colors cursor-pointer border-none bg-transparent"
          >
            <IconClose />
          </button>
        </div>

        {/* Body — cart items */}
        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 text-gray-400">
              <IconBag />
              <p className="mt-4 text-[0.92rem] font-semibold text-eglux-primary">
                Keranjang kamu kosong
              </p>
              <p className="mt-1 text-[0.8rem]">
                Yuk, mulai belanja dan temukan produk favoritmu!
              </p>
              <button
                onClick={onClose}
                className="mt-5 px-6 py-2.5 bg-eglux-primary text-white rounded-xl text-[0.85rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity border-none"
              >
                Mulai Belanja
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-[#eee]">
              {cart.map((item) => (
                <li key={`${item.id}-${item.variantId}`} className="flex gap-3 p-4">
                  {/* Thumbnail */}
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-[#f5f0e8] flex-shrink-0">
                    {item.img ? (
                      <img src={item.img} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <IconBag className="w-8 h-8" />
                      </div>
                    )}
                  </div>

                  {/* Detail + qty control */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.85rem] font-semibold text-eglux-primary line-clamp-2">
                      {item.name}
                    </p>
                    {item.variantName && (
                      <p className="text-[0.72rem] text-gray-500 mt-0.5">{item.variantName}</p>
                    )}
                    <p className="text-[0.82rem] font-bold text-eglux-secondary mt-1">
                      {rupiah(item.price)}
                    </p>

                    <div className="flex items-center justify-between mt-2">
                      {/* Qty stepper */}
                      <div className="flex items-center border border-[#eee] rounded-lg overflow-hidden">
                        <button
                          onClick={() => updateQty(item.id, item.variantId, item.qty - 1)}
                          aria-label="Kurangi jumlah"
                          className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-eglux-primary hover:bg-[#faf6ef] transition-colors cursor-pointer border-none bg-transparent"
                        >
                          <IconMinus />
                        </button>
                        <span className="w-8 text-center text-[0.82rem] font-semibold text-eglux-primary">
                          {item.qty}
                        </span>
                        <button
                          onClick={() => updateQty(item.id, item.variantId, item.qty + 1)}
                          aria-label="Tambah jumlah"
                          className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-eglux-primary hover:bg-[#faf6ef] transition-colors cursor-pointer border-none bg-transparent"
                        >
                          <IconPlus />
                        </button>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id, item.variantId)}
                        aria-label="Hapus item"
                        className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer — subtotal + checkout button */}
        {cart.length > 0 && (
          <div className="border-t border-[#eee] px-5 py-4 space-y-3 bg-[#faf6ef]">
            <div className="flex items-center justify-between">
              <span className="text-[0.82rem] font-semibold text-gray-600 uppercase tracking-wide">
                Subtotal
              </span>
              <span className="text-[1.1rem] font-bold text-eglux-primary">
                {rupiah(totalPrice)}
              </span>
            </div>
            <p className="text-[0.7rem] text-gray-500">
              Ongkos kirim dihitung saat checkout berdasarkan kode pos tujuan.
            </p>
            <button
              onClick={handleCheckout}
              className="w-full py-3.5 bg-eglux-primary text-white rounded-xl text-[0.95rem] font-bold cursor-pointer transition-all hover:opacity-90 border-none"
            >
              Bayar Sekarang
            </button>
            {!user && (
              <p className="text-[0.72rem] text-center text-gray-500">
                Kamu akan diminta login dulu untuk melanjutkan pembayaran.
              </p>
            )}
          </div>
        )}
      </aside>

      {/* Checkout Modal — di-render di sini supaya auto-open bisa di-trigger langsung */}
      <CheckoutModalMidtrans
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        showToast={showToast}
      />
    </>
  );
};

export default CartDrawer;
