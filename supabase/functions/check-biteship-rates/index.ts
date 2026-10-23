// supabase/functions/check-biteship-rates/index.ts
// ============================================================================
// Check Biteship Rates v4.0 — sesuai official Biteship API documentation
// ============================================================================
// ⭐ v4.0 FIX (dari v3.1):
//   - URL CORRECT: POST /v1/rates/couriers (BUKAN /v1/rates)
//   - Payload field CORRECT: items[].value (BUKAN items[].price)
//   - Response field CORRECT: data.pricing (BUKAN data.rates)
//   - Field normalization sesuai docs:
//     * courier_code (lowercase) bukan company_code
//     * courier_service_code (lowercase) bukan service_code
//     * price (final price including fees)
//     * shipping_fee (base shipping fee)
//
// Source: https://biteship.com/en/docs/api/rates/retrieve
//
// COURIER WHITELIST (sesuai config EGLUX):
//   jne      = REG + YES   (Regular + Yakin Esok Sampai)
//   anteraja = REG         (Regular)
//   jnt      = EZ          (Eazy, next day)
//   jntcargo = Standar     (J&T Cargo Standard)
//
// ENV VARS:
//   - SUPABASE_URL               (auto-set)
//   - SUPABASE_SERVICE_ROLE_KEY  (auto-set)
//   - BITESHIP_API_KEY           (supabase secrets set BITESHIP_API_KEY=xxx)
//   - BITESHIP_ORIGIN_AREA_ID    (supabase secrets set BITESHIP_ORIGIN_AREA_ID=xxx)
//   - BITESHIP_ORIGIN_POSTAL_CODE (optional fallback)
//
// INPUT (POST body):
//   {
//     "destination_postal_code": "10210",
//     "destination_area_id": "xxx" (optional),
//     "items": [{ "name": "Product", "weight": 500, "quantity": 2, "value": 50000 }],
//     "cod_price": 0 (optional)
//   }
//
// OUTPUT:
//   {
//     "success": true,
//     "rates": [
//       { "company": "JNE", "company_code": "jne", "service": "REG", "service_code": "reg",
//         "price": 18000, "duration": "2-3 days", "etd": "2-3" },
//       ...
//     ],
//     "total_rates": 5,
//     "raw_biteship_count": 12
//   }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// ENV VARS
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;
const BITESHIP_ORIGIN_AREA_ID = Deno.env.get("BITESHIP_ORIGIN_AREA_ID");
const BITESHIP_ORIGIN_POSTAL_CODE = Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE");

// ============================================================================
// ⭐ BITESHIP API CONFIG (sesuai official docs)
// ============================================================================
// Source: https://biteship.com/en/docs/api/rates/retrieve
//
// Endpoint: POST /v1/rates/couriers
// Auth: Authorization: <api_key> (raw, no Bearer prefix)
// Content-Type: application/json
//
// Request body fields:
//   - origin_area_id (string)      OPTIONAL/REQUIRED
//   - destination_area_id (string) OPTIONAL/REQUIRED
//   - origin_postal_code (number)  OPTIONAL/REQUIRED
//   - destination_postal_code (number) OPTIONAL/REQUIRED
//   - origin_latitude/longitude (number) OPTIONAL (for instant delivery)
//   - destination_latitude/longitude (number) OPTIONAL
//   - couriers (string)            REQUIRED — comma-separated courier codes
//   - items (array)                REQUIRED
//     - name (string)              REQUIRED
//     - description (string)       OPTIONAL
//     - value (number)             REQUIRED  ⭐ BUKAN price!
//     - quantity (number)          REQUIRED
//     - weight (number)            REQUIRED (grams)
//     - length/width/height (number) OPTIONAL (cm)
//     - category (string)           OPTIONAL (fashion/food/electronic/dll)
//   - courier_insurance (number)   OPTIONAL
//   - destination_cash_on_delivery (number) OPTIONAL
//   - destination_cash_on_delivery_type (string) OPTIONAL (7_days/5_days/3_days)
//   - type (string)                 OPTIONAL (origin_suggestion_to_closest_destination)
//
// Response fields:
//   - success (boolean)
//   - object (string) = "courier_pricing"
//   - message (string)
//   - code (number)
//   - origin (object) — location info
//   - destination (object) — location info
//   - pricing (array) ⭐ BUKAN rates!
//     - company (string)         e.g., "jne"
//     - courier_name (string)    e.g., "JNE"
//     - courier_code (string)    e.g., "jne"
//     - courier_service_name (string) e.g., "City to City (CTC)"
//     - courier_service_code (string) e.g., "ctc"  ⭐ lowercase
//     - description (string)
//     - duration (string)        e.g., "2 - 3 days"
//     - shipment_duration_range (string) e.g., "2 - 3"
//     - shipment_duration_unit (string) e.g., "days"
//     - service_type (string)    e.g., "standard"
//     - shipping_type (string)   e.g., "parcel"
//     - shipping_fee (number)   base shipping fee
//     - shipping_fee_discount (number)
//     - shipping_fee_surcharge (number)
//     - insurance_fee (number)
//     - cash_on_delivery_fee (number)
//     - price (number)          ⭐ FINAL price including all fees
//     - type (string)            e.g., "ctc"
//     - currency (string)        e.g., "IDR"
// ============================================================================

