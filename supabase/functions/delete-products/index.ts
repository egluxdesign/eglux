// supabase/functions/delete-products/index.ts
// ============================================================================
// delete-products — Admin: hapus product + variants + images dari DB & Storage
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/delete-products
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: {
//     product_ids: ["uuid1", "uuid2", ...]  // array of product UUIDs
//   }
//
// Untuk single delete: { product_ids: ["single-uuid"] }
//
// Flow per product:
//   1. Fetch all images dari product_images where product_id = X
//   2. Delete images dari Supabase Storage (extract path dari URL)
//   3. Delete product_images rows (DB)
//   4. Delete product_variants rows (DB)
//   5. Delete product row (DB)
//
// Response:
//   { success: true, success_count: N, error_count: M, results: [...] }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Storage bucket name untuk product images
const STORAGE_BUCKET = "product-images";

// ============================================================================
// Helper: Extract storage path dari public URL
// ============================================================================
// URL format: https://<project>.supabase.co/storage/v1/object/public/product-images/products/xxx.jpg
// Path: products/xxx.jpg
// ============================================================================
function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    // Cari index "public" lalu bucket name, sisanya adalah path
    const publicIdx = parts.indexOf("public");
    if (publicIdx === -1 || publicIdx + 2 >= parts.length) return null;
    // Skip "public" + bucket name, join sisanya
    return parts.slice(publicIdx + 2).join("/");
  } catch {
    return null;
  }
}

// ============================================================================
// Helper: Cek apakah product pernah dipesan (ada di order_items)
// ============================================================================
async function hasOrderHistory(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<{ hasOrders: boolean; orderCount: number }> {
  const { count, error } = await supabase
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if (error) {
    console.warn(`[delete-products] Failed to check order history for ${productId}:`, error.message);
    return { hasOrders: false, orderCount: 0 };
  }

  return {
    hasOrders: (count || 0) > 0,
    orderCount: count || 0,
  };
}

// ============================================================================
// Helper: Delete single product (DB + Storage)
// ============================================================================
// Strategy:
//   - Kalau product PERNAH dipesan → SOFT DELETE (is_active=false, badge=null)
//     + return success tapi dengan flag "soft_deleted": true
//   - Kalau product BELUM pernah dipesan → HARD DELETE (full remove)
// ============================================================================
async function deleteProduct(
  supabase: ReturnType<typeof createClient>,
  productId: string,
): Promise<{
  success: boolean;
  error?: string;
  images_deleted?: number;
  soft_deleted?: boolean;
  order_count?: number;
}> {
  // 0. Cek apakah product pernah dipesan
  const { hasOrders, orderCount } = await hasOrderHistory(supabase, productId);

  if (hasOrders) {
    // ── SOFT DELETE: set is_active=false + clear badge ──
    // Product tetap di DB supaya order history tetap valid (FK terpenuhi).
    // Tapi product gak akan tampil di catalog (filter is_active=true).
    const { error: softDelErr } = await supabase
      .from("products")
      .update({
        is_active: false,
        badge: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (softDelErr) {
      return {
        success: false,
        error: `Failed to soft-delete product (has ${orderCount} orders): ${softDelErr.message}`,
      };
    }

    // Soft-delete variants juga (set is_active=false)
    await supabase
      .from("product_variants")
      .update({ is_active: false })
      .eq("product_id", productId);

    return {
      success: true,
      soft_deleted: true,
      order_count: orderCount,
    };
  }

  // ── HARD DELETE: product belum pernah dipesan, hapus permanen ──

  // 1. Fetch all images untuk product ini
  const { data: images, error: imgFetchErr } = await supabase
    .from("product_images")
    .select("id, url")
    .eq("product_id", productId);

  if (imgFetchErr) {
    return { success: false, error: `Failed to fetch images: ${imgFetchErr.message}` };
  }

  // 2. Delete images dari Storage
  let imagesDeleted = 0;
  if (images && images.length > 0) {
    const storagePaths = images
      .map((img) => extractStoragePath(img.url))
      .filter((p): p is string => p !== null);

    if (storagePaths.length > 0) {
      const { error: storageErr } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .remove(storagePaths);
      if (storageErr) {
        console.warn(`[delete-products] Storage delete warning for ${productId}:`, storageErr.message);
        // Continue anyway — DB delete lebih penting
      } else {
        imagesDeleted = storagePaths.length;
      }
    }
  }

  // 3. Delete product_images rows
  const { error: imgDelErr } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId);
  if (imgDelErr) {
    return { success: false, error: `Failed to delete product_images: ${imgDelErr.message}` };
  }

  // 4. Delete product_variants rows
  const { error: varDelErr } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", productId);
  if (varDelErr) {
    return { success: false, error: `Failed to delete product_variants: ${varDelErr.message}` };
  }

  // 5. Delete product row
  const { error: prodDelErr } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (prodDelErr) {
    return { success: false, error: `Failed to delete product: ${prodDelErr.message}` };
  }

  return { success: true, images_deleted: imagesDeleted };
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
    const { product_ids } = body;

    // Validate
    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return json({ error: "product_ids array is required (cannot be empty)" }, 400);
    }

    if (product_ids.length > 100) {
      return json({
        error: `Too many products (${product_ids.length}). Maximum 100 per request.`,
      }, 400);
    }

    // Validate each UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of product_ids) {
      if (typeof id !== "string" || !uuidRegex.test(id)) {
        return json({ error: `Invalid product_id format: ${id}` }, 400);
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Execute delete untuk setiap product
    const results: Array<{
      product_id: string;
      success: boolean;
      error?: string;
      images_deleted?: number;
      soft_deleted?: boolean;
      order_count?: number;
    }> = [];

    let successCount = 0;
    let errorCount = 0;
    let softDeleteCount = 0;
    let hardDeleteCount = 0;

    for (const productId of product_ids) {
      const result = await deleteProduct(supabase, productId);
      if (result.success) {
        successCount++;
        if (result.soft_deleted) {
          softDeleteCount++;
        } else {
          hardDeleteCount++;
        }
        results.push({
          product_id: productId,
          success: true,
          images_deleted: result.images_deleted,
          soft_deleted: result.soft_deleted,
          order_count: result.order_count,
        });
      } else {
        errorCount++;
        results.push({
          product_id: productId,
          success: false,
          error: result.error,
        });
      }
    }

    return json({
      success: errorCount === 0,
      total: product_ids.length,
      success_count: successCount,
      error_count: errorCount,
      soft_deleted_count: softDeleteCount,
      hard_deleted_count: hardDeleteCount,
      results,
      message: errorCount === 0
        ? `✓ ${successCount} product(s) processed (${hardDeleteCount} hard delete, ${softDeleteCount} soft delete — has order history).`
        : `${successCount} processed, ${errorCount} failed. See results for details.`,
    });
  } catch (e) {
    console.error("[delete-products]", e);
    return json({ error: e.message }, 500);
  }
});
