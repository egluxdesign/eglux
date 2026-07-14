// supabase/functions/generate-biteship-waybill/index.ts
// ============================================================================
// Force generate / sync waybill untuk Biteship order yang sudah ada
// ============================================================================
//
// Use case:
//   - Biteship webhook belum fires (sandbox lambat / status manual di dashboard)
//   - Mau force waybill generation segera setelah create-biteship-order
//   - Mau sync ulang tracking_number pakai waybill_id terbaru dari Biteship
//
// Cara panggil:
//   POST /functions/v1/generate-biteship-waybill
//   Body: { "order_id": "uuid" }
//   Headers: Authorization: Bearer <anon-key>
//
// Flow:
//   1. Fetch order dari DB untuk dapat biteship_order_id
//   2. GET /v1/orders/{biteship_order_id} dari Biteship untuk cek current state
//   3. Kalau waybill_url belum ada → POST /v1/orders/{id}/generate_waybill
//   4. Update orders table: tracking_number (prefer waybill_id), waybill_url,
//      biteship_status, biteship_pickup_code
//   5. Return synced data
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const BITESHIP_API = "https://api.biteship.com/v1";
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── AUTH: Admin-only (team_dev / master / admin) ──
    // Force-generate waybill = admin operation (bukan customer-facing)
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const body = await req.json();
    const { order_id } = body;

    if (!order_id) {
      return json({ error: "order_id is required (UUID)" }, 400);
    }
    if (!BITESHIP_API_KEY) {
      return json({ error: "BITESHIP_API_KEY env var not set" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order dari DB untuk dapat biteship_order_id
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select(
        "id, biteship_order_id, tracking_number, biteship_waybill_url, biteship_status, biteship_pickup_code"
      )
      .eq("id", order_id)
      .single();

    if (oe || !order) {
      console.error("[generate-waybill] Order not found:", order_id, oe?.message);
      return json({ error: "Order not found", details: oe?.message }, 404);
    }

    if (!order.biteship_order_id) {
      return json(
        {
          error: "Order belum ada biteship_order_id. Jalankan create-biteship-order dulu.",
          order_id,
        },
        400
      );
    }

    console.log(
      `[generate-waybill] Processing order ${order_id}, biteship_id=${order.biteship_order_id}`
    );
    console.log("[generate-waybill] Current DB state:", {
      tracking_number: order.tracking_number,
      biteship_waybill_url: order.biteship_waybill_url,
      biteship_status: order.biteship_status,
    });

    // 2. GET order detail dari Biteship untuk cek current state
    console.log(`[generate-waybill] GET ${BITESHIP_API}/orders/${order.biteship_order_id}`);

    const detailResp = await fetch(
      `${BITESHIP_API}/orders/${order.biteship_order_id}`,
      {
        method: "GET",
        headers: {
          Authorization: BITESHIP_API_KEY,
          Accept: "application/json",
        },
      }
    );

    const detailData = await detailResp.json();

    if (!detailResp.ok || !detailData.success) {
      console.error(
        "[generate-waybill] Biteship GET order failed:",
        detailResp.status,
        detailData
      );
      return json(
        {
          error:
            detailData.error?.message ||
            `Biteship API error (HTTP ${detailResp.status})`,
          raw: detailData,
        },
        detailResp.status || 502
      );
    }

    console.log(
      "[generate-waybill] Biteship order detail:",
      JSON.stringify(detailData).slice(0, 800)
    );

    // 3. Extract waybill info dari response Biteship
    const courier = detailData.courier || {};
    const waybillId = courier.waybill_id || null;
    const trackingId = courier.tracking_id || null;
    const waybillUrl = detailData.waybill_url || courier.waybill_url || null;
    const biteshipStatus = detailData.status || null;
    const pickupCode = detailData.pickup_code || null;

    // 4. Force generate waybill kalau waybill_url belum ada
    let finalWaybillId = waybillId;
    let finalWaybillUrl = waybillUrl;
    let generatedNow = false;
    let generateAttempted = false;
    let generateError = null;

    if (!finalWaybillUrl) {
      console.log(
        "[generate-waybill] Waybill belum ada, hitting generate_waybill endpoint..."
      );
      generateAttempted = true;

      try {
        const genResp = await fetch(
          `${BITESHIP_API}/orders/${order.biteship_order_id}/generate_waybill`,
          {
            method: "POST",
            headers: {
              Authorization: BITESHIP_API_KEY,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({}),
          }
        );

        const genData = await genResp.json();
        console.log(
          "[generate-waybill] Generate waybill response:",
          genResp.status,
          JSON.stringify(genData).slice(0, 800)
        );

        if (genResp.ok && genData.success) {
          // Update finalWaybillId dan finalWaybillUrl dari response generate_waybill
          const genCourier = genData.courier || {};
          finalWaybillId = genCourier.waybill_id || genData.waybill_id || finalWaybillId;
          finalWaybillUrl =
            genData.waybill_url || genCourier.waybill_url || finalWaybillUrl;
          generatedNow = true;
        } else {
          // generate_waybill endpoint gagal atau tidak support
          generateError =
            genData.error?.message || `HTTP ${genResp.status}: ${JSON.stringify(genData)}`;
          console.warn("[generate-waybill] generate_waybill failed:", generateError);
        }
      } catch (err: any) {
        generateError = `Network error: ${err.message}`;
        console.warn("[generate-waybill] generate_waybill network error:", err);
      }
    } else {
      console.log(
        "[generate-waybill] Waybill sudah ada di Biteship, no need to generate"
      );
    }

    // 5. Update DB dengan info terbaru
    const updatePayload: Record<string, unknown> = {};

    // ⚠️ IDEMPOTENCY CHECK untuk tracking number:
    // Biteship regenerate waybill_id SETIAP KALI GET /orders/{id} dipanggil.
    // Kalau kita overwrite setiap kali, customer bakal dapat resi berbeda-beda.
    //
    // Rule:
    //   - Kalau DB sudah punya tracking_number dengan format AWB (e.g., "WYB-..." untuk JNE,
    //     pattern: 3 huruf + dash + angka) → JANGAN overwrite
    //   - Kalau DB masih punya Biteship internal ID (24-char alphanumeric tanpa dash,
    //     e.g., "yvbKGFqRxOEfhH42DDsCxny0") → boleh update ke waybill_id (upgrade)
    //   - Kalau DB kosong → set dengan newTrackingNumber
    const newTrackingNumber = finalWaybillId || trackingId;
    const currentTracking = order.tracking_number;
    const isCurrentAWB = currentTracking && /[A-Z]{3}-\d+/.test(currentTracking);
    const isNewAWB = newTrackingNumber && /[A-Z]{3}-\d+/.test(newTrackingNumber);

    let trackingNumberUpdated = false;
    let trackingUpdateReason = "";
    if (newTrackingNumber && newTrackingNumber !== currentTracking) {
      if (!currentTracking) {
        // DB kosong → set baru
        updatePayload.tracking_number = newTrackingNumber;
        trackingNumberUpdated = true;
        trackingUpdateReason = "set (was empty)";
        console.log(`[generate-waybill] Setting tracking_number (was empty): ${newTrackingNumber}`);
      } else if (!isCurrentAWB && isNewAWB) {
        // Upgrade: dari Biteship internal ID → actual AWB
        updatePayload.tracking_number = newTrackingNumber;
        trackingNumberUpdated = true;
        trackingUpdateReason = "upgrade (internal ID → AWB)";
        console.log(`[generate-waybill] Upgrading tracking_number: ${currentTracking} → ${newTrackingNumber}`);
      } else if (isCurrentAWB && newTrackingNumber !== currentTracking) {
        // ⚠️ CRITICAL: AWB lama vs AWB baru — JANGAN overwrite, log warning
        trackingUpdateReason = "REFUSED (would overwrite existing AWB with new one)";
        console.warn(
          `[generate-waybill] ⚠️ REFUSING to overwrite AWB: ${currentTracking} → ${newTrackingNumber} (Biteship regenerated waybill). ` +
          `Keeping existing AWB to avoid customer confusion. ` +
          `If you need to force update, do it manually via SQL.`
        );
      }
      // else: same value, no update needed
    }

    // ⚠️ FALLBACK untuk waybill_url:
    //   Biteship API tidak return waybill_url di GET /orders/{id} response.
    //   Tapi pattern URL konsisten: https://biteship.com/waybill/{biteship_order_id}.pdf
    //   Construct sebagai fallback kalau API response tidak kasih waybill_url.
    //
    //   Pastikan hanya construct kalau waybill_id sudah ada (indikasi waybill sudah generated).
    let effectiveWaybillUrl = finalWaybillUrl;
    if (!effectiveWaybillUrl && finalWaybillId) {
      effectiveWaybillUrl = `https://biteship.com/waybill/${order.biteship_order_id}.pdf`;
      console.log(
        `[generate-waybill] Constructed waybill_url fallback: ${effectiveWaybillUrl}`
      );
    }

    if (effectiveWaybillUrl && effectiveWaybillUrl !== order.biteship_waybill_url) {
      updatePayload.biteship_waybill_url = effectiveWaybillUrl;
    }

    if (biteshipStatus && biteshipStatus !== order.biteship_status) {
      updatePayload.biteship_status = biteshipStatus;
    }

    if (pickupCode && pickupCode !== order.biteship_pickup_code) {
      updatePayload.biteship_pickup_code = pickupCode;
    }

    let dbUpdated = false;
    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", order_id);

      if (updateError) {
        console.error("[generate-waybill] DB update failed:", updateError);
        return json(
          {
            error: "Failed to update order in DB",
            details: updateError.message,
            biteship_data: {
              waybill_id: finalWaybillId,
              tracking_id: trackingId,
              waybill_url: finalWaybillUrl,
              biteship_status: biteshipStatus,
              pickup_code: pickupCode,
            },
          },
          500
        );
      }
      dbUpdated = true;
      console.log(
        "[generate-waybill] ✓ DB updated:",
        JSON.stringify(updatePayload)
      );
    } else {
      console.log(
        "[generate-waybill] No fields to update (already in sync with Biteship)"
      );
    }

    // 6. Return comprehensive result
    return json({
      success: true,
      order_id,
      biteship_order_id: order.biteship_order_id,

      // Synced data (final values in DB after update, atau existing kalau refused)
      tracking_number: updatePayload.tracking_number || order.tracking_number,
      waybill_id: finalWaybillId,
      tracking_id: trackingId,
      waybill_url: effectiveWaybillUrl,
      waybill_url_source: finalWaybillUrl ? "api" : (effectiveWaybillUrl ? "fallback_constructed" : null),
      biteship_status: biteshipStatus,
      pickup_code: pickupCode,

      // Action info
      generated_now: generatedNow,
      generate_attempted: generateAttempted,
      generate_error: generateError,
      db_updated: dbUpdated,
      updated_fields: Object.keys(updatePayload),

      // Idempotency info
      tracking_number_action: trackingUpdateReason || "no change",
      tracking_number_refused: trackingUpdateReason.startsWith("REFUSED"),
      previous_tracking_number: currentTracking,
    });
  } catch (e) {
    console.error("[generate-biteship-waybill]", e);
    return json({ error: e.message }, 500);
  }
});
