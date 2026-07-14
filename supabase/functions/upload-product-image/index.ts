// supabase/functions/upload-product-image/index.ts
// ============================================================================
// Upload product/variant image ke Supabase Storage (server-side, bypass RLS)
// ============================================================================
// Cara panggil:
//   POST /functions/v1/upload-product-image
//   Content-Type: multipart/form-data
//   Form fields:
//     - file: image file (required)
//     - product_id: UUID (required)
//     - variant_id: UUID (optional, kalau upload foto variant)
//     - is_primary: "true" | "false" (default: false, atau true kalau first image)
//
// Response:
//   { success: true, url: "https://...", image_id: "uuid", is_primary: true }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

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
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const productId = formData.get("product_id") as string;
    const variantId = formData.get("variant_id") as string || null;
    const isPrimary = formData.get("is_primary") === "true";

    if (!file) return json({ error: "file is required" }, 400);
    if (!productId) return json({ error: "product_id is required" }, 400);

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return json({ error: `Invalid file type: ${file.type}. Allowed: ${allowedTypes.join(", ")}` }, 400);
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return json({ error: "File too large. Maximum 5MB." }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if product already has images (for auto-primary)
    let shouldPrimary = isPrimary;
    if (!shouldPrimary) {
      const { count } = await supabase
        .from("product_images")
        .select("id", { count: "exact", head: true })
        .eq("product_id", productId)
        .eq("variant_id", variantId);
      
      if (count === 0) shouldPrimary = true;
    }

    // If this should be primary, unset other primaries for this product+variant combo
    if (shouldPrimary) {
      if (variantId) {
        // Unset primary for this variant's images only
        await supabase
          .from("product_images")
          .update({ is_primary: false })
          .eq("product_id", productId)
          .eq("variant_id", variantId);
      } else {
        // Unset primary for product-level images
        await supabase
          .from("product_images")
          .update({ is_primary: false })
          .eq("product_id", productId)
          .is("variant_id", null);
      }
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const folder = variantId ? `variants/${variantId}` : productId;
    const filename = `products/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Storage
    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(filename, uint8Array, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("[upload-product-image] Storage error:", uploadError);
      return json({ error: `Upload gagal: ${uploadError.message}` }, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(filename);

    const publicUrl = urlData.publicUrl;

    // Insert ke product_images table
    const { data: imgData, error: dbError } = await supabase
      .from("product_images")
      .insert({
        product_id: productId,
        url: publicUrl,
        position: 0,
        is_primary: shouldPrimary,
        variant_id: variantId,
      })
      .select("id, url, is_primary, variant_id")
      .single();

    if (dbError) {
      console.error("[upload-product-image] DB error:", dbError);
      return json({ error: `DB insert gagal: ${dbError.message}` }, 500);
    }

    console.log(`[upload-product-image] ✓ Uploaded: ${filename}, primary=${shouldPrimary}, variant=${variantId || "null"}`);

    return json({
      success: true,
      image_id: imgData.id,
      url: publicUrl,
      is_primary: shouldPrimary,
      variant_id: variantId,
    });
  } catch (e) {
    console.error("[upload-product-image]", e);
    return json({ error: e.message }, 500);
  }
});
