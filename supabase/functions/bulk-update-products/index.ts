// supabase/functions/bulk-update-products/index.ts
// ============================================================================
// Bulk update products + variants (inline edit + bulk actions)
// ============================================================================
// Cara panggil:
//   POST /functions/v1/bulk-update-products
//   Body: {
//     updates: [
//       {
//         type: "product",
//         slug: "toples-xxx",
//         fields: { base_price: 95000, weight_in_gram: 850, is_active: true, badge: "Best Seller" }
//       },
//       {
//         type: "variant",
//         id: "uuid-variant",
//         fields: { price: 85000, stock: 50, weight_in_gram: 800, is_active: true }
//       }
//     ]
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Allowed fields per type (whitelist untuk security)
const PRODUCT_ALLOWED_FIELDS = [
  "name", "description", "category", "base_price",
  "is_active", "badge", "weight_in_gram"
];
const VARIANT_ALLOWED_FIELDS = [
  "name", "attributes", "price", "stock",
  "sku", "is_active", "weight_in_gram",
  "length_cm", "width_cm", "height_cm"
];

function sanitizeFields(fields: Record<string, any>, allowed: string[]): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const key of allowed) {
    if (key in fields) {
      clean[key] = fields[key];
    }
  }
  return clean;
}

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

    const body = await req.json();
    const updates: Array<{
      type: "product" | "variant";
      slug?: string;  // for product
      id?: string;    // for variant
      fields: Record<string, any>;
    }> = body.updates || [];

    if (!Array.isArray(updates) || updates.length === 0) {
      return json({ error: "updates array is required (cannot be empty)" }, 400);
    }

    if (updates.length > 500) {
      return json({
        error: `Too many updates (${updates.length}). Maximum 500 per request.`,
      }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: Array<{
      index: number;
      type: string;
      identifier: string;
      success: boolean;
      error?: string;
      fields_updated?: string[];
    }> = [];

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < updates.length; i++) {
      const update = updates[i];
      const index = i;

      try {
        if (update.type === "product") {
          // Validate
          if (!update.slug) {
            results.push({ index, type: "product", identifier: "(no slug)", success: false, error: "slug is required" });
            errorCount++;
            continue;
          }

          const cleanFields = sanitizeFields(update.fields, PRODUCT_ALLOWED_FIELDS);
          if (Object.keys(cleanFields).length === 0) {
            results.push({ index, type: "product", identifier: update.slug, success: false, error: "no valid fields to update" });
            errorCount++;
            continue;
          }

          // Validate base_price
          if ("base_price" in cleanFields) {
            const price = Number(cleanFields.base_price);
            if (isNaN(price) || price < 0) {
              results.push({ index, type: "product", identifier: update.slug, success: false, error: `base_price must be >= 0` });
              errorCount++;
              continue;
            }
            cleanFields.base_price = price;
          }

          // Validate weight_in_gram
          if ("weight_in_gram" in cleanFields) {
            const w = Number(cleanFields.weight_in_gram);
            if (isNaN(w) || w < 0) {
              results.push({ index, type: "product", identifier: update.slug, success: false, error: `weight_in_gram must be >= 0` });
              errorCount++;
              continue;
            }
            cleanFields.weight_in_gram = w;
          }

          // Execute update
          const { error: updateErr } = await supabase
            .from("products")
            .update(cleanFields)
            .eq("slug", update.slug);

          if (updateErr) {
            results.push({ index, type: "product", identifier: update.slug, success: false, error: updateErr.message });
            errorCount++;
          } else {
            results.push({
              index, type: "product", identifier: update.slug,
              success: true, fields_updated: Object.keys(cleanFields)
            });
            successCount++;
          }

        } else if (update.type === "variant") {
          // Validate
          if (!update.id) {
            results.push({ index, type: "variant", identifier: "(no id)", success: false, error: "id is required" });
            errorCount++;
            continue;
          }

          const cleanFields = sanitizeFields(update.fields, VARIANT_ALLOWED_FIELDS);
          if (Object.keys(cleanFields).length === 0) {
            results.push({ index, type: "variant", identifier: update.id, success: false, error: "no valid fields to update" });
            errorCount++;
            continue;
          }

          // SKU: empty string → null (PostgreSQL UNIQUE constraint treat multiple NULLs as distinct,
          // tapi reject multiple empty strings). Trim whitespace juga.
          if ("sku" in cleanFields) {
            const skuVal = cleanFields.sku;
            if (skuVal === null || skuVal === undefined || (typeof skuVal === "string" && skuVal.trim() === "")) {
              cleanFields.sku = null;
            } else {
              cleanFields.sku = String(skuVal).trim();
            }
          }

          // Validate price
          if ("price" in cleanFields) {
            const price = Number(cleanFields.price);
            if (isNaN(price) || price < 0) {
              results.push({ index, type: "variant", identifier: update.id, success: false, error: `price must be >= 0` });
              errorCount++;
              continue;
            }
            cleanFields.price = price;
          }

          // Validate stock
          if ("stock" in cleanFields) {
            const stock = parseInt(String(cleanFields.stock), 10);
            if (isNaN(stock) || stock < 0) {
              results.push({ index, type: "variant", identifier: update.id, success: false, error: `stock must be >= 0` });
              errorCount++;
              continue;
            }
            cleanFields.stock = stock;
          }

          // Execute update
          const { error: updateErr } = await supabase
            .from("product_variants")
            .update(cleanFields)
            .eq("id", update.id);

          if (updateErr) {
            results.push({ index, type: "variant", identifier: update.id, success: false, error: updateErr.message });
            errorCount++;
          } else {
            results.push({
              index, type: "variant", identifier: update.id,
              success: true, fields_updated: Object.keys(cleanFields)
            });
            successCount++;
          }

        } else {
          results.push({ index, type: update.type || "(unknown)", identifier: "", success: false, error: `unknown type "${update.type}" (must be "product" or "variant")` });
          errorCount++;
        }
      } catch (e) {
        results.push({
          index, type: update.type || "(unknown)",
          identifier: update.slug || update.id || "",
          success: false, error: e.message
        });
        errorCount++;
      }
    }

    return json({
      success: errorCount === 0,
      total: updates.length,
      success_count: successCount,
      error_count: errorCount,
      results,
      message: errorCount === 0
        ? `✓ All ${successCount} update(s) successful.`
        : `${successCount} successful, ${errorCount} failed. See results for details.`,
    });
  } catch (e) {
    console.error("[bulk-update-products]", e);
    return json({ error: e.message }, 500);
  }
});
