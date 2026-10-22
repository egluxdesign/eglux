// supabase/functions/check-biteship-rates/index.ts
// ============================================================================
// Check Biteship Rates v3.0 — CLEAN REWRITE dengan hardcoded courier whitelist
// ============================================================================
// ⭐ v3.0 CHANGES (dari v2.1):
//   - Hardcode courier whitelist di edge function code (simpler, no DB query needed)
//   - Filter logic simpler — direct filter without DB fetch
//   - Optional DB override: kalau `enabled_courier_services` di app_settings
//     SET, pakai DB config. Else pakai hardcoded COURIER_WHITELIST.
//   - Single filter function (cleaner than v2.1 dual logic)
//
// ⭐ v2.1 (previous): Filter by JSONB `enabled_courier_services` dari DB
// ⭐ v2.0 (previous): Filter by TEXT[] `enabled_couriers` dari DB
//
// COURIER WHITELIST (sesuai config EGLUX):
//   jne      = REG + YES   (Regular + Yakin Esok Sampai)
//   anteraja = REG         (Regular)
//   jnt      = EZ          (Eazy, next day)
//   jntcargo = Standar     (J&T Cargo Standard)
//
// ENV VARS:
//   - SUPABASE_URL               (auto-set)
//   - SUPABASE_SERVICE_ROLE_KEY  (auto-set) — for DB override fetch (optional)
//   - BITESHIP_API_KEY           (supabase secrets set BITESHIP_API_KEY=xxx)
//   - BITESHIP_ORIGIN_AREA_ID    (supabase secrets set BITESHIP_ORIGIN_AREA_ID=xxx)
//   - BITESHIP_ORIGIN_POSTAL_CODE (optional fallback)
//
// INPUT (POST body):
//   {
//     "destination_postal_code": "10210",
//     "destination_area_id": "xxx" (optional),
//     "items": [{ "name": "Product", "weight": 500, "quantity": 2, "price": 50000 }],
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
//     "raw_biteship_count": 12,
//     "filter_source": "hardcoded" | "db_override"
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
// ⭐ COURIER WHITELIST — HARDCODED CONFIG
// ============================================================================
// Config courier yang lu pilih (sesuai DB app_settings.enabled_courier_services).
// Kalau mau ubah, edit array ini + redeploy edge function.
//
// Alternative: kalau `enabled_courier_services` di DB ada, bakal override
// hardcoded ini (lihat function getCourierFilterConfigFromDB di bawah).
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
/**
 * Fetch courier config dari app_settings table (DB override).
 *
 * Return:
 *   - null  → pakai hardcoded COURIER_WHITELIST
 *   - []    → block all (matikan shipping)
 *   - array → pakai DB config (override hardcoded)
 */
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
      return null; // Fallback to hardcoded
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
    return null; // Fallback to hardcoded
  }
}

