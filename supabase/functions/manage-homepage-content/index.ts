// supabase/functions/manage-homepage-content/index.ts
// ============================================================================
// manage-homepage-content — Admin CRUD untuk homepage banners + categories
// ============================================================================
//
// Auth: requireAdmin (team_dev / master / admin only)
//
// Actions:
//   GET  /functions/v1/manage-homepage-content
//     → Return semua banners + categories (untuk admin panel)
//
//   POST /functions/v1/manage-homepage-content
//     Body: { action: "create_banner" | "update_banner" | "delete_banner" |
//                    "create_category" | "update_category" | "delete_category" |
//                    "reorder_banners" | "reorder_categories",
//            ...fields }
//
// Frontend (public, no auth) pakai direct Supabase query (RLS allow anon SELECT)
// Edge function ini hanya untuk admin mutations.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── GET: fetch semua content ──
    if (req.method === "GET") {
      const [bannersRes, categoriesRes] = await Promise.all([
        supabase.from("homepage_banners").select("*").order("position", { ascending: true }),
        supabase.from("homepage_categories").select("*").order("position", { ascending: true }),
      ]);

      return json({
        success: true,
        banners: bannersRes.data || [],
        categories: categoriesRes.data || [],
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    // ── POST: mutations ──
    const body = await req.json();
    const { action } = body;

    switch (action) {

      // ── BANNER CRUD ──
      case "create_banner": {
        const { image_url, image_mobile, title, subtitle, cta_text, cta_link_type, cta_link_value, is_active } = body;
        if (!image_url) return json({ error: "image_url is required" }, 400);

        // Get next position
        const { data: lastBanner } = await supabase
          .from("homepage_banners")
          .select("position")
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = (lastBanner?.position ?? -1) + 1;

        const { data, error } = await supabase
          .from("homepage_banners")
          .insert({
            position: nextPos,
            image_url,
            image_mobile: image_mobile || null,
            title: title || null,
            subtitle: subtitle || null,
            cta_text: cta_text || null,
            cta_link_type: cta_link_type || "none",
            cta_link_value: cta_link_value || null,
            is_active: is_active !== false,
          })
          .select()
          .single();

        if (error) return json({ error: "Failed to create banner", details: error.message }, 500);
        return json({ success: true, banner: data });
      }

      case "update_banner": {
        const { id, ...fields } = body;
        if (!id) return json({ error: "id is required" }, 400);

        const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowedFields = ["image_url", "image_mobile", "title", "subtitle", "cta_text", "cta_link_type", "cta_link_value", "is_active", "position"];
        for (const f of allowedFields) {
          if (fields[f] !== undefined) updateFields[f] = fields[f];
        }

        const { data, error } = await supabase
          .from("homepage_banners")
          .update(updateFields)
          .eq("id", id)
          .select()
          .single();

        if (error) return json({ error: "Failed to update banner", details: error.message }, 500);
        return json({ success: true, banner: data });
      }

      case "delete_banner": {
        const { id } = body;
        if (!id) return json({ error: "id is required" }, 400);

        const { error } = await supabase.from("homepage_banners").delete().eq("id", id);
        if (error) return json({ error: "Failed to delete banner", details: error.message }, 500);
        return json({ success: true, deleted: id });
      }

      // ── CATEGORY CRUD ──
      case "create_category": {
        const { name, image_url, filter_value, is_active } = body;
        if (!name || !image_url || !filter_value) {
          return json({ error: "name, image_url, filter_value are required" }, 400);
        }

        const { data: lastCat } = await supabase
          .from("homepage_categories")
          .select("position")
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextPos = (lastCat?.position ?? -1) + 1;

        const { data, error } = await supabase
          .from("homepage_categories")
          .insert({
            position: nextPos,
            name,
            image_url,
            filter_value,
            is_active: is_active !== false,
          })
          .select()
          .single();

        if (error) return json({ error: "Failed to create category", details: error.message }, 500);
        return json({ success: true, category: data });
      }

      case "update_category": {
        const { id, ...fields } = body;
        if (!id) return json({ error: "id is required" }, 400);

        const updateFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowedFields = ["name", "image_url", "filter_value", "is_active", "position"];
        for (const f of allowedFields) {
          if (fields[f] !== undefined) updateFields[f] = fields[f];
        }

        const { data, error } = await supabase
          .from("homepage_categories")
          .update(updateFields)
          .eq("id", id)
          .select()
          .single();

        if (error) return json({ error: "Failed to update category", details: error.message }, 500);
        return json({ success: true, category: data });
      }

      case "delete_category": {
        const { id } = body;
        if (!id) return json({ error: "id is required" }, 400);

        const { error } = await supabase.from("homepage_categories").delete().eq("id", id);
        if (error) return json({ error: "Failed to delete category", details: error.message }, 500);
        return json({ success: true, deleted: id });
      }

      // ── REORDER ──
      case "reorder_banners": {
        const { items } = body; // [{ id, position }, ...]
        if (!Array.isArray(items)) return json({ error: "items array required" }, 400);

        for (const item of items) {
          await supabase.from("homepage_banners").update({ position: item.position }).eq("id", item.id);
        }
        return json({ success: true, reordered: items.length });
      }

      case "reorder_categories": {
        const { items } = body;
        if (!Array.isArray(items)) return json({ error: "items array required" }, 400);

        for (const item of items) {
          await supabase.from("homepage_categories").update({ position: item.position }).eq("id", item.id);
        }
        return json({ success: true, reordered: items.length });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[manage-homepage-content]", e);
    return json({ error: e.message }, 500);
  }
});
