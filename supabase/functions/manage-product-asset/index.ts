// supabase/functions/manage-product-asset/index.ts
// ============================================================================
// Manage product assets: set primary, delete photo, add variant, delete variant
// (bypass RLS untuk admin operations)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── AUTH: Admin-only (team_dev / master / admin) ──
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ===== SET PRIMARY PHOTO =====
    if (action === "set_primary") {
      const { image_id, product_id } = body;
      if (!image_id || !product_id) return json({ error: "image_id + product_id required" }, 400);

      await supabase.from("product_images").update({ is_primary: false }).eq("product_id", product_id);
      const { error } = await supabase.from("product_images").update({ is_primary: true }).eq("id", image_id);
      if (error) throw error;
      return json({ success: true, message: "Primary photo updated" });
    }

    // ===== DELETE PHOTO =====
    if (action === "delete_photo") {
      const { image_id, image_url } = body;
      if (!image_id) return json({ error: "image_id required" }, 400);

      // Delete from Storage
      if (image_url) {
        try {
          const urlObj = new URL(image_url);
          const pathMatch = urlObj.pathname.match(/\/product-images\/(.+)/);
          if (pathMatch) {
            await supabase.storage.from("product-images").remove([pathMatch[1]]);
          }
        } catch {}
      }

      // Delete from DB
      const { error } = await supabase.from("product_images").delete().eq("id", image_id);
      if (error) throw error;
      return json({ success: true, message: "Photo deleted" });
    }

    // ===== ADD VARIANT =====
    if (action === "add_variant") {
      const { product_id, name, price, stock, weight_in_gram, sku, is_active, length_cm, width_cm, height_cm } = body;
      if (!product_id || !name) return json({ error: "product_id + name required" }, 400);

      const { data, error } = await supabase
        .from("product_variants")
        .insert({
          product_id,
          name,
          attributes: {},
          price: Number(price) || 0,
          stock: stock !== undefined ? parseInt(stock, 10) : 0,
          sku: sku || `EGL-NEW-${Date.now().toString().slice(-6)}`,
          is_active: is_active ?? false,
          weight_in_gram: weight_in_gram ? parseInt(weight_in_gram, 10) : null,
          length_cm: length_cm ? parseFloat(length_cm) : null,
          width_cm: width_cm ? parseFloat(width_cm) : null,
          height_cm: height_cm ? parseFloat(height_cm) : null,
        })
        .select("id, name, price, stock, sku, is_active, weight_in_gram")
        .single();

      if (error) throw error;
      return json({ success: true, variant: data, message: `Variant "${name}" ditambahkan` });
    }

    // ===== DELETE VARIANT =====
    if (action === "delete_variant") {
      const { variant_id } = body;
      if (!variant_id) return json({ error: "variant_id required" }, 400);

      const { error } = await supabase.from("product_variants").delete().eq("id", variant_id);
      if (error) throw error;
      return json({ success: true, message: "Variant deleted" });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error("[manage-product-asset]", e);
    return json({ error: e.message }, 500);
  }
});