// ============================================================================
// FILTER FUNCTION — case-insensitive match by (company_code, service_code)
// ============================================================================
function filterRatesByCourierServices(
  rates: any[],
  whitelist: CourierServiceFilter[]
): any[] {
  if (whitelist.length === 0) {
    // Empty whitelist = block all
    return [];
  }

  return rates.filter((rate) => {
    // Biteship response fields:
    //   - company_code OR company (e.g., "jne" or "JNE")
    //   - service_code OR service (e.g., "reg" or "REG")
    const companyCode = String(rate?.company_code || rate?.company || "").toLowerCase();
    const serviceCode = String(rate?.service_code || rate?.service || "").toLowerCase();

    if (!companyCode || !serviceCode) return false;

    // Find matching courier in whitelist
    const matchingCourier = whitelist.find((cs) => cs.company_code === companyCode);
    if (!matchingCourier) return false;

    // Check if service is in the courier's services whitelist
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

  // ── Build Biteship API payload ──
  const originAreaId = BITESHIP_ORIGIN_AREA_ID || null;
  const originPostalCode = BITESHIP_ORIGIN_POSTAL_CODE || null;

  const biteshipPayload: any = {
    origin_postal_code: originPostalCode,
    destination_postal_code: destinationPostalCode,
    items: items.map((item: any) => ({
      name: item.name || "Item",
      weight: Number(item.weight) || 100, // grams
      quantity: Number(item.quantity) || 1,
      price: Number(item.price) || 0,
    })),
  };

  if (originAreaId) biteshipPayload.origin_area_id = originAreaId;
  if (destinationAreaId) biteshipPayload.destination_area_id = destinationAreaId;
  if (codPrice > 0) biteshipPayload.cod_price = codPrice;

  // ── Call Biteship POST /v1/rates ──
  let biteshipRates: any[] = [];
  try {
    console.log("[check-biteship-rates] Calling Biteship /v1/rates...");
    const resp = await fetch("https://api.biteship.com/v1/rates", {
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
      JSON.stringify(data).substring(0, 1500));

    if (!resp.ok) {
      return json({
        error: "Biteship API error",
        debug: {
          status: resp.status,
          message: data?.error?.message || data?.error || data,
        },
      }, resp.status);
    }

    biteshipRates = data?.rates || data || [];
  } catch (err) {
    console.error("[check-biteship-rates] Network error calling Biteship:", err?.message);
    return json({
      error: "Gagal terhubung ke server Biteship",
      debug: { message: err?.message },
    }, 502);
  }

  if (!Array.isArray(biteshipRates) || biteshipRates.length === 0) {
    console.warn("[check-biteship-rates] No rates returned by Biteship");
    return json({
      success: true,
      rates: [],
      message: "No shipping rates available for this destination",
    });
  }

  console.log(`[check-biteship-rates] Biteship returned ${biteshipRates.length} rates`);
  console.log(`[check-biteship-rates] Sample rate:`, JSON.stringify(biteshipRates[0]));

  // ── ⭐ FETCH DB OVERRIDE (optional) ──
  // Kalau ada config di DB (enabled_courier_services), pakai DB.
  // Else pakai hardcoded COURIER_WHITELIST_LOWER.
  const dbOverride = await getCourierFilterConfigFromDB();
  const activeWhitelist = dbOverride !== null ? dbOverride : COURIER_WHITELIST_LOWER;
  const filterSource = dbOverride !== null ? "db_override" : "hardcoded";

  console.log(`[check-biteship-rates] Filter source: ${filterSource}`);
  console.log(`[check-biteship-rates] Active whitelist:`, activeWhitelist);

  // ── ⭐ APPLY FILTER ──
  const filteredRates = filterRatesByCourierServices(biteshipRates, activeWhitelist);

  console.log(`[check-biteship-rates] Filter result: ${biteshipRates.length} → ${filteredRates.length} rates`);

  if (filteredRates.length === 0 && activeWhitelist.length > 0) {
    console.warn(`[check-biteship-rates] ⚠️ All rates filtered out — check whitelist vs Biteship response`);
    console.warn(`[check-biteship-rates] Whitelist:`, activeWhitelist);
    console.warn(`[check-biteship-rates] Biteship sample:`, biteshipRates.slice(0, 3).map(r => ({
      company_code: r?.company_code || r?.company,
      service_code: r?.service_code || r?.service,
    })));
  }

  // ── Normalize output format ──
  // Standard fields frontend expect: company, company_code, service, service_code, price, duration, etd
  const normalizedRates = filteredRates.map((rate) => ({
    company: rate.company || rate.company_name || null,
    company_code: rate.company_code || (rate.company ? rate.company.toLowerCase() : null),
    service: rate.service || rate.service_name || null,
    service_code: rate.service_code || (rate.service ? rate.service.toLowerCase() : null),
    price: Number(rate.price) || 0,
    duration: rate.duration || rate.etd || null,
    etd: rate.etd || rate.duration || null,
    note: rate.note || null,
  }));

  return json({
    success: true,
    rates: normalizedRates,
    total_rates: normalizedRates.length,
    raw_biteship_count: biteshipRates.length,
    filter_source: filterSource,
    whitelist_count: activeWhitelist.length,
  });
});
