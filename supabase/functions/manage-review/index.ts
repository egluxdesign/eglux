// supabase/functions/manage-review/index.ts
// ============================================================================
// manage-review — Admin moderation untuk product reviews
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/manage-review
//   Headers: Authorization: Bearer <jwt> (admin only)
//   Body: {
//     action: "list" | "publish" | "unpublish" | "reply" | "delete" | "stats",
//     review_id?: UUID,        // untuk publish/unpublish/reply/delete
//     reply?: string,          // untuk action="reply"
//     page?: number,           // untuk action="list" (default 1)
//     limit?: number,          // untuk action="list" (default 20)
//     filter?: { product_id?, rating?, is_published? }  // optional filter
//   }
//
// Actions:
//   1. list    — Get paginated reviews (with filter)
//   2. stats   — Get review statistics (total, avg rating, distribution)
//   3. publish — Set is_published = true
//   4. unpublish — Set is_published = false (hide from public)
//   5. reply   — Set admin_reply text
//   6. delete  — Hard delete review
//
// Auth: team_dev + master + admin (all admin roles)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_REPLY_LENGTH = 500;
const DEFAULT_LIMIT = 20;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;
    const adminUser = authResult.user!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {

      // ── LIST REVIEWS ──
      case "list": {
        const page = Math.max(1, body.page || 1);
        const limit = Math.min(100, body.limit || DEFAULT_LIMIT);
        const offset = (page - 1) * limit;
        const filter = body.filter || {};

        let query = supabase
          .from("product_reviews")
          .select(`
            id, product_id, user_id, order_id, rating, title, comment, images,
            is_verified, is_published, admin_reply, created_at, updated_at,
            product:products(name, slug),
            user:profiles!user_id(full_name, email)
          `, { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (filter.product_id) query = query.eq("product_id", filter.product_id);
        if (filter.rating) query = query.eq("rating", filter.rating);
        if (filter.is_published !== undefined) query = query.eq("is_published", filter.is_published);

        const { data, error, count } = await query;

        if (error) return json({ error: error.message }, 500);

        return json({
          success: true,
          reviews: data || [],
          total: count || 0,
          page,
          limit,
          total_pages: Math.ceil((count || 0) / limit),
        });
      }

      // ── STATS ──
      case "stats": {
        const { data: allReviews, error } = await supabase
          .from("product_reviews")
          .select("rating, is_published");

        if (error) return json({ error: error.message }, 500);

        const reviews = allReviews || [];
        const total = reviews.length;
        const published = reviews.filter(r => r.is_published);
        const totalRating = published.reduce((s, r) => s + r.rating, 0);
        const avgRating = published.length > 0 ? totalRating / published.length : 0;

        const distribution = {
          5: published.filter(r => r.rating === 5).length,
          4: published.filter(r => r.rating === 4).length,
          3: published.filter(r => r.rating === 3).length,
          2: published.filter(r => r.rating === 2).length,
          1: published.filter(r => r.rating === 1).length,
        };

        return json({
          success: true,
          stats: {
            total_reviews: total,
            published_reviews: published.length,
            unpublished_reviews: total - published.length,
            average_rating: Math.round(avgRating * 10) / 10,
            distribution,
          },
        });
      }

      // ── PUBLISH ──
      case "publish": {
        const { review_id } = body;
        if (!review_id) return json({ error: "review_id wajib diisi" }, 400);

        const { error } = await supabase
          .from("product_reviews")
          .update({ is_published: true, updated_at: new Date().toISOString() })
          .eq("id", review_id);

        if (error) return json({ error: "Gagal publish review" }, 500);

        // Log activity
        try {
          await supabase.rpc("log_admin_activity", {
            p_action: "review_publish",
            p_page: "/reviews-admin",
            p_description: `Publish review ${review_id.slice(0, 8)}`,
            p_metadata: { review_id },
          });
        } catch {}

        return json({ success: true, message: "Review di-publish" });
      }

      // ── UNPUBLISH ──
      case "unpublish": {
        const { review_id } = body;
        if (!review_id) return json({ error: "review_id wajib diisi" }, 400);

        const { error } = await supabase
          .from("product_reviews")
          .update({ is_published: false, updated_at: new Date().toISOString() })
          .eq("id", review_id);

        if (error) return json({ error: "Gagal unpublish review" }, 500);

        try {
          await supabase.rpc("log_admin_activity", {
            p_action: "review_unpublish",
            p_page: "/reviews-admin",
            p_description: `Unpublish review ${review_id.slice(0, 8)}`,
            p_metadata: { review_id },
          });
        } catch {}

        return json({ success: true, message: "Review di-unpublish (disembunyikan dari publik)" });
      }

      // ── REPLY ──
      case "reply": {
        const { review_id, reply } = body;
        if (!review_id) return json({ error: "review_id wajib diisi" }, 400);
        if (!reply || typeof reply !== "string") return json({ error: "reply wajib diisi" }, 400);
        if (reply.length > MAX_REPLY_LENGTH) {
          return json({ error: `Reply maksimal ${MAX_REPLY_LENGTH} karakter` }, 400);
        }

        const { error } = await supabase
          .from("product_reviews")
          .update({ admin_reply: reply.trim(), updated_at: new Date().toISOString() })
          .eq("id", review_id);

        if (error) return json({ error: "Gagal menyimpan reply" }, 500);

        try {
          await supabase.rpc("log_admin_activity", {
            p_action: "review_reply",
            p_page: "/reviews-admin",
            p_description: `Reply review ${review_id.slice(0, 8)}`,
            p_metadata: { review_id, reply_length: reply.length },
          });
        } catch {}

        return json({ success: true, message: "Reply tersimpan" });
      }

      // ── DELETE ──
      case "delete": {
        const { review_id } = body;
        if (!review_id) return json({ error: "review_id wajib diisi" }, 400);

        const { error } = await supabase
          .from("product_reviews")
          .delete()
          .eq("id", review_id);

        if (error) return json({ error: "Gagal hapus review" }, 500);

        try {
          await supabase.rpc("log_admin_activity", {
            p_action: "review_delete",
            p_page: "/reviews-admin",
            p_description: `Hapus review ${review_id.slice(0, 8)}`,
            p_metadata: { review_id },
          });
        } catch {}

        return json({ success: true, message: "Review dihapus permanen" });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[manage-review] Error:", e);
    return json({ error: e.message }, 500);
  }
});
