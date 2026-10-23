// supabase/functions/test-biteship-network/index.ts
// ============================================================================
// Test Biteship Network — comprehensive diagnostic edge function
// ============================================================================
// Function ini test connectivity ke Biteship API langsung dari Supabase Edge
// Function (bukan dari terminal lu). Cukup buka URL ini di browser:
//
//   https://mbuwpjxpxvnsxjusrnlk.supabase.co/functions/v1/test-biteship-network
//
// Atau via fetch dari browser devtools:
//   fetch('/functions/v1/test-biteship-network').then(r => r.json()).then(console.log)
//
// Tests yang dijalankan:
//   1. GET /v1/couriers          — verify API key valid + Biteship reachable
//   2. POST /v1/rates            — test current edge function URL
//   3. POST /v1/couriers/rates   — test alternative rates endpoint
//   4. POST /v1/shipments/rates  — test third alternative rates endpoint
//
// Plus authentication format tests:
//   5. POST /v1/rates dengan Authorization: Bearer xxx (instead of raw key)
//   6. POST /v1/rates dengan x-biteship-key header
//
// Returns semua hasil dalam satu response JSON. User bisa lihat mana endpoint
// yang sukses + mana yang 404/error.
//
// ENV VARS:
//   - BITESHIP_API_KEY              — required
//   - BITESHIP_ORIGIN_AREA_ID       — for POST /v1/rates test payload
//   - BITESHIP_ORIGIN_POSTAL_CODE   — fallback for origin
//
// Auth: public (no auth required) — deploy with --no-verify-jwt
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY");
const BITESHIP_ORIGIN_AREA_ID = Deno.env.get("BITESHIP_ORIGIN_AREA_ID");
const BITESHIP_ORIGIN_POSTAL_CODE = Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE") || "15121";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// TEST 1: GET /v1/couriers — verify API key valid + Biteship reachable
// ============================================================================
async function testGetCouriers() {
  const startTime = Date.now();
  try {
    const resp = await fetch("https://api.biteship.com/v1/couriers", {
      method: "GET",
      headers: {
        Authorization: BITESHIP_API_KEY || "",
        Accept: "application/json",
      },
    });

    const responseTime = Date.now() - startTime;
    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw_text: text.substring(0, 500) };
    }

    return {
      endpoint: "GET https://api.biteship.com/v1/couriers",
      method: "GET",
      http_status: resp.status,
      http_status_text: resp.statusText,
      response_time_ms: responseTime,
      success: resp.ok,
      auth_format: "Authorization: <raw_api_key>",
      response_summary: resp.ok
        ? `✓ Found ${data?.couriers?.length || 0} couriers`
        : `❌ Error: ${data?.error || data?.message || text.substring(0, 200)}`,
      response_preview: resp.ok
        ? (data?.couriers?.slice(0, 10) || []).map((c: any) => ({
            id: c?.id || c?.company_code,
            name: c?.name || c?.company,
          }))
        : null,
      full_response: data,
    };
  } catch (err) {
    return {
      endpoint: "GET https://api.biteship.com/v1/couriers",
      method: "GET",
      http_status: 0,
      http_status_text: "Network error",
      response_time_ms: Date.now() - startTime,
      success: false,
      auth_format: "Authorization: <raw_api_key>",
      error: err?.message,
      hint: "Supabase edge function gak bisa reach api.biteship.com — cek firewall/network",
    };
  }
}