const BITESHIP_RATES_ENDPOINT = "https://api.biteship.com/v1/rates/couriers";

// ============================================================================
// COURIER WHITELIST — HARDCODED CONFIG
// ============================================================================
interface CourierServiceFilter {
  company_code: string;
  services: string[];
}

const COURIER_WHITELIST: CourierServiceFilter[] = [
  { company_code: "jne",      services: ["REG", "YES"] },     // JNE Regular + Yakin Esok Sampai
  { company_code: "anteraja", services: ["REG"] },             // Anteraja Regular
  { company_code: "jnt",       services: ["EZ"] },              // J&T Express EZ (next day)
  { company_code: "jntcargo", services: ["Standar"] },         // J&T Cargo Standard (heavy packages)
];

// Pre-normalize to lowercase — match case-insensitive dengan Biteship response
const COURIER_WHITELIST_LOWER: CourierServiceFilter[] = COURIER_WHITELIST.map((c) => ({
  company_code: c.company_code.toLowerCase(),
  services: c.services.map((s) => s.toLowerCase()),
}));

// ============================================================================
// CORS + JSON helpers
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// DB OVERRIDE (optional — kalau ada di DB, pakai DB config, else hardcoded)
// ============================================================================
async function getCourierFilterConfigFromDB(): Promise<CourierServiceFilter[] | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("app_settings")
      .select("enabled_courier_services")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.warn("[check-biteship-rates] Failed to fetch app_settings:", error.message);
      return null;
    }

    if (!data) {
      console.log("[check-biteship-rates] app_settings row not found — using hardcoded config");
      return null;
    }

    const courierServices = data.enabled_courier_services;
    if (courierServices === null || courierServices === undefined) {
      console.log("[check-biteship-rates] enabled_courier_services NULL — using hardcoded config");
      return null;
    }

    if (!Array.isArray(courierServices)) {
      console.warn("[check-biteship-rates] enabled_courier_services not array — using hardcoded config");
      return null;
    }

    if (courierServices.length === 0) {
      console.log("[check-biteship-rates] enabled_courier_services = [] — block all couriers");
      return [];
    }

    // Normalize DB config to lowercase
    const normalized = courierServices
      .filter((item: any) => item && item.company_code && Array.isArray(item.services))
      .map((item: any) => ({
        company_code: String(item.company_code).toLowerCase(),
        services: item.services.map((s: string) => String(s).toLowerCase()),
      }));

    if (normalized.length === 0) {
      console.warn("[check-biteship-rates] DB config format invalid — using hardcoded config");
      return null;
    }

    console.log(`[check-biteship-rates] Using DB override config:`, normalized);
    return normalized;
  } catch (err) {
    console.warn("[check-biteship-rates] Exception fetching app_settings:", err?.message);
    return null;
  }
}

