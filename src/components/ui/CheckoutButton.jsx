// src/components/ui/CheckoutButton.jsx
import { useCheckout } from "../../hooks/useCheckout";
import { useState } from "react";

export default function CheckoutButton({ cartItems, onSuccess }) {
  const { checkout, loading, error } = useCheckout();
  const [showForm, setShowForm] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    shipping_address: "",
    notes: "",
    payment_method: "transfer"
  });

  const handleCheckout = async () => {
    if (!showForm) {
      setShowForm(true);
      return;
    }

    if (!customerInfo.shipping_address) {
      alert("Alamat pengiriman wajib diisi");
      return;
    }

    const result = await checkout(cartItems, customerInfo);
    if (result.success) {
      onSuccess(result.orderId);
    }
  };

  return (
    <div>
      {showForm && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={customerInfo.payment_method}
            onChange={e => setCustomerInfo({...customerInfo, payment_method: e.target.value})}
            style={{ display: "block", marginBottom: 8, width: "100%", padding: 8 }}
          >
            <option value="transfer">Transfer Bank</option>
            <option value="cod">COD (Bayar di Tempat)</option>
            <option value="ewallet">E-Wallet</option>
          </select>
          
          <textarea
            placeholder="Alamat Pengiriman *"
            value={customerInfo.shipping_address}
            onChange={e => setCustomerInfo({...customerInfo, shipping_address: e.target.value})}
            style={{ display: "block", marginBottom: 8, width: "100%", padding: 8 }}
            rows={3}
          />
          
          <textarea
            placeholder="Catatan (opsional)"
            value={customerInfo.notes}
            onChange={e => setCustomerInfo({...customerInfo, notes: e.target.value})}
            style={{ display: "block", marginBottom: 8, width: "100%", padding: 8 }}
            rows={2}
          />
        </div>
      )}

      <button 
        onClick={handleCheckout} 
        disabled={loading || cartItems.length === 0}
        style={{ padding: "12px 24px", fontSize: 16 }}
      >
        {loading ? "Memproses..." : showForm ? "Konfirmasi Pesanan" : "Checkout"}
      </button>

      {error && (
        <div style={{ color: "red", marginTop: 12, padding: 12, background: "#fee", borderRadius: 4 }}>
          <strong>{error.type === "INSUFFICIENT_STOCK" ? "Stok Tidak Cukup" : "Error"}</strong>
          <p>{error.message}</p>
          {error.details?.length > 0 && (
            <ul style={{ marginTop: 8 }}>
              {error.details.map((d, i) => (
                <li key={i}>
                  {d.name} ({d.sku}) — butuh: {d.requested}, tersedia: {d.available}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}