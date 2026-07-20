// supabase/functions/sync-biteship-status/index.ts
// ============================================================================
// sync-biteship-status — Manual sync order status dari Biteship API
// ============================================================================
//
// Kapan dipanggil?
//   - Webhook Biteship gak ter-trigger (mis. URL webhook salah, atau Biteship
//     lagi down)
//   - User mau test apakah sync berfungsi
//   - Admin mau force-update status order tertentu
//
// Flow:
//   1. User login (requireAuthenticated)
//   2. POST { order_id: "EGLUX UUID" }
//   3. Fetch order dari DB → dapat biteship_order_id
//   4. Call Biteship API: GET /v1/orders/{biteship_order_id}
//   5. Update orders table dengan status terbaru dari Biteship
//   6. Return updated status ke frontend
//
// Cara panggil:
//   POST /functions/v1/sync-biteship-status
//   Headers: Authorization: Bearer <user-jwt>
//   Body: { "order_id": "uuid" }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BITESHIP_API = "https://api.biteship.com/v1";
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;

// ⭐ Reuse mapping dari biteship-webhook (sama persis)
function mapBiteshipToEgluxStatus(biteshipStatus: string): string | null {
  switch (biteshipStatus) {
    case "confirmed":
    case "allocated":
    case "pickingUp":
      return "processing";
    case "picked":
    case "inTransit":
    case "droppingOff":
    case "onHold":
      return "shipping";
    case "delivered":
      return "completed";
    case "cancelled":
    case "returned":
    case "rejected":
    case "courierNotFound":
    case "disposed":
    case "returnInTransit":
      return "cancelled";
    default:
      return null;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!BITESHIP_API_KEY) return json({ error: "BITESHIP_API_KEY not set" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order dari DB + verify ownership
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        id, status, biteship_status, biteship_order_id, tracking_number,
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

    // 2. Kalau belum ada biteship_order_id, return info
    if (!order.biteship_order_id) {
      return json({
        success: true,
        order_id,
        biteship_status: null,
        eglux_status: order.status,
        message: "Order belum memiliki biteship_order_id. Tracking belum tersedia.",
      });
    }

    // 3. Call Biteship API: GET /v1/orders/{biteship_order_id}
    console.log(`[sync-biteship-status] Fetching from Biteship API: ${order.biteship_order_id}`);
    const biteshipResp = await fetch(
      `${BITESHIP_API}/orders/${order.biteship_order_id}`,
      {
        headers: { Authorization: BITESHIP_API_KEY },
      }
    );

    const biteshipData = await biteshipResp.json();

    if (!biteshipResp.ok) {
      console.error("[sync-biteship-status] Biteship API error:", biteshipData);
      return json({
        error: "Biteship API error",
        details: biteshipData,
      }, 502);
    }

    // 4. Extract status + tracking number dari response
    const biteshipStatus = biteshipData.status;
    const trackingNumber =
      biteshipData.courier?.waybill_id ||
      biteshipData.courier?.tracking_id ||
      biteshipData.courier?.tracking_number ||
      biteshipData.tracking_id ||
      null;
    const waybillUrl = biteshipData.waybill_url || null;
    const pickupCode = biteshipData.pickup_code || null;

    console.log("[sync-biteship-status] Biteship response:", {
      biteship_order_id: order.biteship_order_id,
      status: biteshipStatus,
      tracking_number: trackingNumber,
    });

    // 5. Update orders table
    const updatePayload: Record<string, unknown> = {};

    if (biteshipStatus) {
      updatePayload.biteship_status = biteshipStatus;
      const egluxStatus = mapBiteshipToEgluxStatus(biteshipStatus);
      if (egluxStatus) {
        updatePayload.status = egluxStatus;
      }
    }
    if (trackingNumber) updatePayload.tracking_number = trackingNumber;
    if (waybillUrl) updatePayload.biteship_waybill_url = waybillUrl;
    if (pickupCode) updatePayload.biteship_pickup_code = pickupCode;

    let updatedFields: string[] = [];
    if (Object.keys(updatePayload).length > 0) {
      const { data: updateResult, error: updateError } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", order_id)
        .select("id, status, biteship_status, tracking_number");

      if (updateError) {
        console.error("[sync-biteship-status] DB update failed:", updateError);
        return json({ error: "Failed to update order", details: updateError.message }, 500);
      }

      updatedFields = Object.keys(updatePayload);
      console.log("[sync-biteship-status] ✓ Order updated:", {
        order_id,
        updated_fields: updatedFields,
        new_status: updateResult?.[0]?.status,
        new_biteship_status: updateResult?.[0]?.biteship_status,
      });
    }

    // 6. Return result
    return json({
      success: true,
      order_id,
      previous_status: order.status,
      previous_biteship_status: order.biteship_status,
      new_biteship_status: biteshipStatus,
      new_eglux_status: updatePayload.status || order.status,
      tracking_number: trackingNumber || order.tracking_number,
      updated_fields: updatedFields,
      raw_biteship_response: biteshipData, // untuk debugging
    });
  } catch (e) {
    console.error("[sync-biteship-status]", e);
    return json({ error: e.message }, 500);
  }
});