// ============================================================================
// HELPER: Test POST to a specific URL with given auth header format
// ============================================================================
async function testPostEndpoint(
  endpointUrl: string,
  payload: any,
  authFormat: "raw" | "bearer" | "header" = "raw"
) {
  const startTime = Date.now();

  // Build auth header based on format
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (authFormat === "raw") {
    headers.Authorization = BITESHIP_API_KEY || "";
  } else if (authFormat === "bearer") {
    headers.Authorization = `Bearer ${BITESHIP_API_KEY || ""}`;
  } else if (authFormat === "header") {
    headers["x-biteship-key"] = BITESHIP_API_KEY || "";
  }

  const authHeaderLabel =
    authFormat === "raw" ? `Authorization: <raw_key>` :
    authFormat === "bearer" ? `Authorization: Bearer <key>` :
    `x-biteship-key: <key>`;

  try {
    const resp = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseTime = Date.now() - startTime;
    const text = await resp.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw_text: text.substring(0, 500) };
    }

    return {
      endpoint: `POST ${endpointUrl}`,
      method: "POST",
      auth_format: authHeaderLabel,
      http_status: resp.status,
      http_status_text: resp.statusText,
      response_time_ms: responseTime,
      success: resp.ok,
      response_summary: resp.ok
        ? `✓ Got ${data?.rates?.length || 0} rates from Biteship`
        : `❌ Error: ${data?.error?.message || data?.error || data?.message || text.substring(0, 200)}`,
      response_preview: resp.ok
        ? (data?.rates || []).slice(0, 5).map((r: any) => ({
            company: r?.company || r?.company_name,
            company_code: r?.company_code,
            service: r?.service || r?.service_name,
            service_code: r?.service_code,
            price: r?.price,
            duration: r?.duration || r?.etd,
          }))
        : null,
      full_response: data,
    };
  } catch (err) {
    return {
      endpoint: `POST ${endpointUrl}`,
      method: "POST",
      auth_format: authHeaderLabel,
      http_status: 0,
      http_status_text: "Network error",
      response_time_ms: Date.now() - startTime,
      success: false,
      error: err?.message,
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ============================================================================
  // CONFIG CHECK — verify env vars are set
  // ============================================================================
  const configCheck = {
    BITESHIP_API_KEY: BITESHIP_API_KEY
      ? `✓ Set (${BITESHIP_API_KEY.substring(0, 10)}...${BITESHIP_API_KEY.substring(BITESHIP_API_KEY.length - 5)})`
      : "❌ NOT SET — run: supabase secrets set BITESHIP_API_KEY=xxx",
    BITESHIP_API_KEY_format_check: BITESHIP_API_KEY
      ? (BITESHIP_API_KEY.startsWith("test_") || BITESHIP_API_KEY.includes("sandbox")
        ? "⚠️ Looks like SANDBOX key (has test_/sandbox prefix)"
        : BITESHIP_API_KEY.startsWith("sk_")
        ? "✓ Looks like production key (starts with sk_)"
        : "ℹ️ Unknown format (no recognized prefix)")
      : "N/A",
    BITESHIP_API_KEY_length: BITESHIP_API_KEY ? BITESHIP_API_KEY.length : 0,
    BITESHIP_ORIGIN_AREA_ID: BITESHIP_ORIGIN_AREA_ID
      ? `✓ Set (${BITESHIP_ORIGIN_AREA_ID.substring(0, 20)}...)`
      : "⚠️ NOT SET",
    BITESHIP_ORIGIN_POSTAL_CODE: BITESHIP_ORIGIN_POSTAL_CODE
      ? `✓ Set (${BITESHIP_ORIGIN_POSTAL_CODE})`
      : "⚠️ NOT SET (using default 15121 for tests)",
  };

  // Kalau BITESHIP_API_KEY gak set, return early
  if (!BITESHIP_API_KEY) {
    return json({
      success: false,
      message: "BITESHIP_API_KEY env var not set",
      config_check: configCheck,
      hint: "Run: supabase secrets set BITESHIP_API_KEY=xxx, then re-deploy this function",
    }, 500);
  }

  // ============================================================================
  // TEST PAYLOAD — origin + destination beda (valid shipping route)
  // ============================================================================
  const testPayload = {
    origin_postal_code: BITESHIP_ORIGIN_POSTAL_CODE,
    destination_postal_code: "10210",  // Jakarta Pusat — beda dari origin
    couriers: "jne,jnt,anteraja,jntcargo",
    items: [
      {
        name: "Test Item",
        weight: 100,  // grams
        quantity: 1,
        price: 10000,
      },
    ],
    ...(BITESHIP_ORIGIN_AREA_ID && { origin_area_id: BITESHIP_ORIGIN_AREA_ID }),
  };

  // ============================================================================
  // RUN ALL TESTS
  // ============================================================================
  console.log("[test-biteship-network] Running all tests...");

  // Test 1: GET /v1/couriers — verify API key valid + Biteship reachable
  console.log("[test-biteship-network] Test 1: GET /v1/couriers");
  const test1_get_couriers = await testGetCouriers();

  // Test 2: POST /v1/rates (raw auth) — current edge function URL
  console.log("[test-biteship-network] Test 2: POST /v1/rates (raw auth)");
  const test2_post_v1_rates_raw = await testPostEndpoint(
    "https://api.biteship.com/v1/rates",
    testPayload,
    "raw"
  );

  // Test 3: POST /v1/couriers/rates (raw auth)
  console.log("[test-biteship-network] Test 3: POST /v1/couriers/rates (raw auth)");
  const test3_post_v1_couriers_rates = await testPostEndpoint(
    "https://api.biteship.com/v1/couriers/rates",
    testPayload,
    "raw"
  );

  // Test 4: POST /v1/shipments/rates (raw auth)
  console.log("[test-biteship-network] Test 4: POST /v1/shipments/rates (raw auth)");
  const test4_post_v1_shipments_rates = await testPostEndpoint(
    "https://api.biteship.com/v1/shipments/rates",
    testPayload,
    "raw"
  );

  // Test 5: POST /v1/rates dengan Bearer auth format (alternatif auth)
  console.log("[test-biteship-network] Test 5: POST /v1/rates (Bearer auth)");
  const test5_post_v1_rates_bearer = await testPostEndpoint(
    "https://api.biteship.com/v1/rates",
    testPayload,
    "bearer"
  );

  // Test 6: POST /v1/rates dengan x-biteship-key header (alternatif auth)
  console.log("[test-biteship-network] Test 6: POST /v1/rates (x-biteship-key header)");
  const test6_post_v1_rates_header = await testPostEndpoint(
    "https://api.biteship.com/v1/rates",
    testPayload,
    "header"
  );

  // ============================================================================
  // SUMMARY — diagnose based on test results
  // ============================================================================
  const api_key_valid = test1_get_couriers.success;
  const any_rates_endpoint_works =
    test2_post_v1_rates_raw.success ||
    test3_post_v1_couriers_rates.success ||
    test4_post_v1_shipments_rates.success;
  const any_auth_format_works =
    test2_post_v1_rates_raw.success ||
    test5_post_v1_rates_bearer.success ||
    test6_post_v1_rates_header.success;

  let diagnosis = "";
  let recommendation = "";
  let working_endpoint = "❌ None";

  if (test2_post_v1_rates_raw.success) {
    working_endpoint = "POST /v1/rates (raw auth) ✅";
    diagnosis = "✅ /v1/rates endpoint works with raw Authorization header. Edge function check-biteship-rates should work.";
    recommendation = "Re-deploy check-biteship-rates edge function (current code should work). If still 404, check payload format.";
  } else if (test3_post_v1_couriers_rates.success) {
    working_endpoint = "POST /v1/couriers/rates ✅";
    diagnosis = "⚠️ /v1/rates returns 404, but /v1/couriers/rates works. Biteship changed endpoint URL structure.";
    recommendation = "Update check-biteship-rates edge function: ganti URL dari /v1/rates ke /v1/couriers/rates. Re-deploy.";
  } else if (test4_post_v1_shipments_rates.success) {
    working_endpoint = "POST /v1/shipments/rates ✅";
    diagnosis = "⚠️ /v1/rates returns 404, but /v1/shipments/rates works. Biteship changed endpoint URL structure.";
    recommendation = "Update check-biteship-rates edge function: ganti URL dari /v1/rates ke /v1/shipments/rates. Re-deploy.";
  } else if (test5_post_v1_rates_bearer.success) {
    working_endpoint = "POST /v1/rates (Bearer auth) ✅";
    diagnosis = "⚠️ /v1/rates works but requires Bearer auth format (Authorization: Bearer xxx), not raw key.";
    recommendation = "Update check-biteship-rates edge function: change auth header dari `Authorization: <key>` ke `Authorization: Bearer <key>`. Re-deploy.";
  } else if (test6_post_v1_rates_header.success) {
    working_endpoint = "POST /v1/rates (x-biteship-key header) ✅";
    diagnosis = "⚠️ /v1/rates works but requires x-biteship-key header instead of Authorization.";
    recommendation = "Update check-biteship-rates edge function: change auth dari Authorization ke x-biteship-key header. Re-deploy.";
  } else if (!api_key_valid) {
    if (test1_get_couriers.http_status === 401) {
      diagnosis = "❌ API key invalid (401 Unauthorized). Biteship reject key entirely.";
      recommendation = "Generate new API key dari Biteship dashboard → Profile → API Keys. Update secret: supabase secrets set BITESHIP_API_KEY=new_key";
    } else if (test1_get_couriers.http_status === 404) {
      diagnosis = "❌ Biteship account gak punya akses ke API sama sekali (GET /v1/couriers returns 404).";
      recommendation = "Contact Biteship support (support@biteship.com / WA: 0811-9466-9466). Mungkin account belum activated atau billing issue.";
    } else {
      diagnosis = `❌ GET /v1/couriers failed with status ${test1_get_couriers.http_status}.`;
      recommendation = "Cek Biteship dashboard → Profile → Account Status. Verify account is Active (not Trial/Suspended).";
    }
  } else {
    diagnosis = "❌ API key valid (GET /v1/couriers 200), tapi semua POST rates endpoints return 404. Biteship account tier gak punya akses ke rates API.";
    recommendation = "Contact Biteship support: 'API key saya valid (GET /v1/couriers 200), tapi POST /v1/rates return 404 Route not found. Apakah account saya butuh upgrade tier atau permission tambahan buat akses rates API?'";
  }

  const summary = {
    api_key_valid: api_key_valid,
    api_key_format_check: configCheck.BITESHIP_API_KEY_format_check,
    any_rates_endpoint_works: any_rates_endpoint_works,
    any_auth_format_works: any_auth_format_works,
    working_rates_endpoint: working_endpoint,
    diagnosis: diagnosis,
    recommendation: recommendation,
  };

  // ============================================================================
  // RETURN COMPREHENSIVE RESPONSE
  // ============================================================================
  return json({
    success: api_key_valid && (any_rates_endpoint_works || any_auth_format_works),
    timestamp: new Date().toISOString(),
    config_check: configCheck,
    summary: summary,
    test_payload: testPayload,
    tests: {
      test_1_get_couriers_verify_api_key: test1_get_couriers,
      test_2_post_v1_rates_raw_auth: test2_post_v1_rates_raw,
      test_3_post_v1_couriers_rates: test3_post_v1_couriers_rates,
      test_4_post_v1_shipments_rates: test4_post_v1_shipments_rates,
      test_5_post_v1_rates_bearer_auth: test5_post_v1_rates_bearer,
      test_6_post_v1_rates_x_biteship_key_header: test6_post_v1_rates_header,
    },
    next_steps: recommendation ? [
      recommendation,
      "Setelah fix, test checkout lagi untuk verify shipping rates muncul.",
    ] : [
      "Contact Biteship support dengan detail di atas.",
      "Cek Biteship dashboard → API documentation untuk current endpoint URL.",
    ],
    contact_biteship: {
      email: "support@biteship.com",
      whatsapp: "0811-9466-9466",
      live_chat: "https://app.biteship.com (jam kerja)",
      message_template: `Hi Biteship Support,\n\n` +
        `I'm getting 404 "Route not found" when calling POST /v1/rates endpoint, ` +
        `but my API key is valid (GET /v1/couriers returns 200 with couriers list).\n\n` +
        `My account details:\n- API key prefix: ${BITESHIP_API_KEY.substring(0, 5)}...\n` +
        `- I can access: GET /v1/trackings/{id}, POST /v1/orders/{id}/generate_waybill\n` +
        `- I cannot access: POST /v1/rates (404 Route not found)\n\n` +
        `Does my account need upgrade tier or additional permission to access rates API?`,
    },
  });
});
