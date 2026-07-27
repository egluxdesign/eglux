// supabase/functions/export-products-csv/index.ts
// ============================================================================
// Export products as SUMMARY CSV (single file)
// ============================================================================
// Output columns (sesuai request admin):
//   Name, Category, Price Range, Discounts, Badge, Active, Variants, Updated
//
// Cara panggil:
//   POST /functions/v1/export-products-csv
//   Body: { } (empty)
//
// Returns: JSON dengan 1 base64-encoded CSV string (products_summary)
// Frontend akan trigger download dari base64 string.
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
// Format rupiah (tanpa desimal)
// ============================================================================
function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return "Rp " + Number(value).toLocaleString("id-ID");
}

// ============================================================================
// Format timestamp ke "YYYY-MM-DD HH:MM" (Asia/Jakarta)
// ============================================================================
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("id-ID", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(d);
  } catch {
    return iso;
  }
}

// ============================================================================
// Cek apakah discount variant sedang aktif (time-window check)
// ============================================================================
function isDiscountActive(variant: any): boolean {
  if (!variant.discount_type || !variant.discount_value) return false;
  const now = new Date();
  const startAt = variant.discount_start_at ? new Date(variant.discount_start_at) : null;
  const endAt = variant.discount_end_at ? new Date(variant.discount_end_at) : null;
  if (startAt && now < startAt) return false;
  if (endAt && now > endAt) return false;
  return true;
}

// ============================================================================
// Hitung discount percent untuk variant (untuk display di CSV)
// ============================================================================
function getDiscountPercent(variant: any): number {
  if (!isDiscountActive(variant)) return 0;
  const originalPrice = Number(variant.price) || 0;
  if (originalPrice <= 0) return 0;
  const value = Number(variant.discount_value);
  let currentPrice = originalPrice;
  switch (variant.discount_type) {
    case "percentage": currentPrice = Math.max(0, Math.round(originalPrice - (originalPrice * value / 100))); break;
    case "nominal":    currentPrice = Math.max(0, originalPrice - value); break;
    case "final_price":currentPrice = Math.max(0, value); break;
    default: return 0;
  }
  if (originalPrice <= currentPrice) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
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

    // 1. Fetch all products dengan variants + discounts (single query, nested join)
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select(`
        id, name, slug, category, badge, is_active, updated_at,
        product_variants (
          id, name, price, stock, is_active,
          discount_type, discount_value, discount_start_at, discount_end_at
        )
      `)
      .order("updated_at", { ascending: false });

    if (pErr) throw new Error(`Failed to fetch products: ${pErr.message}`);

    // 2. Build summary CSV dengan kolom yang diminta admin
    const summaryHeaders = [
      "Name",
      "Category",
      "Price Range",
      "Discounts",
      "Badge",
      "Active",
      "Variants",
      "Updated",
    ];

    const summaryRows = (products || []).map((p: any) => {
      const variants = p.product_variants || [];
      const activeVariants = variants.filter((v: any) => v.is_active);

      // Price Range: min-max dari active variants
      const prices = activeVariants
        .map((v: any) => Number(v.price) || 0)
        .filter((price: number) => price > 0);
      let priceRange = "—";
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        if (minPrice === maxPrice) {
          priceRange = formatRupiah(minPrice);
        } else {
          priceRange = `${formatRupiah(minPrice)} - ${formatRupiah(maxPrice)}`;
        }
      }

      // Discounts: summary discount aktif dari active variants
      const discountPercents = activeVariants
        .map((v: any) => getDiscountPercent(v))
        .filter((pct: number) => pct > 0);
      let discountsSummary = "—";
      if (discountPercents.length > 0) {
        const minPct = Math.min(...discountPercents);
        const maxPct = Math.max(...discountPercents);
        if (minPct === maxPct) {
          discountsSummary = `-${minPct}% (${discountPercents.length} varian)`;
        } else {
          discountsSummary = `-${minPct}% to -${maxPct}% (${discountPercents.length} varian)`;
        }
      }

      // Variants: count (active / total)
      const variantsSummary = `${activeVariants.length} active / ${variants.length} total`;

      return [
        p.name || "",
        p.category || "—",
        priceRange,
        discountsSummary,
        p.badge || "—",
        p.is_active ? "Active" : "Inactive",
        variantsSummary,
        formatDate(p.updated_at),
      ];
    });

    const summaryCsv = buildCsv(summaryHeaders, summaryRows);

    // 3. Return base64-encoded CSV (frontend trigger download)
    const encoder = new TextEncoder();
    const summaryBase64 = btoa(String.fromCharCode(...encoder.encode(summaryCsv)));

    return json({
      success: true,
      exported_at: new Date().toISOString(),
      counts: {
        products: products?.length || 0,
      },
      files: {
        products_summary: {
          filename: `products_summary_${new Date().toISOString().slice(0, 10)}.csv`,
          content_base64: summaryBase64,
          rows: products?.length || 0,
        },
      },
    });
  } catch (e) {
    console.error("[export-products-csv]", e);
    return json({ error: e.message }, 500);
  }
});
