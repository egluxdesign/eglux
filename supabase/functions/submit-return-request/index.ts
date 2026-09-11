// supabase/functions/submit-return-request/index.ts
// ============================================================================
// submit-return-request v2 — Customer submit return/refund request
// ============================================================================
//
// Changes v2:
//   - Simplified reasons: 'damaged' | 'missing_item' | 'wrong_item'
//   - Simplified resolutions: 'refund' | 'refund_return'
//   - Added phone field (customer phone for admin contact)
//   - Added video field (single video URL)
//   - Prevent duplicate: 1 active return per order (unique index already exists)
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (body.return_id && body.action) {
      const { return_id, action } = body;
      const { data: existing } = await supabase.from("order_returns").select("id, user_id, status").eq("id", return_id).maybeSingle();
      if (!existing) return json({ error: "Return request tidak ditemukan" }, 404);
      if (existing.user_id !== userId) return json({ error: "Anda tidak punya akses" }, 403);
      if (action === "cancel") {
        if (existing.status !== "pending") return json({ error: "Hanya request pending yang bisa dibatalkan" }, 400);
        await supabase.from("order_returns").update({ status: "cancelled", resolved_at: new Date().toISOString() }).eq("id", return_id);
        return json({ success: true, message: "Return request dibatalkan" });
      }
      return json({ error: "Unknown action" }, 400);
    }

    const { order_id, reason, resolution, description, images, video, phone } = body;
    if (!order_id) return json({ error: "order_id wajib diisi" }, 400);
    if (!reason || !VALID_REASONS.includes(reason)) return json({ error: "Alasan tidak valid" }, 400);
    if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) return json({ error: "Resolusi tidak valid" }, 400);
    if (!phone) return json({ error: "Nomor telepon wajib diisi" }, 400);

    const { data: orderData } = await supabase.from("orders").select("id, status, customer_id, updated_at").eq("id", order_id).maybeSingle();
    if (!orderData) return json({ error: "Order tidak ditemukan" }, 404);
    const { data: customerData } = await supabase.from("customers").select("user_id, phone").eq("id", orderData.customer_id).maybeSingle();
    if (!customerData || customerData.user_id !== userId) return json({ error: "Anda tidak punya akses" }, 403);
    if (orderData.status !== "completed") return json({ error: "Order harus completed" }, 400);

    const daysSince = (Date.now() - new Date(orderData.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > RETURN_WINDOW_DAYS) return json({ error: "Batas waktu pengembalian habis" }, 400);

    const { data: existingReturn } = await supabase.from("order_returns").select("id, status").eq("order_id", order_id).in("status", ["pending", "approved", "shipping_back"]).maybeSingle();
    if (existingReturn) return json({ error: "Sudah ada pengajuan pengembalian aktif" }, 400);

    const returnData: any = { order_id, user_id: userId, reason, resolution, phone: phone.trim(), status: "pending" };
    if (description) returnData.description = description.trim();
    if (images && images.length > 0) returnData.images = images.slice(0, MAX_IMAGES);
    if (video) returnData.video = video;

    const { data: newReturn, error: insertErr } = await supabase.from("order_returns").insert(returnData).select("id, status, reason, resolution, phone, video, created_at").single();
    if (insertErr) return json({ error: "Gagal menyimpan", details: insertErr.message }, 500);

    console.log(`[submit-return-request] ✓ Return submitted by ${userId.slice(0,8)} phone=${phone} video=${video ? 'yes' : 'no'}`);
    return json({ success: true, message: "Pengembalian berhasil diajukan", return_request: newReturn });
  } catch (e) {
    console.error("[submit-return-request] Error:", e);
    return json({ error: e.message }, 500);
  }
});