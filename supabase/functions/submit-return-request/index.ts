// supabase/functions/submit-return-request/index.ts
// ============================================================================
// submit-return-request v3 — Customer submit + Admin approve with resolution
// ============================================================================
//
// Customer actions:
//   POST { order_id, reason, resolution, description, phone, images, video }
//   POST { return_id, action: 'cancel' }
//
// Admin actions (via service_role or admin JWT):
//   POST { return_id, action: 'approve',
//     admin_resolution: 'full_refund' | 'exchange' | 'partial_refund',
//     refund_amount?, partial_refund_amount?,
//     replacement_product_id?, replacement_variant_id?,
//     replacement_product_name?, replacement_variant_name?,
//     replacement_price?, price_difference?,
//     return_shipping_paid_by?, forward_shipping_cost?,
//     admin_notes?
//   }
//   POST { return_id, action: 'reject', admin_notes }
//   POST { return_id, action: 'confirm_received' }  // admin terima barang balik
//   POST { return_id, action: 'complete' }          // selesaikan return
//   POST { return_id, action: 'upload_forward_tracking', forward_tracking_number, forward_courier }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_IMAGES = 5;
const RETURN_WINDOW_DAYS = 7;
const VALID_REASONS = ["damaged", "missing_item", "wrong_item"];
const VALID_RESOLUTIONS = ["refund", "refund_return"];
const VALID_ADMIN_RESOLUTIONS = ["full_refund", "exchange", "partial_refund"];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Check admin role ──
    const { data: profile } = await supabase
      .from("profiles").select("role").eq("id", userId).maybeSingle();
    const isAdmin = profile && ["team_dev", "master", "admin"].includes(profile.role);

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN ACTIONS
    // ═══════════════════════════════════════════════════════════════════
    if (body.return_id && body.action && isAdmin) {
      const { return_id, action } = body;

      // Fetch return
      const { data: ret, error: fetchErr } = await supabase
        .from("order_returns").select("*").eq("id", return_id).maybeSingle();
      if (fetchErr || !ret) return json({ error: "Return tidak ditemukan" }, 404);

      // ── APPROVE ──
      if (action === "approve") {
        if (ret.status !== "pending") return json({ error: "Hanya status pending yang bisa di-approve" }, 400);

        const adminResolution = body.admin_resolution || "full_refund";
        if (!VALID_ADMIN_RESOLUTIONS.includes(adminResolution)) {
          return json({ error: "admin_resolution tidak valid" }, 400);
        }

        const updates: any = {
          status: adminResolution === "partial_refund" ? "approved" : "approved",
          admin_resolution: adminResolution,
          admin_user_id: userId,
          resolved_at: new Date().toISOString(),
        };

        if (body.refund_amount) updates.refund_amount = Number(body.refund_amount);
        if (body.partial_refund_amount) updates.partial_refund_amount = Number(body.partial_refund_amount);
        if (body.replacement_product_id) updates.replacement_product_id = body.replacement_product_id;
        if (body.replacement_variant_id) updates.replacement_variant_id = body.replacement_variant_id;
        if (body.replacement_product_name) updates.replacement_product_name = body.replacement_product_name;
        if (body.replacement_variant_name) updates.replacement_variant_name = body.replacement_variant_name;
        if (body.replacement_price) updates.replacement_price = Number(body.replacement_price);
        if (body.price_difference !== undefined) updates.price_difference = Number(body.price_difference);
        if (body.return_shipping_paid_by) updates.return_shipping_paid_by = body.return_shipping_paid_by;
        if (body.forward_shipping_cost) updates.forward_shipping_cost = Number(body.forward_shipping_cost);
        if (body.admin_notes) updates.admin_notes = body.admin_notes;

        const { error: updErr } = await supabase.from("order_returns").update(updates).eq("id", return_id);
        if (updErr) return json({ error: "Gagal approve", details: updErr.message }, 500);

        // Auto-complete for partial_refund (no shipping back needed)
        if (adminResolution === "partial_refund") {
          await supabase.from("order_returns").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
          }).eq("id", return_id);
          // Order stays 'completed' (customer keeps product)
          return json({
            success: true,
            message: "Partial refund disetujui & diselesaikan. Order tetap 'completed'. Transfer refund ke customer via bank.",
          });
        }

        // Auto-complete for exchange IF customer doesn't need to send back
        // (admin decide: if damaged and exchange, might skip return shipping)
        if (adminResolution === "exchange" && body.skip_return_shipping === true) {
          await supabase.from("order_returns").update({
            status: "completed",
          }).eq("id", return_id);
          return json({
            success: true,
            message: "Exchange disetujui. Customer tidak perlu kirim balik. Kirim barang pengganti ke customer.",
          });
        }

        return json({
          success: true,
          message: adminResolution === "exchange"
            ? "Exchange disetujui. Tunggu customer kirim balik barang, lalu kirim pengganti."
            : "Return disetujui. Tunggu customer kirim balik barang.",
        });
      }

      // ── REJECT ──
      if (action === "reject") {
        if (ret.status !== "pending") return json({ error: "Hanya status pending yang bisa di-reject" }, 400);
        const { error: updErr } = await supabase.from("order_returns").update({
          status: "rejected",
          admin_notes: body.admin_notes || "",
          admin_user_id: userId,
          resolved_at: new Date().toISOString(),
        }).eq("id", return_id);
        if (updErr) return json({ error: "Gagal reject" }, 500);
        return json({ success: true, message: "Return ditolak" });
      }

      // ── CONFIRM RECEIVED (admin terima barang balik) ──
      if (action === "confirm_received") {
        if (ret.status !== "shipping_back") return json({ error: "Hanya status shipping_back yang bisa confirm" }, 400);
        await supabase.from("order_returns").update({
          status: "received",
          admin_user_id: userId,
        }).eq("id", return_id);
        return json({ success: true, message: "Barang diterima. Siap untuk complete/exchange." });
      }

      // ── COMPLETE (selesaikan return) ──
      if (action === "complete") {
        if (!["received", "approved"].includes(ret.status)) {
          return json({ error: "Status harus received atau approved" }, 400);
        }

        const adminRes = ret.admin_resolution || "full_refund";

        await supabase.from("order_returns").update({
          status: "completed",
          resolved_at: new Date().toISOString(),
          admin_user_id: userId,
        }).eq("id", return_id);

        // Update order status based on resolution
        if (adminRes === "full_refund") {
          // Order → 'refund' (revenue berkurang)
          await supabase.from("orders").update({ status: "refund" }).eq("id", ret.order_id);
        }
        // exchange & partial_refund → order stays 'completed'

        return json({
          success: true,
          message: adminRes === "exchange"
            ? "Exchange selesai. Kirim barang pengganti ke customer."
            : adminRes === "partial_refund"
            ? "Partial refund selesai. Order tetap completed."
            : "Full refund selesai. Order status → refund.",
        });
      }

      // ── UPLOAD FORWARD TRACKING (resi kirim pengganti untuk exchange) ──
      if (action === "upload_forward_tracking") {
        if (ret.admin_resolution !== "exchange") {
          return json({ error: "Hanya untuk exchange" }, 400);
        }
        await supabase.from("order_returns").update({
          forward_tracking_number: body.forward_tracking_number,
          forward_courier: body.forward_courier || null,
        }).eq("id", return_id);
        return json({ success: true, message: "Resi pengganti diupload" });
      }

      return json({ error: "Unknown admin action: " + action }, 400);
    }

    // ═══════════════════════════════════════════════════════════════════
    // CUSTOMER ACTIONS
    // ═══════════════════════════════════════════════════════════════════

    // ── CANCEL ──
    if (body.return_id && body.action === "cancel") {
      const { data: ret } = await supabase
        .from("order_returns").select("user_id, status").eq("id", body.return_id).maybeSingle();
      if (!ret) return json({ error: "Return tidak ditemukan" }, 404);
      if (ret.user_id !== userId) return json({ error: "Akses ditolak" }, 403);
      if (ret.status !== "pending") return json({ error: "Hanya pending yang bisa dibatalkan" }, 400);
      await supabase.from("order_returns").update({
        status: "cancelled", resolved_at: new Date().toISOString()
      }).eq("id", body.return_id);
      return json({ success: true, message: "Return dibatalkan" });
    }

    // ── INSERT NEW RETURN REQUEST ──
    const { order_id, reason, resolution, description, images, video, phone } = body;

    if (!order_id) return json({ error: "order_id wajib diisi" }, 400);
    if (!reason || !VALID_REASONS.includes(reason)) return json({ error: "Alasan tidak valid" }, 400);
    if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) return json({ error: "Resolusi tidak valid" }, 400);
    if (!phone) return json({ error: "Nomor telepon wajib diisi" }, 400);

    // Verify order
    const { data: orderData } = await supabase
      .from("orders").select("id, status, customer_id, updated_at, total_amount")
      .eq("id", order_id).maybeSingle();
    if (!orderData) return json({ error: "Order tidak ditemukan" }, 404);

    const { data: customerData } = await supabase
      .from("customers").select("user_id").eq("id", orderData.customer_id).maybeSingle();
    if (!customerData || customerData.user_id !== userId) return json({ error: "Akses ditolak" }, 403);

    if (orderData.status !== "completed") return json({ error: "Order harus completed" }, 400);

    const daysSince = (Date.now() - new Date(orderData.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > RETURN_WINDOW_DAYS) return json({ error: "Batas waktu pengembalian habis" }, 400);

    // Check existing active return
    const { data: existing } = await supabase
      .from("order_returns").select("id").eq("order_id", order_id)
      .in("status", ["pending", "approved", "shipping_back", "received"]).maybeSingle();
    if (existing) return json({ error: "Sudah ada pengajuan pengembalian aktif" }, 400);

    // Insert
    const returnData: any = { order_id, user_id: userId, reason, resolution, phone: phone.trim(), status: "pending" };
    if (description) returnData.description = description.trim();
    if (images?.length > 0) returnData.images = images.slice(0, MAX_IMAGES);
    if (video) returnData.video = video;

    const { data: newReturn, error: insertErr } = await supabase
      .from("order_returns").insert(returnData)
      .select("id, status, reason, resolution, phone, video, created_at").single();
    if (insertErr) return json({ error: "Gagal menyimpan", details: insertErr.message }, 500);

    return json({ success: true, message: "Pengembalian berhasil diajukan", return_request: newReturn });
  } catch (e) {
    console.error("[submit-return-request] Error:", e);
    return json({ error: e.message }, 500);
  }
});