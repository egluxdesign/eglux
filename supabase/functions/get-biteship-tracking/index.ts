// supabase/functions/get-biteship-tracking/index.ts
// ============================================================================
// get-biteship-tracking — Fetch tracking detail dari Biteship API
// ============================================================================
// Auth: requireAuthenticated (user hanya bisa lacak pesanan sendiri)
//
// Cara panggil:
//   POST /functions/v1/get-biteship-tracking
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { "order_id": "uuid" }
//
// Flow:
//   1. Verify user login
//   2. Fetch order dari DB (verify customer.email = user.email)
//   3. Call Biteship API: GET /v1/trackings/{biteship_order_id}
//   4. Return tracking data (history, courier, origin, destination)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BITESHIP_API = "https://api.biteship.com/v1";
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order dari DB + verify ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id, biteship_order_id, tracking_number, courier_code, courier_service,
        shipping_address, shipping_city, status, payment_status,
        customer:customers(email, name, phone)
      `)
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return json({ error: "Order not found" }, 404);
    }

    // Verify: order milik user ini
    const customerEmail = (order.customer as any)?.email;
    if (customerEmail !== authResult.user!.email) {
      return json({ error: "Unauthorized: this order does not belong to you" }, 403);
    }

    // 2. Kalau belum ada biteship_order_id, return basic info
    if (!order.biteship_order_id) {
      return json({
        success: true,
        tracking: null,
        order: {
          id: order.id,
          status: order.status,
          payment_status: order.payment_status,
          courier_code: order.courier_code,
          courier_service: order.courier_service,
          shipping_address: order.shipping_address,
          shipping_city: order.shipping_city,
          tracking_number: order.tracking_number,
        },
        message: "Pesanan belum dikirim. Tracking akan tersedia setelah pembayaran dikonfirmasi.",
      });
    }

    // 3. Call Biteship Tracking API
    const biteshipResp = await fetch(
      `${BITESHIP_API}/trackings/${order.biteship_order_id}`,
      {
        headers: { Authorization: BITESHIP_API_KEY },
      }
    );

    const biteshipData = await biteshipResp.json();

    if (!biteshipResp.ok) {
      console.warn("[get-biteship-tracking] Biteship API error:", biteshipData);
      return json({
        success: true,
        tracking: null,
        order: {
          id: order.id,
          status: order.status,
          payment_status: order.payment_status,
          courier_code: order.courier_code,
          courier_service: order.courier_service,
          shipping_address: order.shipping_address,
          shipping_city: order.shipping_city,
          tracking_number: order.tracking_number,
        },
        message: "Tracking belum tersedia dari kurir. Coba lagi nanti.",
      });
    }

    // 4. Return tracking data
    return json({
      success: true,
      tracking: biteshipData,
      order: {
        id: order.id,
        status: order.status,
        payment_status: order.payment_status,
        courier_code: order.courier_code,
        courier_service: order.courier_service,
        shipping_address: order.shipping_address,
        shipping_city: order.shipping_city,
        tracking_number: order.tracking_number,
      },
    });
  } catch (e) {
    console.error("[get-biteship-tracking]", e);
    return json({ error: e.message }, 500);
  }
});
