// supabase/functions/export-products-csv/index.ts
// ============================================================================
// Export current products + variants from DB as 2 CSV files (zipped or separate)
// ============================================================================
// Returns: JSON with 2 base64-encoded CSV strings (products_csv, variants_csv)
// Frontend akan trigger download dari base64 string.
//
// Cara panggil:
//   POST /functions/v1/export-products-csv
//   Body: { } (empty)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// CSV escape (RFC 4180)
// ============================================================================
function csvEscape(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Kalau ada comma, quote, atau newline → wrap dengan double quote + escape internal quote
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: any[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

// ============================================================================
// MAIN
// ============================================================================
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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch all products
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, slug, description, category, base_price, is_active, badge, weight_in_gram, updated_at")
      .order("updated_at", { ascending: false });

    if (pErr) throw new Error(`Failed to fetch products: ${pErr.message}`);

    // 2. Fetch all variants
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id, name, attributes, price, stock, sku, is_active, weight_in_gram, length_cm, width_cm, height_cm")
      .order("created_at", { ascending: true });

    if (vErr) throw new Error(`Failed to fetch variants: ${vErr.message}`);

    // 3. Build product_id → slug map (for variant CSV)
    const productIdToSlug = new Map(
      (products || []).map((p: any) => [p.id, p.slug])
    );

    // 4. Build products CSV
    const productsHeaders = [
      "slug", "name", "category", "base_price", "weight_in_gram",
      "badge", "is_active", "description"
    ];
    const productsRows = (products || []).map((p: any) => [
      p.slug,
      p.name,
      p.category || "",
      p.base_price,
      p.weight_in_gram || "",
      p.badge || "",
      p.is_active,
      p.description || "",
    ]);
    const productsCsv = buildCsv(productsHeaders, productsRows);

    // 5. Build variants CSV
    const variantsHeaders = [
      "product_slug", "name", "attributes", "price", "stock",
      "sku", "is_active", "weight_in_gram", "length_cm", "width_cm", "height_cm"
    ];
    const variantsRows = (variants || []).map((v: any) => [
      productIdToSlug.get(v.product_id) || "",
      v.name || "",
      v.attributes ? JSON.stringify(v.attributes) : "{}",
      v.price,
      v.stock,
      v.sku || "",
      v.is_active,
      v.weight_in_gram || "",
      v.length_cm || "",
      v.width_cm || "",
      v.height_cm || "",
    ]);
    const variantsCsv = buildCsv(variantsHeaders, variantsRows);

    // 6. Return base64-encoded CSVs (frontend trigger download)
    const encoder = new TextEncoder();
    const productsBase64 = btoa(String.fromCharCode(...encoder.encode(productsCsv)));
    const variantsBase64 = btoa(String.fromCharCode(...encoder.encode(variantsCsv)));

    return json({
      success: true,
      exported_at: new Date().toISOString(),
      counts: {
        products: products?.length || 0,
        variants: variants?.length || 0,
      },
      files: {
        products_csv: {
          filename: "products_template.csv",
          content_base64: productsBase64,
          rows: products?.length || 0,
        },
        variants_csv: {
          filename: "product_variants_template.csv",
          content_base64: variantsBase64,
          rows: variants?.length || 0,
        },
      },
    });
  } catch (e) {
    console.error("[export-products-csv]", e);
    return json({ error: e.message }, 500);
  }
});
