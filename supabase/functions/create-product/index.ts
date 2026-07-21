// supabase/functions/create-product/index.ts
// ============================================================================
// create-product — Admin: create new product + multiple variants
// ============================================================================
//
// ⭐ v3: Hapus base_price + weight_in_gram dari product (kolom udah di-drop).
//    Harga & berat ada di variant. Weight variant WAJIB diisi (gak ada fallback).
//
// Cara panggil:
//   POST /functions/v1/create-product
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: {
//     product: {
//       name, slug?, category,
//       badge?, description?, is_active
//     },
//     variants: [  // array, minimal 1
//       {
//         name, price, stock, weight_in_gram, sku?,
//         is_active, length_cm?, width_cm?, height_cm?
//       }
//     ]
//   }
//
// Response:
//   {
//     success: true,
//     product_id: "uuid",
//     slug: "auto-generated-slug",
//     variants: [{ id: "uuid", name: "..." }, ...]
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// Helpers
// ============================================================================
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ============================================================================
// Main
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── AUTH: Admin-only ──
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const body = await req.json();
    const { product, variants } = body;

    // ── Validate product ──
    if (!product || !product.name || !product.category) {
      return json({ error: "product.{name, category} are required" }, 400);
    }
    // ⭐ v3: Hapus validasi base_price + weight_in_gram (kolom udah di-drop)

    // ── Validate variants (array, minimal 1) ──
    if (!Array.isArray(variants) || variants.length === 0) {
      return json({ error: "variants array is required (minimal 1 variant)" }, 400);
    }

    if (variants.length > 50) {
      return json({ error: `Too many variants (${variants.length}). Maximum 50 per request.` }, 400);
    }

    // Validate each variant
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.name || !String(v.name).trim()) {
        return json({ error: `variants[${i}].name is required` }, 400);
      }
      const vPrice = Number(v.price);
      if (isNaN(vPrice) || vPrice < 0) {
        return json({ error: `variants[${i}].price must be >= 0` }, 400);
      }
      // ⭐ v3: Hapus cek price > base_price (gak ada base_price lagi)
      const vStock = parseInt(String(v.stock), 10);
      if (isNaN(vStock) || vStock < 0) {
        return json({ error: `variants[${i}].stock must be >= 0` }, 400);
      }
      // ⭐ v3: Weight variant WAJIB diisi (gak ada fallback dari product lagi)
      const vWeight = Number(v.weight_in_gram);
      if (v.is_active && (isNaN(vWeight) || vWeight <= 0)) {
        return json({
          error: `variants[${i}].weight_in_gram must be > 0 when is_active=true`,
        }, 400);
      }
    }

    // Generate slug kalau gak diisi
    let slug = product.slug?.trim() || slugify(product.name);
    if (!slug) {
      return json({ error: "Failed to generate slug from product name" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Cek slug uniqueness ──
    const { data: existing, error: checkErr } = await supabase
      .from("products")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle();
    if (checkErr) {
      return json({ error: `Failed to check slug uniqueness: ${checkErr.message}` }, 500);
    }
    if (existing) {
      // Auto-append suffix kalau slug sudah dipakai
      const suffix = "-" + Math.random().toString(36).slice(2, 6);
      slug = slug + suffix;
    }

    // ── INSERT product ──
    // ⭐ v3: Hapus base_price + weight_in_gram dari INSERT (kolom udah di-drop)
    const productId = crypto.randomUUID();
    const { error: prodInsertErr } = await supabase
      .from("products")
      .insert({
        id: productId,
        slug: slug,
        name: product.name.trim(),
        category: product.category.trim(),
        badge: product.badge?.trim() || null,
        description: product.description?.trim() || null,
        is_active: product.is_active !== undefined ? Boolean(product.is_active) : false,
      });

    if (prodInsertErr) {
      return json({ error: `Failed to insert product: ${prodInsertErr.message}` }, 500);
    }

    // ── INSERT all variants ──
    const variantRecords = [];
    const variantResults = [];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const variantId = crypto.randomUUID();
      const vPrice = Number(v.price);
      const vStock = parseInt(String(v.stock), 10);

      // ⭐ v3: Variant weight WAJIB diisi (gak ada fallback dari product lagi)
      const variantWeight = v.weight_in_gram ? Number(v.weight_in_gram) : null;

      // Variant is_active: kalau true, weight wajib > 0
      const variantIsActive = v.is_active !== undefined
        ? Boolean(v.is_active)
        : false;
      if (variantIsActive && (!variantWeight || variantWeight <= 0)) {
        // Cleanup: hapus product + variants yang sudah di-insert
        await supabase.from("product_variants").delete().eq("product_id", productId);
        await supabase.from("products").delete().eq("id", productId);
        return json({
          error: `variants[${i}].weight_in_gram must be > 0 when is_active=true`,
        }, 400);
      }

      // SKU: empty → null (avoid UNIQUE constraint issue)
      const variantSku = v.sku?.trim() || null;

      variantRecords.push({
        id: variantId,
        product_id: productId,
        name: v.name.trim(),
        price: vPrice,
        stock: vStock,
        weight_in_gram: variantWeight,
        sku: variantSku,
        is_active: variantIsActive,
        length_cm: v.length_cm ? Number(v.length_cm) : null,
        width_cm: v.width_cm ? Number(v.width_cm) : null,
        height_cm: v.height_cm ? Number(v.height_cm) : null,
      });

      variantResults.push({
        id: variantId,
        name: v.name.trim(),
        temp_index: i,
      });
    }

    // Bulk insert variants
    const { error: varInsertErr } = await supabase
      .from("product_variants")
      .insert(variantRecords);

    if (varInsertErr) {
      // Cleanup: hapus product yang baru di-insert
      await supabase.from("products").delete().eq("id", productId);
      return json({
        error: `Failed to insert variants: ${varInsertErr.message}`,
      }, 500);
    }

    // ── Success ──
    return json({
      success: true,
      product_id: productId,
      slug: slug,
      variants: variantResults,
      message: `Product created with ${variantResults.length} variant(s)`,
    });
  } catch (e) {
    console.error("[create-product]", e);
    return json({ error: e.message }, 500);
  }
});