// ============================================================================
// FILTER FUNCTION — case-insensitive match by (company_code, service_code)
// ============================================================================
function filterRatesByCourierServices(
  pricing: any[],
  whitelist: CourierServiceFilter[]
): any[] {
  if (whitelist.length === 0) {
    return [];
  }

  return pricing.filter((rate) => {
    // ⭐ CORRECT field names per Biteship docs:
    //   - courier_code (lowercase) — e.g., "jne"
    //   - courier_service_code (lowercase) — e.g., "ctc", "reg", "best"
    const companyCode = String(rate?.courier_code || rate?.company || "").toLowerCase();
    const serviceCode = String(rate?.courier_service_code || rate?.type || "").toLowerCase();

    if (!companyCode || !serviceCode) return false;

    // Find matching courier in whitelist
    const matchingCourier = whitelist.find((cs) => cs.company_code === companyCode);
    if (!matchingCourier) return false;

    return matchingCourier.services.includes(serviceCode);
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Method check ──
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Config check ──
  if (!BITESHIP_API_KEY) {
    console.error("[check-biteship-rates] BITESHIP_API_KEY not set");
    return json({ error: "Server config incomplete (BITESHIP_API_KEY missing)" }, 500);
  }

  if (!BITESHIP_ORIGIN_AREA_ID && !BITESHIP_ORIGIN_POSTAL_CODE) {
    console.error("[check-biteship-rates] BITESHIP_ORIGIN_AREA_ID + POSTAL_CODE both not set");
    return json({ error: "Server config incomplete (origin area not configured)" }, 500);
  }

  // ── Parse body ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const destinationPostalCode = body?.destination_postal_code;
  const destinationAreaId = body?.destination_area_id;
  const items = body?.items;
  const codPrice = body?.cod_price || 0;

  if (!destinationPostalCode && !destinationAreaId) {
    return json({ error: "destination_postal_code or destination_area_id required" }, 400);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return json({ error: "items array required" }, 400);
  }

  console.log(`[check-biteship-rates] Request: dest_postal=${destinationPostalCode}, dest_area=${destinationAreaId}, items=${items.length}`);

  // ── Build Biteship API payload (SESUAI OFFICIAL DOCS) ──
  // ⭐ FIX: items[].value (BUKAN items[].price) — per Biteship docs
  const originAreaId = BITESHIP_ORIGIN_AREA_ID || null;
  const originPostalCode = BITESHIP_ORIGIN_POSTAL_CODE || null;

  // Build couriers string from hardcoded whitelist
  const hardcodedCouriers = COURIER_WHITELIST.map((c) => c.company_code).join(",");
  // Caller can override via body.couriers
  const couriersParam = body?.couriers || hardcodedCouriers;

  const biteshipPayload: any = {
    origin_postal_code: originPostalCode,
    destination_postal_code: destinationPostalCode,
    couriers: couriersParam,  // ⭐ REQUIRED per docs — comma-separated courier codes
    items: items.map((item: any) => ({
      name: item.name || "Item",
      description: item.description || undefined,
      value: Number(item.value || item.price) || 0,  // ⭐ FIX: 'value' (BUKAN 'price')
      quantity: Number(item.quantity) || 1,
      weight: Number(item.weight) || 100,  // grams
      length: item.length ? Number(item.length) : undefined,
      width: item.width ? Number(item.width) : undefined,
      height: item.height ? Number(item.height) : undefined,
      category: item.category || undefined,
    })),
  };

  if (originAreaId) biteshipPayload.origin_area_id = originAreaId;
  if (destinationAreaId) biteshipPayload.destination_area_id = destinationAreaId;
  if (codPrice > 0) {
    biteshipPayload.destination_cash_on_delivery = codPrice;
    biteshipPayload.destination_cash_on_delivery_type = "7_days"; // default 7 days
  }

  // Remove undefined fields (Biteship might reject them)
  Object.keys(biteshipPayload).forEach((key) => {
    if (biteshipPayload[key] === undefined) delete biteshipPayload[key];
  });
  biteshipPayload.items = biteshipPayload.items.map((item: any) => {
    Object.keys(item).forEach((key) => {
      if (item[key] === undefined) delete item[key];
    });
    return item;
  });

  console.log(`[check-biteship-rates] Biteship payload:`, JSON.stringify(biteshipPayload).substring(0, 1000));

  // ── ⭐ CALL BITESHIP POST /v1/rates/couriers (CORRECT URL per docs) ──
  let biteshipPricing: any[] = [];
  try {
    console.log(`[check-biteship-rates] Calling Biteship ${BITESHIP_RATES_ENDPOINT}...`);
    const resp = await fetch(BITESHIP_RATES_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: BITESHIP_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(biteshipPayload),
    });

    const data = await resp.json();
    console.log(`[check-biteship-rates] Biteship HTTP ${resp.status}, response:`,
      JSON.stringify(data).substring(0, 2000));

    if (!resp.ok) {
      // ⭐ Friendly error messages per HTTP status
      let friendlyError = "Biteship API error";
      let hint = "";
      if (resp.status === 404) {
        friendlyError = "Biteship API endpoint not found (404)";
        hint = "URL endpoint salah atau Biteship account gak punya akses. Cek Biteship API documentation di https://biteship.com/en/docs/api/rates/retrieve";
      } else if (resp.status === 401) {
        friendlyError = "Biteship API key invalid (401 Unauthorized)";
        hint = "Cek BITESHIP_API_KEY secret. Production key format: biteship_live.{JWT}";
      } else if (resp.status === 400) {
        friendlyError = "Biteship API bad request (400)";
        hint = `Payload salah. Cek fields: origin_postal_code/area_id, destination_postal_code/area_id, items[].value (BUKAN price), items[].weight, couriers. Error message: ${data?.error || data?.message}`;
      } else if (resp.status === 429) {
        friendlyError = "Biteship API rate limit (429 Too Many Requests)";
        hint = "Biteship rate limit hit — tunggu 1 menit sebelum coba lagi";
      }

      console.error(`[check-biteship-rates] Biteship API error ${resp.status}:`, data);
      return json({
        error: friendlyError,
        debug: {
          status: resp.status,
          message: data?.error?.message || data?.error || data?.message || data,
          biteship_response: data,
        },
        hint,
        sent_payload: biteshipPayload,
      }, resp.status);
    }

    // ⭐ CORRECT response field: data.pricing (BUKAN data.rates)
    biteshipPricing = data?.pricing || data?.rates || data || [];
  } catch (err) {
    console.error("[check-biteship-rates] Network error calling Biteship:", err?.message);
    return json({
      error: "Gagal terhubung ke server Biteship",
      debug: { message: err?.message },
    }, 502);
  }

  if (!Array.isArray(biteshipPricing) || biteshipPricing.length === 0) {
    console.warn("[check-biteship-rates] No pricing returned by Biteship");
    return json({
      success: true,
      rates: [],
      message: "No shipping rates available for this destination",
    });
  }

  console.log(`[check-biteship-rates] Biteship returned ${biteshipPricing.length} pricing options`);
  console.log(`[check-biteship-rates] Sample pricing:`, JSON.stringify(biteshipPricing[0]));

  // ── ⭐ FETCH DB OVERRIDE (optional) ──
  const dbOverride = await getCourierFilterConfigFromDB();
  const activeWhitelist = dbOverride !== null ? dbOverride : COURIER_WHITELIST_LOWER;
  const filterSource = dbOverride !== null ? "db_override" : "hardcoded";

  console.log(`[check-biteship-rates] Filter source: ${filterSource}`);
  console.log(`[check-biteship-rates] Active whitelist:`, activeWhitelist);

  // ── ⭐ APPLY FILTER ──
  const filteredPricing = filterRatesByCourierServices(biteshipPricing, activeWhitelist);

  console.log(`[check-biteship-rates] Filter result: ${biteshipPricing.length} → ${filteredPricing.length} rates`);

  if (filteredPricing.length === 0 && activeWhitelist.length > 0) {
    console.warn(`[check-biteship-rates] ⚠️ All rates filtered out — check whitelist vs Biteship response`);
    console.warn(`[check-biteship-rates] Whitelist:`, activeWhitelist);
    console.warn(`[check-biteship-rates] Biteship sample:`, biteshipPricing.slice(0, 3).map((p) => ({
      courier_code: p?.courier_code || p?.company,
      courier_service_code: p?.courier_service_code || p?.type,
    })));
  }

  // ── ⭐ NORMALIZE OUTPUT (sesuai Biteship response field names) ──
  const normalizedRates = filteredPricing.map((p) => {
    const companyName = p.courier_name || p.company || null;
    const serviceName = p.courier_service_name || p.service || null;
    const companyCode = p.courier_code || (p.company ? p.company.toLowerCase() : null);
    const serviceCode = p.courier_service_code || (p.type ? p.type.toLowerCase() : null);

    // ⭐ NEW: display_name buat frontend gampang show (e.g., "JNE - Reguler")
    // Kalau service ada: "JNE - Reguler"
    // Kalau service gak ada: "JNE"
    let displayName = companyName || "Unknown Courier";
    if (serviceName && serviceName !== displayName) {
      displayName = `${companyName} - ${serviceName}`;
    }

    return {
      // ⭐ NEW field: display_name (combined company + service)
      display_name: displayName,

      // Frontend-friendly field names
      company: companyName,                                          // e.g., "JNE"
      company_code: companyCode,                                    // e.g., "jne"
      service: serviceName,                                         // e.g., "Reguler"
      service_code: serviceCode,                                   // e.g., "reg"

      // ⭐ NEW field: unique_id buat React state key (avoid collision when same company+service_code)
      unique_id: `${companyCode}:${serviceCode}`,

      // Pricing details
      price: Number(p.price) || 0,                                  // ⭐ FINAL price (includes fees)
      shipping_fee: Number(p.shipping_fee) || 0,                   // Base shipping fee
      shipping_fee_discount: Number(p.shipping_fee_discount) || 0,
      shipping_fee_surcharge: Number(p.shipping_fee_surcharge) || 0,
      insurance_fee: Number(p.insurance_fee) || 0,
      cash_on_delivery_fee: Number(p.cash_on_delivery_fee) || 0,

      // Duration
      duration: p.duration || p.shipment_duration_range || null,      // e.g., "2 - 3 days"
      etd: p.shipment_duration_range || p.duration || null,           // e.g., "2 - 3"
      duration_unit: p.shipment_duration_unit || "days",

      // Service metadata
      service_type: p.service_type || null,                            // e.g., "standard"
      shipping_type: p.shipping_type || null,                          // e.g., "parcel"
      description: p.description || null,
      currency: p.currency || "IDR",
      available_for_cash_on_delivery: p.available_for_cash_on_delivery || false,
      available_for_insurance: p.available_for_insurance || false,
      available_for_proof_of_delivery: p.available_for_proof_of_delivery || false,
      type: p.type || null,                                           // e.g., "reg"
    };
  });

  return json({
    success: true,
    rates: normalizedRates,         // ⭐ Field untuk frontend yang baca `rates`
    pricing: normalizedRates,       // ⭐ Field untuk frontend yang baca `pricing` (per Biteship docs)
    total_rates: normalizedRates.length,
    raw_biteship_count: biteshipPricing.length,
    filter_source: filterSource,
    whitelist_count: activeWhitelist.length,
    used_endpoint: BITESHIP_RATES_ENDPOINT,
    // Also include origin Biteship response fields kalau frontend butuh
    origin: biteshipPricing.length > 0 ? "available" : null,
    destination: biteshipPricing.length > 0 ? "available" : null,
  });
});
