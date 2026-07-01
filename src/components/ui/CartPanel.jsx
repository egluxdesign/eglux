// src/components/ui/CartPanel.jsx
// Panel keranjang slide-in dari kanan.
import { useCart, rupiah } from '../../context/CartContext';

const CartPanel = ({ isOpen, onClose, onCheckout }) => {
  const { cart, totalPrice, updateQty, removeItem } = useCart();

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/45 z-[2100] transition-all duration-300
                    ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 w-full md:w-[400px] h-screen bg-white z-[2101]
                    flex flex-col transition-transform duration-[350ms]
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-label="Keranjang Belanja"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#eee]">
          <h3 className="text-base font-bold text-eglux-primary uppercase tracking-[2px]">Keranjang</h3>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-[1.5rem] text-eglux-primary cursor-pointer
                       opacity-60 hover:opacity-100 hover:text-eglux-secondary transition-all duration-300
                       w-8 h-8 flex items-center justify-center"
            aria-label="Tutup keranjang"
          >
            &times;
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.length === 0
            ? <p className="text-center text-[#666] text-[0.9rem] py-12">Keranjang masih kosong</p>
            : cart.map((item) => (
              <div key={item.id} className="flex gap-4 py-4 border-b border-[#f0f0f0] items-start">
                {/* TODO: item.img → Supabase Storage URL */}
                <img src={item.img} alt={item.name}
                     className="w-16 h-16 object-cover rounded-[10px] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[0.85rem] font-semibold text-eglux-primary leading-snug mb-1 line-clamp-2">
                    {item.name}
                  </p>
                  <p className="text-[0.78rem] text-[#666] mb-2">
                    {item.variantName}{item.price ? ` · ${rupiah(item.price)}` : ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-[26px] h-[26px] border border-[#ddd] rounded-md bg-white flex items-center
                                 justify-center text-base text-eglux-primary font-semibold cursor-pointer
                                 hover:border-eglux-secondary transition-colors"
                    >
                      −
                    </button>
                    <span className="text-[0.88rem] font-bold min-w-[20px] text-center">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-[26px] h-[26px] border border-[#ddd] rounded-md bg-white flex items-center
                                 justify-center text-base text-eglux-primary font-semibold cursor-pointer
                                 hover:border-eglux-secondary transition-colors"
                    >
                      +
                    </button>
                    {item.price > 0 && (
                      <span className="ml-auto text-[0.82rem] font-bold text-eglux-secondary">
                        {rupiah(item.price * item.qty)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="bg-transparent border-none text-[#ccc] cursor-pointer text-lg
                             hover:text-red-500 transition-colors p-0.5 flex-shrink-0"
                  aria-label="Hapus item"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[#eee]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[0.85rem] text-[#666]">Total Belanja</span>
            <span className="text-base font-bold text-eglux-primary">
              {totalPrice > 0 ? rupiah(totalPrice) : 'Rp 0'}
            </span>
          </div>
          <button
            onClick={onCheckout}
            className="w-full py-4 bg-eglux-secondary text-white border-none rounded-xl
                       text-[0.95rem] font-bold cursor-pointer transition-all duration-300
                       hover:bg-eglux-primary"
          >
            Lanjut Checkout
          </button>
        </div>
      </div>
    </>
  );
};

export default CartPanel;
