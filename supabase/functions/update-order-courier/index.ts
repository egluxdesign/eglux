// supabase/functions/update-order-courier/index.ts
// ============================================================================
// update-order-courier — Customer ubah kurir pengiriman untuk order PENDING
// ============================================================================
//
// Kapan dipanggil?
//   Saat user lihat rincian pesanan status "Menunggu Pembayaran" (pending),
//   klik "Ubah Kurir Pengiriman" → pilih kurir baru dari Biteship rates.
//
// Validasi:
//   1. User wajib login (requireAuthenticated)
//   2. Order harus milik user (customer.email = user.email)
//   3. Order status HARUS 'pending' (belum bayar). Setelah bayar, kurir locked.
//   4. Courier data wajib lengkap (courier_code, courier_service, courier_rate,
//      courier_duration)
//
// Yang di-update:
//   - courier_code, courier_service, courier_rate, courier_duration
//   - shipping_cost (sama dengan courier_rate)
//   - total_amount (subtotal + shipping_cost)
//   - snap_token, snap_redirect_url → NULL (force re-mint saat user klik
//     "Lanjutkan Pembayaran" lagi, supaya Midtrans dapat amount baru)
//
// Cara panggil:
//   POST /functions/v1/update-order-courier
//   Headers: Authorization: Bearer <user-jwt>
//   Body: {
//     order_id: "uuid",
//     courier: {
//       courier_code: "jne",
//       courier_service: "REG",
//       courier_rate: 18000,
//       courier_duration: "2-3 hari"
//     }
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── AUTH ──
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const { order_id, courier } = body;

    // ── VALIDATE INPUT ──
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!courier) return json({ error: "courier object is required" }, 400);

    const requiredFields = ["courier_code", "courier_service", "courier_rate", "courier_duration"];
    for (const f of requiredFields) {
      if (courier[f] === undefined || courier[f] === null || courier[f] === "") {
        return json({ error: `courier.${f} is required` }, 400);
      }
    }
    if (Number(courier.courier_rate) < 0) {
      return json({ error: "courier.courier_rate must be >= 0" }, 400);
    }

    // ── FETCH ORDER + VERIFY OWNERSHIP ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id, status, subtotal, shipping_cost, total_amount,
        customer:customers(email)
      `)
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return json({ error: "Order not found" }, 404);
    }

    // Verify ownership
    const customerEmail = (order.customer as any)?.email;
    if (customerEmail !== authResult.user!.email) {
      return json({ error: "Unauthorized: this order does not belong to you" }, 403);
    }

    // Verify status pending (only pending orders can change courier)
    if (order.status !== "pending") {
      return json(
        { error: `Kurir tidak bisa diubah. Status order: ${order.status}. Hanya order "pending" yang bisa diubah kurirnya.` },
        400
      );
    }

    // ── CALCULATE NEW TOTAL ──
    const newShippingCost = Number(courier.courier_rate);
    const subtotal = Number(order.subtotal) || 0;
    const newTotal = subtotal + newShippingCost;

    // ── UPDATE ORDER ──
    const updatePayload = {
      courier_code: String(courier.courier_code).toLowerCase(),
      courier_service: courier.courier_service,
      courier_rate: newShippingCost,
      courier_duration: courier.courier_duration,
      shipping_cost: newShippingCost,
      total_amount: newTotal,
      // ⭐ Force re-mint Snap token (amount berubah, token lama gak valid)
      snap_token: null,
      snap_redirect_url: null,
    };

    const { error: updateErr } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order_id);

    if (updateErr) {
      console.error("[update-order-courier] Update failed:", updateErr);
      return json({ error: "Failed to update order", details: updateErr.message }, 500);
    }

    // ── SUCCESS ──
    return json({
      success: true,
      order_id,
      updated_fields: updatePayload,
      message: "Kurir berhasil diubah. Klik 'Lanjutkan Pembayaran' untuk bayar.",
    });
  } catch (e) {
    console.error("[update-order-courier]", e);
    return json({ error: e.message }, 500);
  }
});
