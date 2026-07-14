// supabase/functions/import-products-csv/index.ts
// ============================================================================
// [v3] Unified CSV/XLSX Import — 1 file untuk products + variants
// ============================================================================
// Format: Single file dengan kolom `row_type` (product | variant)
//
// Product row:  row_type=product, slug, name, category, price, weight_in_gram, badge, is_active, description
// Variant row:  row_type=variant, slug(=product_slug), name(=variant_name), price, stock, weight_in_gram, sku, is_active, length_cm, width_cm, height_cm, attributes
//
// Cara panggil:
//   POST /functions/v1/import-products-csv
//   multipart/form-data: products_csv (file), mode (validate|execute)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// CSV PARSER (BOM, semicolon, case-insensitive headers)
// ============================================================================
function parseCSV(text: string): Record<string, string>[] {
  let cleanText = text.replace(/^\uFEFF/, "");
  cleanText = cleanText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = cleanText.split("\n")[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";

  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];
    if (inQuotes) {
      if (char === '"' && nextChar === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === delimiter) { current.push(field); field = ""; }
      else if (char === "\n") { current.push(field); rows.push(current); current = []; field = ""; }
      else { field += char; }
    }
  }
  if (field !== "" || current.length > 0) { current.push(field); rows.push(current); }
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => { obj[header] = (row[i] || "").trim(); });
    return obj;
  });
}

// ============================================================================
// TYPES
// ============================================================================
interface ParsedProduct {
  slug: string; name: string; category: string; base_price: number;
  weight_in_gram: number; badge: string; is_active: boolean; description: string;
}
interface ParsedVariant {
  product_slug: string; name: string; attributes: Record<string, unknown>;
  price: number; stock: number; sku: string; is_active: boolean;
  weight_in_gram: number | null; length_cm: number | null;
  width_cm: number | null; height_cm: number | null;
}
interface ValidationError { row: number; row_type: string; slug?: string; field?: string; error: string; }

function parseBoolean(val: string): boolean {
  return val.toLowerCase() === "true" || val === "1" || val.toLowerCase() === "yes";
}

// ============================================================================
// PARSE UNIFIED ROWS (product + variant in 1 file)
// ============================================================================
function parseUnifiedRows(rows: Record<string, string>[]): {
  validProducts: ParsedProduct[];
  validVariants: ParsedVariant[];
  errors: ValidationError[];
} {
  const validProducts: ParsedProduct[] = [];
  const validVariants: ParsedVariant[] = [];
  const errors: ValidationError[] = [];
  const seenProductSlugs = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const rowType = (row.row_type || "product").toLowerCase().trim();

    // ===== PRODUCT ROW =====
    if (rowType === "product" || rowType === "p" || rowType === "") {
      const slug = row.slug || "";
      if (!slug) {
        errors.push({ row: rowNum, row_type: "product", field: "slug", error: "slug is required" });
        return;
      }
      if (seenProductSlugs.has(slug)) {
        errors.push({ row: rowNum, row_type: "product", slug, field: "slug", error: `duplicate slug "${slug}"` });
        return;
      }
      seenProductSlugs.add(slug);

      const name = row.name || "";
      if (!name) {
        errors.push({ row: rowNum, row_type: "product", slug, field: "name", error: "name is required for product rows" });
        return;
      }

      const base_price = parseFloat(row.price || row.base_price || "0");
      if (isNaN(base_price) || base_price < 0) {
        errors.push({ row: rowNum, row_type: "product", slug, field: "price", error: `price must be >= 0, got "${row.price}"` });
        return;
      }

      const is_active = parseBoolean(row.is_active ?? "true");
      if (is_active && base_price === 0) {
        errors.push({ row: rowNum, row_type: "product", slug, field: "price", error: "price must be > 0 when is_active=true" });
        return;
      }

      const weight_in_gram = parseInt(row.weight_in_gram || "0", 10);
      if (isNaN(weight_in_gram) || weight_in_gram <= 0) {
        errors.push({ row: rowNum, row_type: "product", slug, field: "weight_in_gram", error: `weight_in_gram must be > 0` });
        return;
      }

      validProducts.push({
        slug, name,
        category: row.category || "",
        base_price,
        weight_in_gram,
        badge: row.badge || "",
        is_active,
        description: row.description || "",
      });
      return;
    }

    // ===== VARIANT ROW =====
    if (rowType === "variant" || rowType === "v") {
      const product_slug = row.slug || "";
      if (!product_slug) {
        errors.push({ row: rowNum, row_type: "variant", field: "slug", error: "slug (product_slug) is required for variant rows" });
        return;
      }

      const name = row.name || "";
      if (!name) {
        errors.push({ row: rowNum, row_type: "variant", product_slug, field: "name", error: "name (variant name) is required for variant rows" });
        return;
      }

      const price = parseFloat(row.price || "0");
      if (isNaN(price) || price < 0) {
        errors.push({ row: rowNum, row_type: "variant", product_slug, field: "price", error: `price must be >= 0` });
        return;
      }

      const stock = parseInt(row.stock || "0", 10);
      if (isNaN(stock) || stock < 0) {
        errors.push({ row: rowNum, row_type: "variant", product_slug, field: "stock", error: `stock must be >= 0` });
        return;
      }

      // Attributes (JSON)
      let attributes: Record<string, unknown> = {};
      const attrsRaw = row.attributes || "";
      if (attrsRaw) {
        try {
          attributes = JSON.parse(attrsRaw);
          if (typeof attributes !== "object" || Array.isArray(attributes) || attributes === null) throw new Error();
        } catch {
          errors.push({ row: rowNum, row_type: "variant", product_slug, field: "attributes", error: `attributes must be valid JSON, got "${attrsRaw}"` });
          return;
        }
      }

      const is_active = parseBoolean(row.is_active ?? "true");
      const weight_in_gram = row.weight_in_gram ? parseInt(row.weight_in_gram, 10) : null;
      if (is_active && (!weight_in_gram || weight_in_gram <= 0)) {
        errors.push({ row: rowNum, row_type: "variant", product_slug, field: "weight_in_gram", error: "weight_in_gram must be > 0 for active variants" });
        return;
      }

      const parseDim = (v: string): number | null => {
        if (!v || v.trim() === "") return null;
        const n = parseFloat(v);
        return isNaN(n) || n <= 0 ? null : n;
      };
      const length_cm = parseDim(row.length_cm || "");
      const width_cm = parseDim(row.width_cm || "");
      const height_cm = parseDim(row.height_cm || "");
      const dimCount = [length_cm, width_cm, height_cm].filter((d) => d !== null).length;
      if (dimCount > 0 && dimCount < 3) {
        errors.push({ row: rowNum, row_type: "variant", product_slug, field: "dimensions", error: "If any dimension set, all 3 required" });
        return;
      }

      validVariants.push({
        product_slug, name, attributes, price, stock,
        sku: row.sku || `EGL-${product_slug.substring(0, 8)}-${Date.now().toString().slice(-4)}`,
        is_active, weight_in_gram, length_cm, width_cm, height_cm,
      });
      return;
    }

    errors.push({ row: rowNum, row_type: rowType, field: "row_type", error: `row_type must be "product" or "variant", got "${rowType}"` });
  });

  return { validProducts, validVariants, errors };
}

