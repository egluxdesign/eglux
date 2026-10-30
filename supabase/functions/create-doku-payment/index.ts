// create-doku-payment/index.ts
// ============================================================================
// Edge function: generate DOKU Checkout payment session
// Returns: { payment_url, invoice_number, token_id, expired_date }
//
// Required Supabase secrets:
//   DOKU_CLIENT_ID     e.g. BRN-0287-1793256156382
//   DOKU_SECRET_KEY    e.g. SK-En***...
//   DOKU_BASE_URL      https://api-sandbox.doku.com (sandbox)
//                      https://api.doku.com (production)
//   STOREFRONT_URL     e.g. https://eglux.co.id
//   SUPABASE_URL       auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected
//
// DOKU Checkout API (Non-SNAP):
//   POST {DOKU_BASE_URL}/checkout/v1/payment
//   Headers: Client-Id, Request-Id, Request-Timestamp, Signature
//
// Signature generation:
//   Component = "Client-Id:{cid}\nRequest-Id:{rid}\nRequest-Timestamp:{ts}\nRequest-Target:{path}\nDigest:{base64(sha256(body))"
//   Signature = "HMACSHA256=" + base64(hmac-sha256(secret_key, component))
//
// v2 CHANGES:
//   - Verbose console logging for every request + response
//   - Auto-retry WITHOUT payment_method_types if first attempt fails with "not activated"
//   - Better error extraction (handle different DOKU error formats)
//   - Return full debug info to frontend for diagnosis
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ============================================================================
// Crypto helpers (Deno native Web Crypto API)
// ============================================================================

async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64Encode(new Uint8Array(hash));
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64Encode(new Uint8Array(sig));
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as unknown as { randomUUID: () => string }).randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function utcTimestamp(): string {
  // ISO8601 UTC, e.g. 2026-10-29T07:30:00Z (no milliseconds)
  return new Date().toISOString().split(".")[0] + "Z";
}

// ============================================================================
// DOKU Signature (Non-SNAP format)
// ============================================================================

async function buildDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  bodyStr: string,
  secretKey: string
): Promise<{ signature: string; digest: string; component: string }> {
  const digest = await sha256Base64(bodyStr);
  const component =
    `Client-Id:${clientId}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${requestTimestamp}\n` +
    `Request-Target:${requestTarget}\n` +
    `Digest:${digest}`;
  const sig = await hmacSha256Base64(secretKey, component);
  return {
    signature: `HMACSHA256=${sig}`,
    digest,
    component,
  };
}

