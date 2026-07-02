// hooks/useCheckout.js
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkout = async (cartItems, customerData) => {
    setLoading(true);
    setError(null);

    try {
      // 1. Hitung total
      const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // 2. Insert order (pending)
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          customer_id: customerData.id,
          status: "pending",
          total_amount: total,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      // 3. Insert order items
      const orderItems = cartItems.map(item => ({
        order_id: order.id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_at_time: item.price,
        created_at: new Date().toISOString()
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
      if (itemsErr) throw itemsErr;

      // 4. Panggil Edge Function
      const { data: result, error: fnError } = await supabase.functions.invoke("deduct-stock", {
        body: { order_id: order.id }
      });

      // 5. Handle response
      if (!result?.success) {
        setError({
          type: result?.error || "UNKNOWN",
          details: result?.details || [],
          message: result?.details 
            ? `Stok habis untuk: ${result.details.map(d => `${d.name} (${d.sku}) - butuh ${d.requested}, tersedia ${d.available}`).join(", ")}`
            : "Terjadi kesalahan saat memproses stok"
        });
        return { success: false, orderId: order.id };
      }

      return { success: true, orderId: order.id };

    } catch (err) {
      setError({ type: "SYSTEM_ERROR", message: err.message });
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  return { checkout, loading, error };
}