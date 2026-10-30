// create-doku-payment/index.ts
// Edge function: generate DOKU Checkout payment session
// Returns: { payment_url, invoice_number, token_id, expired_date }
//
// Required Supabase secrets:
//   DOKU_CLIENT_ID     e.g. BRN-0287-1793256156382
//   DOKU_SECRET_KEY    e.g. SK-En***...
//   DOKU_BASE_URL      e.g. https://api-sandbox.doku.com (sandbox)
//                                  https://api.doku.com (production)
//   STOREFRONT_URL     e.g. https://eglux.co.id
//   SUPABASE_URL       auto-injected
//   SUPABASE_SERVICE_ROLE_KEY  auto-injected
//
// DOKU Checkout API docs (Non-SNAP):
//   POST {DOKU_BASE_URL}/checkout/v1/payment
//   Headers: Client-Id, Request-Id, Request-Timestamp, Signature
//   Signature = HMACSHA256=Base64(HMAC-SHA256(secret_key, component))
//   Component = "Client-Id:"+cid+"\n"+"Request-Id:"+rid+"\n"+"Request-Timestamp:"+ts+"\n"+"Request-Target:/checkout/v1/payment"+"\n"+"Digest:"+base64(sha256(body))

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ---------- crypto helpers (Deno native Web Crypto) ----------

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
  // RFC4122 v4
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
  // ISO8601 UTC, e.g. 2026-10-29T07:30:00Z
  return new Date().toISOString().split(".")[0] + "Z";
}

// ---------- DOKU signature (Non-SNAP, request header) ----------

async function buildDokuSignature(
  clientId: string,
  requestId: string,
  requestTimestamp: string,
  requestTarget: string,
  bodyStr: string,
  secretKey: string
): Promise<string> {
  const digest = await sha256Base64(bodyStr);
  const component =
    `Client-Id:${clientId}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${requestTimestamp}\n` +
    `Request-Target:${requestTarget}\n` +
    `Digest:${digest}`;
  const sig = await hmacSha256Base64(secretKey, component);
  return `HMACSHA256=${sig}`;
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("SUPABASE_PROJECT_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("DOKU_CLIENT_ID");
  const secretKey = Deno.env.get("DOKU_SECRET_KEY");
  const baseUrl = Deno.env.get("DOKU_BASE_URL") || "https://api-sandbox.doku.com";
  const storefrontUrl = Deno.env.get("STOREFRONT_URL") || "https://eglux.co.id";

  if (!clientId || !secretKey) {
    return json({ error: "DOKU credentials not set", missing: { clientId: !clientId, secretKey: !secretKey } }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  const required = ["order_id", "amount", "customer_name", "customer_phone", "line_items"];
  for (const f of required) {
    if (!body[f]) {
      return json({ error: `Missing field: ${f}` }, 400);
    }
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "amount must be a positive number" }, 400);
  }

  const orderId = String(body.order_id);
  const invoiceNumber = body.invoice_number || buildInvoiceNumber(orderId);

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

  // shipping_address (from checkout)
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

  // Build callback URLs (DOKU will redirect browser, not send webhook)
  const callbackUrl = `${storefrontUrl}/payment-success`;
  const callbackUrlCancel = `${storefrontUrl}/payment-failed`;
  const callbackUrlResult = `${storefrontUrl}/payment-success`;

  // Build request body for DOKU
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

  // Collect customer info on checkout page (DOKU shows form)
  // Only enable if customer.email is empty so DOKU can prompt
  if (!customer.email) {
    dokuBody.collect_customer = { name: false, email: true, phone: false, address: false };
  }

  // Compact JSON string — used BOTH for Digest AND fetch body
  const bodyStr = JSON.stringify(dokuBody);

  // Generate signature
  const requestId = uuid();
  const requestTimestamp = utcTimestamp();
  const requestTarget = "/checkout/v1/payment";
  const signature = await buildDokuSignature(
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    bodyStr,
    secretKey
  );

  const headers: Record<string, string> = {
    "Client-Id": clientId,
    "Request-Id": requestId,
    "Request-Timestamp": requestTimestamp,
    "Signature": signature,
    "Content-Type": "application/json",
  };

  // POST to DOKU
  let dokuResponse;
  let dokuStatus;
  let dokuText;
  try {
    const resp = await fetch(`${baseUrl}/checkout/v1/payment`, {
      method: "POST",
      headers,
      body: bodyStr,
    });
    dokuStatus = resp.status;
    dokuText = await resp.text();
    try {
      dokuResponse = JSON.parse(dokuText);
    } catch {
      dokuResponse = { raw: dokuText };
    }
  } catch (e) {
    return json({ error: "DOKU fetch failed", detail: String(e) }, 502);
  }

  // On success, return payment.url + persist payment session
  if (dokuStatus === 200 && dokuResponse?.response?.payment?.url) {
    const paymentUrl = dokuResponse.response.payment.url;
    const tokenId = dokuResponse.response.payment.token_id;
    const expiredDate = dokuResponse.response.payment.expired_date;
    const sessionId = dokuResponse.response.order?.session_id;

    // Persist to database (best-effort, don't fail request if DB write fails)
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
          amount: Math.round(amount),
          status: "pending",
          request_id: requestId,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("DB write failed (non-fatal):", e);
      }
    }

    return json({
      success: true,
      payment_url: paymentUrl,
      invoice_number: invoiceNumber,
      token_id: tokenId,
      session_id: sessionId,
      expired_date: expiredDate,
    });
  }

  // Failed — return DOKU's error to client for debugging
  return json({
    success: false,
    status: dokuStatus,
    error: dokuResponse?.error_messages || dokuResponse?.message || "DOKU request failed",
    raw: dokuResponse,
    signature_debug: {
      request_id: requestId,
      request_timestamp: requestTimestamp,
      request_target: requestTarget,
      body_preview: bodyStr.slice(0, 200),
    },
  }, 400);
});

// ---------- helpers ----------

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
  // ACTIVE METHODS ONLY (per DOKU dashboard as of 2026-10-29):
  //   1. Transfer Bank    → VIRTUAL_ACCOUNT_DOKU
  //   2. DOKU e-Wallet    → EMONEY_DOKU
  //   3. Minimarket       → ONLINE_TO_OFFLINE_ALFA + ONLINE_TO_OFFLINE_INDOMARET
  //
  // Other methods (BCA VA, Mandiri VA, QRIS, Credit Card, OVO, ShopeePay, DANA)
  // are NOT YET ACTIVE — sending them in API request will cause DOKU to return
  // HTTP 400 error: "Payment method X not activated".
  //
  // To activate more methods:
  //   1. DOKU Dashboard → Settings → Payment Settings → click each channel → "Activate"
  //   2. Wait for DOKU approval (instant for VA, ~1 day for QRIS/CC)
  //   3. After activation, add the corresponding code below.
  // ────────────────────────────────────────────────────────────
  return [
    "VIRTUAL_ACCOUNT_DOKU",       // Transfer Bank (any bank → DOKU VA)
    "EMONEY_DOKU",                // DOKU Wallet
    "ONLINE_TO_OFFLINE_ALFA",     // Alfamart / Alfamidi / Dan+Dan
    "ONLINE_TO_OFFLINE_INDOMARET", // Indomaret
  ];
}

function json(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