// ============================================================================
// Main handler
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Read environment ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SUPABASE_PROJECT_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("DOKU_CLIENT_ID");
  const secretKey = Deno.env.get("DOKU_SECRET_KEY");
  const baseUrl = Deno.env.get("DOKU_BASE_URL") || "https://api-sandbox.doku.com";
  const storefrontUrl = Deno.env.get("STOREFRONT_URL") || "https://eglux.co.id";

  console.log("[DOKU] === NEW REQUEST ===");
  console.log("[DOKU] Env check:", {
    clientId: clientId ? `${clientId.slice(0, 10)}...` : "MISSING",
    secretKey: secretKey ? `${secretKey.slice(0, 6)}...${secretKey.slice(-4)}` : "MISSING",
    baseUrl,
    storefrontUrl,
    supabaseUrl: supabaseUrl ? "set" : "missing",
    serviceKey: serviceKey ? "set" : "missing",
  });

  if (!clientId || !secretKey) {
    return json({
      error: "DOKU credentials not set",
      missing: { clientId: !clientId, secretKey: !secretKey },
      hint: "Run: supabase secrets set DOKU_CLIENT_ID=... DOKU_SECRET_KEY=... DOKU_BASE_URL=https://api.doku.com",
    }, 500);
  }

  // ── Parse request body ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  console.log("[DOKU] Incoming payload:", {
    order_id: body.order_id,
    amount: body.amount,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone,
    customer_email: body.customer_email,
    line_items_count: body.line_items?.length,
    payment_method_types: body.payment_method_types,
  });

  // ── Validate required fields ──
  const required = ["order_id", "amount", "customer_name", "customer_phone", "line_items"];
  for (const f of required) {
    if (!body[f]) {
      console.error(`[DOKU] Missing field: ${f}`);
      return json({ error: `Missing field: ${f}` }, 400);
    }
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`[DOKU] Invalid amount: ${body.amount}`);
    return json({ error: "amount must be a positive number", received: body.amount }, 400);
  }

  // ── Build order + customer + line_items ──
  const orderId = String(body.order_id);
  const invoiceNumber = body.invoice_number || buildInvoiceNumber(orderId);

  console.log("[DOKU] Generated invoice_number:", invoiceNumber, "(length:", invoiceNumber.length, ")");

  const customer = {
    id: body.customer_id ? String(body.customer_id) : `EGLUX-${orderId.slice(0, 20)}`,
    name: String(body.customer_name || "").slice(0, 50),
    last_name: String(body.customer_last_name || "").slice(0, 16),
    phone: normalizePhone(body.customer_phone),
    email: String(body.customer_email || "").slice(0, 128),
    address: String(body.customer_address || "").slice(0, 400),
    postcode: String(body.customer_postcode || "").slice(0, 10),
    city: String(body.customer_city || "").slice(0, 50),
    state: String(body.customer_state || "").slice(0, 50),
    country: "ID",
  };

  const shippingAddress = body.shipping_address ? {
    first_name: String(body.shipping_address.first_name || body.customer_name || "").slice(0, 50),
    last_name: String(body.shipping_address.last_name || "").slice(0, 50),
    address: String(body.shipping_address.address || "").slice(0, 255),
    city: String(body.shipping_address.city || "").slice(0, 50),
    postal_code: String(body.shipping_address.postal_code || "").slice(0, 10),
    phone: normalizePhone(body.shipping_address.phone || body.customer_phone),
    country_code: "IDN",
  } : undefined;

  const lineItems = (body.line_items as any[]).map((it, i) => ({
    id: String(it.id || `ITEM-${i + 1}`).slice(0, 64),
    name: String(it.name || "Item").slice(0, 255),
    quantity: Number(it.quantity || 1),
    price: Number(it.price || 0),
    sku: String(it.sku || "").slice(0, 64),
    category: String(it.category || "retail").slice(0, 100),
  }));

  // ── Build callback URLs ──
  const callbackUrl = `${storefrontUrl}/payment-success`;
  const callbackUrlCancel = `${storefrontUrl}/payment-failed`;
  const callbackUrlResult = `${storefrontUrl}/payment-success`;

  // ── Build DOKU request body ──
  const dokuBody: any = {
    order: {
      amount: Math.round(amount),
      invoice_number: invoiceNumber,
      currency: "IDR",
      callback_url: callbackUrl,
      callback_url_cancel: callbackUrlCancel,
      callback_url_result: callbackUrlResult,
      language: "EN",
      auto_redirect: true,
      disable_retry_payment: false,
      line_items: lineItems,
    },
    payment: {
      payment_due_date: 60,
      payment_method_types: body.payment_method_types || defaultPaymentMethods(),
    },
    customer,
    additional_info: {},
  };

  if (shippingAddress) dokuBody.shipping_address = shippingAddress;
  if (body.billing_address) dokuBody.billing_address = {
    first_name: String(body.billing_address.first_name || "").slice(0, 50),
    last_name: String(body.billing_address.last_name || "").slice(0, 50),
    address: String(body.billing_address.address || "").slice(0, 255),
    city: String(body.billing_address.city || "").slice(0, 50),
    postal_code: String(body.billing_address.postal_code || "").slice(0, 10),
    phone: normalizePhone(body.billing_address.phone || body.customer_phone),
    country_code: "IDN",
  };

  // Collect customer email on checkout page if not provided
  if (!customer.email) {
    dokuBody.collect_customer = { name: false, email: true, phone: false, address: false };
  }

  // Compact JSON string — used BOTH for Digest AND fetch body
  const bodyStr = JSON.stringify(dokuBody);

  console.log("[DOKU] Built DOKU body (compact JSON):", bodyStr.slice(0, 800));
  console.log("[DOKU] Body length:", bodyStr.length, "chars");

  // ── First attempt: with payment_method_types ──
  let result = await sendDokuRequest(
    baseUrl, clientId, secretKey, bodyStr, dokuBody, orderId, invoiceNumber,
    Math.round(amount), supabaseUrl, serviceKey
  );

  // ── Auto-retry WITHOUT payment_method_types if "not activated" error ──
  if (!result.success && result.shouldRetryWithoutMethods) {
    console.log("[DOKU] Retrying WITHOUT payment_method_types (let DOKU show all available)...");
    const dokuBodyRetry = { ...dokuBody };
    dokuBodyRetry.payment = { payment_due_date: 60 };
    const retryBodyStr = JSON.stringify(dokuBodyRetry);

    result = await sendDokuRequest(
      baseUrl, clientId, secretKey, retryBodyStr, dokuBodyRetry, orderId, invoiceNumber,
      Math.round(amount), supabaseUrl, serviceKey
    );
  }

  return result.response;
});

// ============================================================================
// sendDokuRequest — sends POST to DOKU API + handles response
// ============================================================================

