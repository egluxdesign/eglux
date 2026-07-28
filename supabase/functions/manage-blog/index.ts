// supabase/functions/manage-blog/index.ts
// ============================================================================
// manage-blog — CRUD untuk blog posts
// ============================================================================
//
// Actions:
//   POST { action: "create", title, content, ... }       → create new post
//   POST { action: "list" }                               → list all posts (admin)
//   POST { action: "update", post_id, ...fields }        → update post
//   POST { action: "delete", post_id }                    → delete post
//   POST { action: "toggle_publish", post_id, is_published } → toggle publish
//
// Auth: requireAdmin
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Slug generator: "Judul Artikel Keren" → "judul-artikel-keren" ──
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userId = authResult.user?.id;

    // ── CREATE ──
    if (action === "create") {
      const { title, excerpt, content, cover_image_url, category, tags, author_name, is_published } = body;
      if (!title || !content) return json({ error: "title dan content wajib diisi" }, 400);

      const slug = generateSlug(title);

      const { data, error } = await supabase.from("blog_posts").insert({
        title: title.trim(),
        slug,
        excerpt: excerpt?.trim() || null,
        content: content,
        cover_image_url: cover_image_url?.trim() || null,
        category: category?.trim() || "Umum",
        tags: tags || [],
        author_name: author_name?.trim() || "EGLUX",
        is_published: is_published || false,
        published_at: is_published ? new Date().toISOString() : null,
        created_by: userId,
      }).select().single();

      if (error) {
        // Handle duplicate slug
        if (error.code === "23505") {
          // Append random suffix
          const { data: retryData, error: retryErr } = await supabase.from("blog_posts").insert({
            title: title.trim(),
            slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
            excerpt: excerpt?.trim() || null,
            content,
            cover_image_url: cover_image_url?.trim() || null,
            category: category?.trim() || "Umum",
            tags: tags || [],
            author_name: author_name?.trim() || "EGLUX",
            is_published: is_published || false,
            published_at: is_published ? new Date().toISOString() : null,
            created_by: userId,
          }).select().single();
          if (retryErr) return json({ error: retryErr.message }, 500);
          return json({ success: true, post: retryData });
        }
        return json({ error: error.message }, 500);
      }

      return json({ success: true, post: data });
    }

    // ── LIST (all posts — admin) ──
    if (action === "list") {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, posts: data || [] });
    }

    // ── UPDATE ──
    if (action === "update") {
      const { post_id, ...fields } = body;
      if (!post_id) return json({ error: "post_id wajib diisi" }, 400);

      const updateFields: any = { updated_at: new Date().toISOString() };
      if (fields.title !== undefined) { updateFields.title = fields.title.trim(); updateFields.slug = generateSlug(fields.title); }
      if (fields.excerpt !== undefined) updateFields.excerpt = fields.excerpt?.trim() || null;
      if (fields.content !== undefined) updateFields.content = fields.content;
      if (fields.cover_image_url !== undefined) updateFields.cover_image_url = fields.cover_image_url?.trim() || null;
      if (fields.category !== undefined) updateFields.category = fields.category?.trim() || "Umum";
      if (fields.tags !== undefined) updateFields.tags = fields.tags || [];
      if (fields.author_name !== undefined) updateFields.author_name = fields.author_name?.trim() || "EGLUX";

      const { data, error } = await supabase
        .from("blog_posts")
        .update(updateFields)
        .eq("id", post_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, post: data });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { post_id } = body;
      if (!post_id) return json({ error: "post_id wajib diisi" }, 400);
      const { error } = await supabase.from("blog_posts").delete().eq("id", post_id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ── TOGGLE PUBLISH ──
    if (action === "toggle_publish") {
      const { post_id, is_published } = body;
      if (!post_id) return json({ error: "post_id wajib diisi" }, 400);

      const { data, error } = await supabase
        .from("blog_posts")
        .update({
          is_published,
          published_at: is_published ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post_id)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ success: true, post: data });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    console.error("[manage-blog]", e);
    return json({ error: e.message }, 500);
  }
});
