// supabase/functions/set-variant-discount/index.ts
// ============================================================================
// set-variant-discount — Admin set/clear discount per variant
// ============================================================================
//
// Auth: requireAdmin (team_dev / master / admin only)
//
// Cara panggil:
//   POST /functions/v1/set-variant-discount
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: {
//     variant_id: "uuid",
//     discount_type: "percentage" | "nominal" | "final_price" | null,
//     discount_value: number | null,
//     discount_start_at: ISO string | null,
//     discount_end_at: ISO string | null
//   }
//
// Kalau discount_type = null → clear discount (set semua field discount_* ke NULL)
// Kalau discount_type set → apply discount dengan validasi:
//   - percentage: 0 < value <= 100
//   - nominal: value > 0
//   - final_price: value > 0 (sebaiknya < variant.price)
//   - start_at dan end_at wajib diisi
//   - end_at harus > start_at
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
    // ── AUTH: admin only ──
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const {
      variant_id,
      discount_type,
      discount_value,
      discount_start_at,
      discount_end_at,
    } = body;

    // ── VALIDATE INPUT ──
    if (!variant_id) return json({ error: "variant_id is required" }, 400);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(variant_id)) {
      return json({ error: "variant_id must be a valid UUID" }, 400);
    }

    // ── CLEAR DISCOUNT (discount_type = null) ──
    if (!discount_type || discount_type === null) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: updateResult, error: updateErr } = await supabase
        .from("product_variants")
        .update({
          discount_type: null,
          discount_value: 0,
          discount_start_at: null,
          discount_end_at: null,
        })
        .eq("id", variant_id)
        .select("id, name, price, discount_type, discount_value, discount_start_at, discount_end_at");

      if (updateErr) {
        console.error("[set-variant-discount] Clear failed:", updateErr);
        return json({ error: "Failed to clear discount", details: updateErr.message }, 500);
      }
      if (!updateResult || updateResult.length === 0) {
        return json({ error: "Variant not found" }, 404);
      }

      console.log("[set-variant-discount] ✓ Discount cleared:", variant_id);
      return json({
        success: true,
        variant_id,
        action: "cleared",
        variant: updateResult[0],
      });
    }

    // ── APPLY DISCOUNT ──
    // Validate discount_type
    const validTypes = ["percentage", "nominal", "final_price"];
    if (!validTypes.includes(discount_type)) {
      return json({ error: `discount_type must be one of: ${validTypes.join(", ")}` }, 400);
    }

    // Validate discount_value
    const value = Number(discount_value);
    if (isNaN(value) || value <= 0) {
      return json({ error: "discount_value must be > 0" }, 400);
    }
    if (discount_type === "percentage" && value > 100) {
      return json({ error: "percentage discount_value must be 0-100" }, 400);
    }

    // Validate schedule
    if (!discount_start_at) return json({ error: "discount_start_at is required" }, 400);
    if (!discount_end_at) return json({ error: "discount_end_at is required" }, 400);

    const startDate = new Date(discount_start_at);
    const endDate = new Date(discount_end_at);
    if (isNaN(startDate.getTime())) return json({ error: "discount_start_at invalid date" }, 400);
    if (isNaN(endDate.getTime())) return json({ error: "discount_end_at invalid date" }, 400);
    if (startDate >= endDate) {
      return json({ error: "discount_end_at must be after discount_start_at" }, 400);
    }

    // ── Fetch variant untuk additional validation ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: variant, error: variantErr } = await supabase
      .from("product_variants")
      .select("id, name, price")
      .eq("id", variant_id)
      .single();

    if (variantErr || !variant) {
      return json({ error: "Variant not found" }, 404);
    }

    // final_price should be < original price (warning, not error)
    if (discount_type === "final_price" && value >= Number(variant.price)) {
      return json({
        error: `final_price (${value}) must be less than variant price (${variant.price})`,
      }, 400);
    }

    // ── Update variant ──
    const updatePayload = {
      discount_type,
      discount_value: value,
      discount_start_at: startDate.toISOString(),
      discount_end_at: endDate.toISOString(),
    };

    const { data: updateResult, error: updateError } = await supabase
      .from("product_variants")
      .update(updatePayload)
      .eq("id", variant_id)
      .select("id, name, price, discount_type, discount_value, discount_start_at, discount_end_at");

    if (updateError) {
      console.error("[set-variant-discount] Update failed:", updateError);
      return json({ error: "Failed to update discount", details: updateError.message }, 500);
    }
    if (!updateResult || updateResult.length === 0) {
      return json({ error: "Variant not found (0 rows updated)" }, 404);
    }

    console.log("[set-variant-discount] ✓ Discount applied:", {
      variant_id,
      type: discount_type,
      value,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    return json({
      success: true,
      variant_id,
      action: "applied",
      variant: updateResult[0],
      message: `Diskon ${discount_type} ${value} berhasil disimpan`,
    });
  } catch (e) {
    console.error("[set-variant-discount]", e);
    return json({ error: e.message }, 500);
  }
});