async function sendDokuRequest(
  baseUrl: string,
  clientId: string,
  secretKey: string,
  bodyStr: string,
  dokuBody: any,
  orderId: string,
  invoiceNumber: string,
  amount: number,
  supabaseUrl: string | undefined,
  serviceKey: string | undefined
): Promise<{ success: boolean; response: Response; shouldRetryWithoutMethods: boolean }> {
  // Generate signature
  const requestId = uuid();
  const requestTimestamp = utcTimestamp();
  const requestTarget = "/checkout/v1/payment";

  const { signature, digest, component } = await buildDokuSignature(
    clientId, requestId, requestTimestamp, requestTarget, bodyStr, secretKey
  );

  const headers: Record<string, string> = {
    "Client-Id": clientId,
    "Request-Id": requestId,
    "Request-Timestamp": requestTimestamp,
    "Signature": signature,
    "Content-Type": "application/json",
  };

  console.log("[DOKU] === SENDING REQUEST ===");
  console.log("[DOKU] URL:", `${baseUrl}/checkout/v1/payment`);
  console.log("[DOKU] Headers:");
  console.log("  Client-Id:", clientId);
  console.log("  Request-Id:", requestId);
  console.log("  Request-Timestamp:", requestTimestamp);
  console.log("  Signature:", signature);
  console.log("[DOKU] Signature Component (for manual verification):");
  console.log(component);
  console.log("[DOKU] Digest:", digest);

  // POST to DOKU
  let dokuStatus: number;
  let dokuText: string;
  let dokuResponse: any;

  try {
    const resp = await fetch(`${baseUrl}/checkout/v1/payment`, {
      method: "POST",
      headers,
      body: bodyStr,
    });
    dokuStatus = resp.status;
    dokuText = await resp.text();

    console.log("[DOKU] === RESPONSE ===");
    console.log("[DOKU] HTTP status:", dokuStatus);
    console.log("[DOKU] Response body (first 1500 chars):", dokuText.slice(0, 1500));

    try {
      dokuResponse = JSON.parse(dokuText);
    } catch {
      dokuResponse = { raw: dokuText };
    }
  } catch (e) {
    console.error("[DOKU] Fetch exception:", String(e));
    return {
      success: false,
      shouldRetryWithoutMethods: false,
      response: json({
        success: false,
        error: "DOKU fetch failed",
        detail: String(e),
      }, 502),
    };
  }

  // ── Success: return payment.url + persist ──
  if (dokuStatus === 200 && dokuResponse?.response?.payment?.url) {
    const paymentUrl = dokuResponse.response.payment.url;
    const tokenId = dokuResponse.response.payment.token_id;
    const expiredDate = dokuResponse.response.payment.expired_date;
    const sessionId = dokuResponse.response.order?.session_id;

    console.log("[DOKU] ✓ SUCCESS! payment_url:", paymentUrl);

    // Persist to database (best-effort)
    if (supabaseUrl && serviceKey) {
      try {
        const supabase = createClient(supabaseUrl, serviceKey);
        await supabase.from("order_payments").upsert({
          order_id: orderId,
          provider: "doku",
          invoice_number: invoiceNumber,
          token_id: tokenId,
          session_id: sessionId,
          payment_url: paymentUrl,
          expired_date: expiredDate,
          amount,
          status: "pending",
          request_id: requestId,
          created_at: new Date().toISOString(),
        });
        console.log("[DOKU] DB upsert ✓");
      } catch (e) {
        console.warn("[DOKU] DB write failed (non-fatal):", e);
      }
    }

    return {
      success: true,
      shouldRetryWithoutMethods: false,
      response: json({
        success: true,
        payment_url: paymentUrl,
        invoice_number: invoiceNumber,
        token_id: tokenId,
        session_id: sessionId,
        expired_date: expiredDate,
      }),
    };
  }

  // ── Failed: extract error message + decide if retry ──
  console.error("[DOKU] ✗ REQUEST FAILED");
  console.error("[DOKU] Status:", dokuStatus);
  console.error("[DOKU] Response:", JSON.stringify(dokuResponse, null, 2));
  
  // Extract error message from various possible formats
  let errorMessage = "";
  if (Array.isArray(dokuResponse?.error_messages) && dokuResponse.error_messages.length > 0) {
    errorMessage = dokuResponse.error_messages.join(", ");
  } else if (Array.isArray(dokuResponse?.message) && dokuResponse.message.length > 0) {
    errorMessage = dokuResponse.message.join(", ");
  } else if (typeof dokuResponse?.message === "string") {
    errorMessage = dokuResponse.message;
  } else if (typeof dokuResponse?.error === "string") {
    errorMessage = dokuResponse.error;
  } else if (typeof dokuResponse?.raw === "string") {
    errorMessage = dokuResponse.raw;
  } else {
    errorMessage = `DOKU request failed (HTTP ${dokuStatus})`;
  }

  // Check if error is about payment method not activated → retry without methods
  const errorLower = (errorMessage + " " + dokuText).toLowerCase();
  const shouldRetry = (
    errorLower.includes("not activated") ||
    errorLower.includes("not active") ||
    errorLower.includes("payment_method_types") ||
    errorLower.includes("payment method") && errorLower.includes("invalid")
  );

  console.log("[DOKU] Should retry without methods?", shouldRetry);
  console.log("[DOKU] Extracted error message:", errorMessage);

  // If retrying, don't return error yet
  if (shouldRetry) {
    return {
      success: false,
      shouldRetryWithoutMethods: true,
      response: json({ success: false, error: "retrying" }, 400), // placeholder, will be retried
    };
  }

  // ── Return detailed error to frontend ──
  return {
    success: false,
    shouldRetryWithoutMethods: false,
    response: json({
      success: false,
      status: dokuStatus,
      error: errorMessage,
      raw: dokuResponse,
      raw_text: dokuText.slice(0, 2000),
      signature_debug: {
        request_id: requestId,
        request_timestamp: requestTimestamp,
        request_target: requestTarget,
        client_id: clientId,
        base_url: baseUrl,
        digest: digest,
        signature: signature,
        component: component,
        body_preview: bodyStr.slice(0, 500),
        body_length: bodyStr.length,
      },
      diagnosis: diagnoseError(dokuStatus, errorMessage),
    }, 400),
  };
}

