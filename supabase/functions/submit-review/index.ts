// supabase/functions/submit-review/index.ts
// ============================================================================
// submit-review — Customer submit / edit review untuk produk yang sudah dibeli
// ============================================================================
//
// Cara panggil (INSERT baru):
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
// Cara panggil (EDIT existing review):
//   POST /functions/v1/submit-review
//   Headers: Authorization: Bearer <jwt>
//   Body: {
//     review_id: UUID,  // ⭐ ID review yang mau di-edit
//     product_id: UUID,  // ⭐ tetap required (untuk verification)
//     order_id: UUID,   // ⭐ tetap required (untuk verification)
//     rating: number (1-5),
//     title?: string,
//     comment?: string,
//     images?: string[]
//   }
//
// Flow INSERT (review_id not provided):
//   1. Verify JWT + ambil user.id
//   2. Verify user beli produk ini di order ini (cek order_items)
//   3. Verify order status = 'delivered' atau 'completed'
//   4. Cek apakah user sudah pernah review (unique constraint)
//   5. Insert review (is_verified=true, is_published=true)
//   6. ⭐ Trigger DB auto-award +5 poin via SQL trigger (SQL 072)
//      — edge function gak perlu handle poin award manual
//   7. Return success
//
// Flow EDIT (review_id provided):
//   1. Verify JWT + ambil user.id
//   2. Fetch existing review, verify user_id matches (RLS check)
//   3. Verify user beli produk ini di order ini (defensive)
//   4. UPDATE review fields (rating, title, comment, images)
//   5. ⭐ NO poin award (cuma INSERT baru yang dapet bonus)
//   6. Return success
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
    const {
      review_id,           // ⭐ NEW: kalau provided → edit mode; kalau absent → insert baru
      product_id,
      order_id,
      rating,
      title,
      comment,
      images,
    } = body;

    // ── Validate inputs (shared by insert + edit) ──
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

    // ─────────────────────────────────────────────────────────────────────
    // ⭐ BRANCH: EDIT MODE (review_id provided)
    // ─────────────────────────────────────────────────────────────────────
    if (review_id) {
      // Fetch existing review
      const { data: existingReview, error: fetchErr } = await supabase
        .from("product_reviews")
        .select("id, user_id, product_id, order_id")
        .eq("id", review_id)
        .maybeSingle();

      if (fetchErr || !existingReview) {
        return json({ error: "Review tidak ditemukan" }, 404);
      }

      // Verify ownership: only review owner can edit
      if (existingReview.user_id !== userId) {
        return json({ error: "Anda tidak punya akses untuk edit review ini" }, 403);
      }

      // Verify review belongs to the claimed product + order (defensive)
      if (existingReview.product_id !== product_id || existingReview.order_id !== order_id) {
        return json({ error: "Review tidak match dengan product/order yang diberikan" }, 400);
      }

      // Build update payload (only update mutable fields)
      const updateData: Record<string, unknown> = {
        rating: Math.round(rating),
        updated_at: new Date().toISOString(),
      };
      if (title !== undefined) updateData.title = typeof title === "string" ? title.trim() : null;
      if (comment !== undefined) updateData.comment = typeof comment === "string" ? comment.trim() : null;
      if (images !== undefined && Array.isArray(images)) {
        updateData.images = images.slice(0, MAX_IMAGES);
      }

      const { data: updatedReview, error: updateErr } = await supabase
        .from("product_reviews")
        .update(updateData)
        .eq("id", review_id)
        .select("id, rating, title, comment, images, is_verified, is_published, created_at, updated_at")
        .single();

      if (updateErr) {
        console.error("[submit-review] Edit update error:", updateErr);
        return json({ error: "Gagal update review", details: updateErr.message }, 500);
      }

      console.log(`[submit-review] ✓ Review ${review_id} edited by user ${userId} (NO points awarded — edit mode)`);
      return json({
        success: true,
        message: "Review berhasil diupdate",
        review: updatedReview,
        is_edit: true,
        points_awarded: 0,  // ⭐ explicit: edit gak dapet poin
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ⭐ BRANCH: INSERT MODE (review_id not provided) — original flow
    // ─────────────────────────────────────────────────────────────────────
    // 4. Cek apakah sudah pernah review ──
    const { data: existingReview } = await supabase
      .from("product_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", product_id)
      .eq("order_id", order_id)
      .maybeSingle();

    if (existingReview) {
      return json({
        error: "Anda sudah pernah review produk ini untuk order ini. Gunakan mode edit untuk update review.",
        existing_review_id: existingReview.id,
      }, 400);
    }

    // 5. Insert review ──
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
      .select("id, rating, title, comment, images, is_verified, is_published, created_at")
      .single();

    if (insertErr) {
      console.error("[submit-review] Insert error:", insertErr);
      return json({ error: "Gagal menyimpan review", details: insertErr.message }, 500);
    }

    // ⭐ 6. Auto-award +5 poin via SQL trigger (SQL 072)
    //    Trigger fires AFTER INSERT on product_reviews → call add_points RPC
    //    Edge function gak perlu handle poin award manual (lebih robust:
    //    trigger fires even kalau insert via SQL editor atau direct DB)
    console.log(`[submit-review] ✓ Review inserted (id: ${newReview.id}) — SQL trigger will award +5 points to user ${userId}`);

    // ── 7. Log activity (jika admin) ──
    try {
      await supabase.rpc("log_admin_activity", {
        p_action: "review_submit",
        p_page: `/products/${product_id}`,
        p_description: `Submit review ${rating}★ untuk produk ${product_id.slice(0, 8)}`,
        p_metadata: { product_id, order_id, rating, review_id: newReview.id },
      });
    } catch {}

    console.log(`[submit-review] ✓ Review submitted by user ${userId} for product ${product_id}`);
    return json({
      success: true,
      message: "Review berhasil dikirim. +5 poin bonus telah ditambahkan ke akun Anda!",
      review: newReview,
      is_edit: false,
      points_awarded: 5,  // ⭐ info for frontend (actual award via trigger)
    });
  } catch (e) {
    console.error("[submit-review] Error:", e);
    return json({ error: e.message }, 500);
  }
});