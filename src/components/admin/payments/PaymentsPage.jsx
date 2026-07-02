import { supabase } from '../../lib/supabaseClient';
import { useMidtrans } from '../../../hooks/useMidtrans';

const PaymentsPage = () => {
  // Panggil hook untuk load script Snap (Pastikan ambil clientKey dari db/state)
  useMidtrans(import.meta.env.VITE_MIDTRANS_CLIENT_KEY);

  const handleCheckout = async (orderId, amount) => {
    try {
      // 1. Panggil Edge Function
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: { orderId, totalAmount: amount },
      });

      if (error) throw error;

      // 2. Tampilkan Snap Popup
      window.snap.pay(data.token, {
        onSuccess: async (result) => {
          console.log("Success:", result);
          // Update status di Supabase ke 'paid'
          await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
        },
        onPending: (result) => alert("Menunggu pembayaran"),
        onError: (result) => alert("Pembayaran gagal"),
      });
    } catch (err) {
      alert("Gagal memproses pembayaran");
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Payment Center</h1>
      <button 
        onClick={() => handleCheckout('ORDER-123', 50000)}
        className="bg-[#c9a96e] text-white py-2 px-6 rounded-xl font-bold"
      >
        Bayar Contoh Pesanan
      </button>
    </div>
  );
};