// ============================================================================
// diagnoseError — map HTTP status + message to actionable hint
// ============================================================================

function diagnoseError(status: number, message: string): string {
  const msg = message.toLowerCase();

  if (status === 401) {
    return "Signature verification FAILED. Check: (1) DOKU_SECRET_KEY matches environment (sandbox vs production), (2) DOKU_BASE_URL matches credentials, (3) clock skew — Request-Timestamp must be current UTC.";
  }
  if (status === 403) {
    if (msg.includes("settlement") || msg.includes("not allowed")) {
      return "Account restriction: Settlement not configured. Go to DOKU Dashboard → Settings → Account → Bank Account + Approval to activate settlement.";
    }
    return "Forbidden: Account may not be approved yet, or this payment method is not enabled for your account.";
  }
  if (status === 400) {
    if (msg.includes("not activated") || msg.includes("not active")) {
      return "Payment method not activated. Go to DOKU Dashboard → Settings → Payment Settings → activate the channel.";
    }
    if (msg.includes("invoice_number")) {
      return "Invoice number issue. Check length (max 64 chars, 30 if credit card active) and uniqueness.";
    }
    if (msg.includes("amount")) {
      return "Amount issue. Must be positive integer in IDR (no decimals).";
    }
    return "Bad request: " + message;
  }
  if (status === 404) {
    return "Endpoint not found. Check DOKU_BASE_URL is correct (https://api.doku.com for production, https://api-sandbox.doku.com for sandbox).";
  }
  if (status >= 500) {
    return "DOKU server error. Retry later or contact DOKU support.";
  }
  return `HTTP ${status}: ${message}`;
}

// ============================================================================
// Helpers
// ============================================================================

function buildInvoiceNumber(orderId: string): string {
  // Max 30 chars (in case credit card is active)
  // Format: EGLUX-YYYYMMDDHHmmss-XXXXX
  const now = new Date();
  const ts = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const short = (orderId || "").replace(/-/g, "").slice(0, 5).toUpperCase();
  return `EGLUX-${ts}-${short}`.slice(0, 30);
}

function normalizePhone(phone: string): string {
  if (!phone) return "";
  let p = String(phone).replace(/[^\d+]/g, "");
  if (p.startsWith("+62")) p = "62" + p.slice(3);
  else if (p.startsWith("08")) p = "62" + p.slice(1);
  else if (p.startsWith("8")) p = "62" + p;
  return p.slice(0, 16);
}

function defaultPaymentMethods(): string[] {
  // ────────────────────────────────────────────────────────────
  // ACTIVE METHODS (per DOKU dashboard as of 2026-10-29):
  //   1. Transfer Bank    → VIRTUAL_ACCOUNT_DOKU
  //   2. DOKU e-Wallet    → EMONEY_DOKU
  //   3. Minimarket       → ONLINE_TO_OFFLINE_ALFA + ONLINE_TO_OFFLINE_INDOMARET
  //
  // If a method is not yet activated, DOKU returns 400 with
  // "Payment method X not activated". The function will auto-retry
  // WITHOUT payment_method_types (letting DOKU show all available).
  // ────────────────────────────────────────────────────────────
  return [
    "VIRTUAL_ACCOUNT_DOKU",
    "EMONEY_DOKU",
    "ONLINE_TO_OFFLINE_ALFA",
    "ONLINE_TO_OFFLINE_INDOMARET",
  ];
}

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
