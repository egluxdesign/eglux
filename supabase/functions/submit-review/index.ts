// supabase/functions/submit-review/index.ts
// ============================================================================
// submit-review — Customer submit review untuk produk yang sudah dibeli
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/submit-review
//   Headers: Authorization: Bearer <jwt>
//   Body: {
//     product_id: UUID,
//     order_id: UUID,
//     rating: number (1-5),
//     title?: string,
//     comment?: string,
//     images?: string[]  // array of public URLs (max 5)
//   }
//
// Flow:
//   1. Verify JWT + ambil user.id
//   2. Verify user benar-benar beli produk ini di order ini (cek order_items)
//   3. Verify order status = 'delivered' atau 'completed' (harus sudah sampai)
//   4. Cek apakah user sudah pernah review produk ini untuk order ini (1 review per product per order)
//   5. Insert review (is_verified = true otomatis karena verified purchase)
//   6. Return success
//
// Security:
//   - User hanya bisa review produk yang dia beli
//   - Order harus status delivered/completed
//   - 1 review per (user, product, order)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_IMAGES = 5;
const MAX_COMMENT_LENGTH = 1000;
const MAX_TITLE_LENGTH = 200;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    const body = await req.json().catch(() => ({}));
    const { product_id, order_id, rating, title, comment, images } = body;

    // ── Validate inputs ──
    if (!product_id || !order_id) {
      return json({ error: "product_id dan order_id wajib diisi" }, 400);
    }
    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return json({ error: "Rating harus antara 1-5" }, 400);
    }
    if (title && typeof title === "string" && title.length > MAX_TITLE_LENGTH) {
      return json({ error: `Title maksimal ${MAX_TITLE_LENGTH} karakter` }, 400);
    }
    if (comment && typeof comment === "string" && comment.length > MAX_COMMENT_LENGTH) {
      return json({ error: `Komentar maksimal ${MAX_COMMENT_LENGTH} karakter` }, 400);
    }
    if (images && Array.isArray(images) && images.length > MAX_IMAGES) {
      return json({ error: `Maksimal ${MAX_IMAGES} gambar` }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Verify user benar-benar beli produk ini di order ini ──
    const { data: orderItem, error: orderItemErr } = await supabase
      .from("order_items")
      .select("id, order_id")
      .eq("order_id", order_id)
      .eq("product_id", product_id)
      .maybeSingle();

    if (orderItemErr || !orderItem) {
      return json({ error: "Produk ini tidak ada di order tersebut" }, 400);
    }

    // ── 2. Verify order milik user ini ──
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .select("id, status, customer_id")
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr || !orderData) {
      return json({ error: "Order tidak ditemukan" }, 404);
    }

    // Cek customer_id link ke user_id
    const { data: customerData } = await supabase
      .from("customers")
      .select("user_id")
      .eq("id", orderData.customer_id)
      .maybeSingle();

    if (!customerData || customerData.user_id !== userId) {
      return json({ error: "Anda tidak punya akses ke order ini" }, 403);
    }

    // ── 3. Verify order status delivered/completed ──
    if (!["delivered", "completed"].includes(orderData.status)) {
      return json({
        error: `Order harus sudah sampai (delivered) untuk direview. Status saat ini: ${orderData.status}`,
      }, 400);
    }

    // ── 4. Cek apakah sudah pernah review ──
    const { data: existingReview } = await supabase
      .from("product_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", product_id)
      .eq("order_id", order_id)
      .maybeSingle();

    if (existingReview) {
      return json({ error: "Anda sudah pernah review produk ini untuk order ini" }, 400);
    }

    // ── 5. Insert review ──
    const reviewData: any = {
      product_id,
      user_id: userId,
      order_id,
      rating: Math.round(rating),
      is_verified: true, // otomatis verified karena cek order
      is_published: true, // auto-publish (admin bisa unpublish kalau spam)
    };
    if (title && typeof title === "string") reviewData.title = title.trim();
    if (comment && typeof comment === "string") reviewData.comment = comment.trim();
    if (images && Array.isArray(images) && images.length > 0) {
      reviewData.images = images.slice(0, MAX_IMAGES);
    }

    const { data: newReview, error: insertErr } = await supabase
      .from("product_reviews")
      .insert(reviewData)
      .select("id, rating, title, comment, is_verified, is_published, created_at")
      .single();

    if (insertErr) {
      console.error("[submit-review] Insert error:", insertErr);
      return json({ error: "Gagal menyimpan review", details: insertErr.message }, 500);
    }

    // ── 6. Log activity (jika admin) ──
    try {
      await supabase.rpc("log_admin_activity", {
        p_action: "review_submit",
        p_page: `/products/${product_id}`,
        p_description: `Submit review ${rating}★ untuk produk ${product_id.slice(0, 8)}`,
        p_metadata: { product_id, order_id, rating },
      });
    } catch {}

    console.log(`[submit-review] ✓ Review submitted by user ${userId} for product ${product_id}`);
    return json({
      success: true,
      message: "Review berhasil dikirim. Terima kasih!",
      review: newReview,
    });
  } catch (e) {
    console.error("[submit-review] Error:", e);
    return json({ error: e.message }, 500);
  }
});
