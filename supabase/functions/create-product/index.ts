// supabase/functions/create-product/index.ts
// ============================================================================
// create-product — Admin: create new product + optional initial variant
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/create-product
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: {
//     product: {
//       name, slug, category, base_price, weight_in_gram,
//       badge?, description?, is_active
//     },
//     variant: {  // optional, kalau mau langsung buat variant awal
//       name, price, stock, weight_in_gram?, sku?,
//       is_active, length_cm?, width_cm?, height_cm?
//     }
//   }
//
// Response:
//   { success: true, product_id: "uuid", variant_id: "uuid" | null }
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
    .replace(/[^a-z0-9\s-]/g, "") // hapus karakter non-alphanumeric
    .replace(/\s+/g, "-")         // spasi → dash
    .replace(/-+/g, "-")          // multiple dash → single
    .replace(/^-|-$/g, "");       // trim dash di awal/akhir
}

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
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
    const { product, variant } = body;

    // ── Validate product ──
    if (!product || !product.name || !product.category) {
      return json({ error: "product.{name, category} are required" }, 400);
    }

    const basePrice = Number(product.base_price);
    if (isNaN(basePrice) || basePrice < 0) {
      return json({ error: "product.base_price must be >= 0" }, 400);
    }

    const weightGram = Number(product.weight_in_gram);
    if (isNaN(weightGram) || weightGram < 0) {
      return json({ error: "product.weight_in_gram must be >= 0" }, 400);
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
    const productId = crypto.randomUUID();
    const { error: prodInsertErr } = await supabase
      .from("products")
      .insert({
        id: productId,
        slug: slug,
        name: product.name.trim(),
        category: product.category.trim(),
        base_price: basePrice,
        weight_in_gram: weightGram,
        badge: product.badge?.trim() || null,
        description: product.description?.trim() || null,
        is_active: product.is_active !== undefined ? Boolean(product.is_active) : false,
      });

    if (prodInsertErr) {
      return json({ error: `Failed to insert product: ${prodInsertErr.message}` }, 500);
    }

    // ── Optional: INSERT initial variant ──
    let variantId: string | null = null;
    if (variant) {
      // Validate variant
      if (!variant.name) {
        return json({ error: "variant.name is required when variant is provided" }, 400);
      }
      const variantPrice = Number(variant.price);
      if (isNaN(variantPrice) || variantPrice < 0) {
        return json({ error: "variant.price must be >= 0" }, 400);
      }
      if (variantPrice > basePrice) {
        return json({
          error: `variant.price (${variantPrice}) tidak boleh > base_price (${basePrice})`,
        }, 400);
      }
      const variantStock = parseInt(String(variant.stock), 10);
      if (isNaN(variantStock) || variantStock < 0) {
        return json({ error: "variant.stock must be >= 0" }, 400);
      }

      // SKU: empty → null (avoid UNIQUE constraint issue)
      const variantSku = variant.sku?.trim() || null;

      // Variant weight: fallback ke product weight kalau gak diisi
      const variantWeight = variant.weight_in_gram
        ? Number(variant.weight_in_gram)
        : weightGram;

      // Variant is_active: kalau true, weight wajib > 0 (sesuai docs)
      const variantIsActive = variant.is_active !== undefined
        ? Boolean(variant.is_active)
        : false;
      if (variantIsActive && (!variantWeight || variantWeight <= 0)) {
        return json({
          error: "variant.weight_in_gram must be > 0 when is_active=true",
        }, 400);
      }

      variantId = crypto.randomUUID();
      const { error: varInsertErr } = await supabase
        .from("product_variants")
        .insert({
          id: variantId,
          product_id: productId,
          name: variant.name.trim(),
          price: variantPrice,
          stock: variantStock,
          weight_in_gram: variantWeight,
          sku: variantSku,
          is_active: variantIsActive,
          length_cm: variant.length_cm ? Number(variant.length_cm) : null,
          width_cm: variant.width_cm ? Number(variant.width_cm) : null,
          height_cm: variant.height_cm ? Number(variant.height_cm) : null,
        });

      if (varInsertErr) {
        // Cleanup: hapus product yang baru di-insert (variant gagal)
        await supabase.from("products").delete().eq("id", productId);
        return json({
          error: `Failed to insert variant: ${varInsertErr.message}`,
        }, 500);
      }
    }

    // ── Success ──
    return json({
      success: true,
      product_id: productId,
      variant_id: variantId,
      slug: slug,
      message: variantId
        ? "Product + initial variant created"
        : "Product created (no variant yet — add via Edit panel)",
    });
  } catch (e) {
    console.error("[create-product]", e);
    return json({ error: e.message }, 500);
  }
});