// ============================================================================
// CROSS-VALIDATE: variant price < product base_price (diskon model)
// ============================================================================
function crossValidate(products: ParsedProduct[], variants: ParsedVariant[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const productMap = new Map(products.map((p) => [p.slug, p]));

  variants.forEach((v, idx) => {
    const rowNum = idx + 2;
    const product = productMap.get(v.product_slug);
    if (!product) return; // will be checked against DB later
    // Perubahan: variant price boleh SAMA dengan base_price, tapi TIDAK BOLEH LEBIH MAHAL
    if (v.price > product.base_price) {
      errors.push({
        row: rowNum, row_type: "variant", product_slug: v.product_slug,
        field: "price", error: `variant price ${v.price} cannot be higher than product base_price ${product.base_price}`,
      });
    }
  });
  return errors;
}

// ============================================================================
// UPSERT PRODUCTS
// ============================================================================
async function upsertProducts(supabase: any, products: ParsedProduct[]) {
  const slugs = products.map((p) => p.slug);
  const { data: existing } = await supabase.from("products").select("id, slug").in("slug", slugs);
  const existingMap = new Map((existing || []).map((p: any) => [p.slug, p.id]));

  const payload = products.map((p) => ({
    id: existingMap.get(p.slug) || crypto.randomUUID(),
    slug: p.slug, name: p.name, description: p.description || null,
    category: p.category || null, base_price: p.base_price,
    is_active: p.is_active, badge: p.badge || null,
    weight_in_gram: p.weight_in_gram,
  }));

  const { data: upserted, error } = await supabase.from("products").upsert(payload, { onConflict: "slug" }).select("id, slug");
  if (error) return { upserted: 0, inserted: 0, updated: 0, errors: [error.message] };

  let inserted = 0, updated = 0;
  for (const row of upserted || []) {
    if (existingMap.has(row.slug)) updated++; else inserted++;
  }
  return { upserted: upserted?.length || 0, inserted, updated, errors: [] };
}

// ============================================================================
// UPSERT VARIANTS
// ============================================================================
async function upsertVariants(supabase: any, variants: ParsedVariant[], slugToId: Map<string, string>) {
  if (variants.length === 0) return { upserted: 0, inserted: 0, updated: 0, errors: [] };

  const payload = variants.map((v) => ({
    id: crypto.randomUUID(),
    product_id: slugToId.get(v.product_slug),
    name: v.name, attributes: v.attributes, price: v.price,
    stock: v.stock, sku: v.sku, is_active: v.is_active,
    weight_in_gram: v.weight_in_gram,
    length_cm: v.length_cm, width_cm: v.width_cm, height_cm: v.height_cm,
  })).filter((p) => p.product_id); // filter out variants without product_id

  const productIds = [...new Set(payload.map((p) => p.product_id))];
  const { data: existingVariants } = await supabase
    .from("product_variants").select("id, product_id, name").in("product_id", productIds);

  const existingMap = new Map((existingVariants || []).map((v: any) => [`${v.product_id}||${v.name}`, v.id]));
  const finalPayload = payload.map((p) => {
    const key = `${p.product_id}||${p.name}`;
    return existingMap.has(key) ? { ...p, id: existingMap.get(key) } : p;
  });

  const { data: upserted, error } = await supabase
    .from("product_variants").upsert(finalPayload, { onConflict: "id" }).select("id, product_id, name");
  if (error) return { upserted: 0, inserted: 0, updated: 0, errors: [error.message] };

  let inserted = 0, updated = 0;
  for (const row of upserted || []) {
    if (existingMap.has(`${row.product_id}||${row.name}`)) updated++; else inserted++;
  }
  return { upserted: upserted?.length || 0, inserted, updated, errors: [] };
}

// ============================================================================
// MAIN
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── AUTH: Admin-only (team_dev / master / admin) ──
    const authResult = await requireAdmin(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const formData = await req.formData();
    const file = formData.get("products_csv") as File;
    const mode = (formData.get("mode") as string) || "validate";

    if (mode !== "validate" && mode !== "execute") return json({ error: `Invalid mode` }, 400);
    if (!file) return json({ error: "products_csv file is required" }, 400);

    const text = await file.text();
    console.log(`[import-csv] Received: ${text.length} chars, mode=${mode}`);

    const rows = parseCSV(text);
    if (rows.length === 0) return json({ error: "CSV is empty or has no data rows" }, 400);

    // Parse + validate
    const { validProducts, validVariants, errors: parseErrors } = parseUnifiedRows(rows);

    // Check variant product_slug references (against CSV products + DB products)
    const csvProductSlugs = new Set(validProducts.map((p) => p.slug));
    const variantSlugs = new Set(validVariants.map((v) => v.product_slug));
    const dbOnlySlugs = [...variantSlugs].filter((s) => !csvProductSlugs.has(s));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let allProductSlugs = new Set(csvProductSlugs);

    if (dbOnlySlugs.length > 0) {
      const { data: dbProducts } = await supabase.from("products").select("slug").in("slug", dbOnlySlugs);
      (dbProducts || []).forEach((p: any) => allProductSlugs.add(p.slug));
    }

    // Validate variant product_slug exists
    const refErrors: ValidationError[] = [];
    validVariants.forEach((v, idx) => {
      if (!allProductSlugs.has(v.product_slug)) {
        refErrors.push({
          row: idx + 2, row_type: "variant", product_slug: v.product_slug,
          field: "slug", error: `product_slug "${v.product_slug}" not found in CSV or DB`,
        });
      }
    });

    const crossErrors = crossValidate(validProducts, validVariants);
    const allErrors = [...parseErrors, ...refErrors, ...crossErrors];

    const report = {
      mode, dry_run: mode === "validate",
      received: { csv_rows: rows.length },
      parsed: {
        products_valid: validProducts.length,
        variants_valid: validVariants.length,
        products_invalid: parseErrors.filter((e) => e.row_type === "product").length,
        variants_invalid: parseErrors.filter((e) => e.row_type === "variant").length,
        ref_errors: refErrors.length,
        cross_errors: crossErrors.length,
      },
      errors: allErrors,
      db_changes: null as any,
    };

    if (allErrors.length > 0) {
      return json({
        ...report,
        message: `Validation failed: ${allErrors.length} error(s). DB not modified.`,
      }, 400);
    }

    if (mode === "validate") {
      return json({
        ...report,
        message: `✓ Validation passed! ${validProducts.length} products + ${validVariants.length} variants ready. Re-run with mode=execute.`,
      });
    }

    // EXECUTE
    const productsResult = await upsertProducts(supabase, validProducts);
    if (productsResult.errors.length > 0) {
      return json({ ...report, db_changes: { products: productsResult, variants: { upserted: 0 } }, message: "Products upsert failed" }, 500);
    }

    // Build slug → id map
    const { data: upsertedProducts } = await supabase.from("products").select("id, slug").in("slug", validProducts.map((p) => p.slug));
    const slugToId = new Map((upsertedProducts || []).map((p: any) => [p.slug, p.id]));

    // Also add DB-only slugs for variants referencing existing products
    if (dbOnlySlugs.length > 0) {
      const { data: dbProducts } = await supabase.from("products").select("id, slug").in("slug", dbOnlySlugs);
      (dbProducts || []).forEach((p: any) => slugToId.set(p.slug, p.id));
    }

    const variantsResult = await upsertVariants(supabase, validVariants, slugToId);

    return json({
      ...report,
      db_changes: { products: productsResult, variants: variantsResult },
      message: `✓ Import done! Products: ${productsResult.inserted} new + ${productsResult.updated} updated. Variants: ${variantsResult.inserted} new + ${variantsResult.updated} updated.`,
    });
  } catch (e) {
    console.error("[import-products-csv]", e);
    return json({ error: e.message }, 500);
  }
});
