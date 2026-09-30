// supabase/functions/create-biteship-order/index.ts
// Bikin order pengiriman di Biteship setelah pembayaran Midtrans sukses (settlement).
// POST /create-biteship-order
// Body: { order_id: string }
//
// Flow:
//   1. Fetch order + customer + items dari Supabase
//   2. Build Biteship /v1/orders payload (shipper + destination + courier + items)
//   3. POST ke Biteship API
//   4. Save biteship_order_id + tracking_number ke orders
//   5. Return { success, biteship_order_id, tracking_number }
//
// Env vars:
//   BITESHIP_API_KEY
//   BITESHIP_ORIGIN_CONTACT_NAME, BITESHIP_ORIGIN_CONTACT_PHONE, BITESHIP_ORIGIN_EMAIL
//   BITESHIP_ORIGIN_ADDRESS, BITESHIP_ORIGIN_POSTAL_CODE, BITESHIP_ORIGIN_AREA_ID

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BITESHIP_API = "https://api.biteship.com/v1";
const BITESHIP_API_KEY = Deno.env.get("BITESHIP_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!BITESHIP_API_KEY) return json({ error: "BITESHIP_API_KEY not set" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order + customer + items
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select(`
        id, total_amount, shipping_cost, shipping_address, shipping_city,
        shipping_postal_code, shipping_area_id, shipping_area_name,
        courier_code, courier_service, courier_rate, courier_duration,
        status, payment_status, midtrans_transaction_status,
        biteship_order_id, tracking_number,
        customer:customers(name, phone, email, address),
        notes,
        items:order_items(product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity, weight_gram, variant:product_variants(sku))
      `)
      .eq("id", order_id)
      .single();

    if (oe || !order) return json({ error: "Order not found", details: oe?.message }, 404);

    // Guard: jangan create dobel kalau biteship_order_id sudah ada
    if (order.biteship_order_id) {
      return json({
        success: true,
        already_exists: true,
        biteship_order_id: order.biteship_order_id,
        tracking_number: order.tracking_number,
      });
    }

    // Guard: hanya boleh create kalau payment sukses
    const paidStatuses = ["paid", "settlement", "capture"];
    const paymentOk =
      paidStatuses.includes(order.payment_status) ||
      paidStatuses.includes(order.midtrans_transaction_status);
    if (!paymentOk) {
      return json(
        { error: `Cannot create Biteship order — payment not settled (${order.payment_status}/${order.midtrans_transaction_status})` },
        400
      );
    }

    // Guard: data wajib Biteship harus lengkap
    if (!order.shipping_area_id || !order.courier_code || !order.courier_service) {
      return json(
        {
          error: "Missing shipping_area_id / courier_code / courier_service on order",
          debug: {
            shipping_area_id: order.shipping_area_id,
            courier_code: order.courier_code,
            courier_service: order.courier_service,
          },
        },
        400
      );
    }

    // Origin (gudang pengirim) — semua dari env
    // FIX Task 1-t: Biteship area_id adalah STRING alphanumerik (format "IDNP6...IDZ12250"),
    // bukan integer. Jangan parseInt!
    // FIX Task 1-z: validate ALL required origin env vars, return clear actionable error
    const ORIGIN = {
      contact_name: (Deno.env.get("BITESHIP_ORIGIN_CONTACT_NAME") || "").trim(),
      contact_phone: normalizePhone(Deno.env.get("BITESHIP_ORIGIN_CONTACT_PHONE") || ""),
      contact_email: (Deno.env.get("BITESHIP_ORIGIN_EMAIL") || "").trim(),
      address: (Deno.env.get("BITESHIP_ORIGIN_ADDRESS") || "").trim(),
      postal_code: (Deno.env.get("BITESHIP_ORIGIN_POSTAL_CODE") || "").trim(),
      area_id: String(Deno.env.get("BITESHIP_ORIGIN_AREA_ID") || "").trim(),
    };

    // Validate all required origin env vars (Biteship reject kalau ada yang kosong)
    const missingEnvVars: string[] = [];
    if (!ORIGIN.area_id) missingEnvVars.push("BITESHIP_ORIGIN_AREA_ID");
    if (!ORIGIN.contact_name) missingEnvVars.push("BITESHIP_ORIGIN_CONTACT_NAME");
    if (!ORIGIN.contact_phone) missingEnvVars.push("BITESHIP_ORIGIN_CONTACT_PHONE");
    if (!ORIGIN.address) missingEnvVars.push("BITESHIP_ORIGIN_ADDRESS");
    if (!ORIGIN.postal_code) missingEnvVars.push("BITESHIP_ORIGIN_POSTAL_CODE");

    if (missingEnvVars.length > 0) {
      const errMsg =
        `Missing required origin env vars in Supabase Edge Functions Secrets: ${missingEnvVars.join(", ")}. ` +
        `Action: Go to Supabase Dashboard → Edge Functions → Secrets → Add the missing env vars. ` +
        `Required: BITESHIP_ORIGIN_AREA_ID, BITESHIP_ORIGIN_CONTACT_NAME, BITESHIP_ORIGIN_CONTACT_PHONE, ` +
        `BITESHIP_ORIGIN_ADDRESS, BITESHIP_ORIGIN_POSTAL_CODE. (Email is optional.)`;
      console.error("[create-biteship-order] ❌ Missing env vars:", missingEnvVars);
      return json({ error: errMsg, debug: { missing_env_vars: missingEnvVars } }, 500);
    }

    console.log("[create-biteship-order] Origin info:", {
      contact_name: ORIGIN.contact_name,
      contact_phone: ORIGIN.contact_phone.slice(0, 4) + "..." + ORIGIN.contact_phone.slice(-4),  // mask
      contact_email: ORIGIN.contact_email || "(not set)",
      address: ORIGIN.address,
      postal_code: ORIGIN.postal_code,
      area_id: ORIGIN.area_id,
    });

    const customer = (order.customer || {}) as any;
    const items = (order.items || []) as any[];

    // 2. Build Biteship /v1/orders payload
    // Per Biteship official docs (https://biteship.com/id/docs/api/orders/create):
    //   POST /v1/orders
    //   Auth: raw {key} (per https://biteship.com/id/docs/api/authentication)
    //
    // FIXED Task 1-w: field names match docs resmi
    //   - origin_contact_name/phone/email REQUIRED (sebelumnya gak ada)
    //   - origin_address (bukan shipper_address)
    //   - origin_postal_code (bukan shipper_postal_code)
    //   - courier_company & courier_type sebagai TOP-LEVEL fields (bukan object courier)
    //   - delivery_type REQUIRED ("now" untuk instant pickup)
    const biteshipPayload = {
      // Shipper (organization info — optional)
      shipper_contact_name: ORIGIN.contact_name,
      shipper_contact_phone: ORIGIN.contact_phone,
      shipper_contact_email: ORIGIN.contact_email,

      // Origin (pickup location — REQUIRED)
      origin_contact_name: ORIGIN.contact_name,
      origin_contact_phone: ORIGIN.contact_phone,
      origin_contact_email: ORIGIN.contact_email,
      origin_address: ORIGIN.address,
      origin_postal_code: ORIGIN.postal_code,
      origin_area_id: ORIGIN.area_id,

      // Destination (REQUIRED)
      destination_contact_name: customer.name || "Customer",
      destination_contact_phone: normalizePhone(customer.phone),
      destination_contact_email: customer.email || null,
      destination_address: order.shipping_address || customer.address,
      destination_postal_code: order.shipping_postal_code,
      // FIX Task 1-t: Biteship area_id adalah STRING, jangan parseInt
      destination_area_id: String(order.shipping_area_id).trim(),

      // Courier (TOP-LEVEL fields per docs, NOT nested object)
      courier_company: order.courier_code,
      courier_type: order.courier_service,
      delivery_type: "now",  // REQUIRED per docs — "now" atau "scheduled"

      // Items (REQUIRED)
      items: items.map((it: any) => ({
        name: (
          (it.variant_name_snapshot ? it.variant_name_snapshot + " - " : "") +
          it.product_name_snapshot
        ).slice(0, 100),
        sku: it.variant?.sku || "",
        value: Math.round(Number(it.unit_price_snapshot) || 0),
        weight: Math.max(1, Number(it.weight_gram) || 500),
        quantity: Math.max(1, Number(it.quantity) || 1),
      })),

      // Note (customer note untuk kurir — tampil di resi)
      note: order.notes || "",

      // Metadata (optional)
      metadata: {
        order_id: order.id,
        platform: "eglux.co.id",
      },
      reference_id: order.id,  // internal order id for idempotency
    };

    // 3. POST ke Biteship /v1/orders
    // Per docs: Auth header = raw {key} (NO prefix, confirmed Task 1-o)
    console.log("[create-biteship-order] Calling Biteship /v1/orders for order_id:", order_id);
    console.log("[create-biteship-order] Payload:", JSON.stringify(biteshipPayload, null, 2));

    const r = await fetch(`${BITESHIP_API}/orders`, {
      method: "POST",
      headers: {
        // Per Task 1-o: raw {key} (no prefix) is the official format
        Authorization: BITESHIP_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(biteshipPayload),
    });
    const data = await r.json();

    console.log("[create-biteship-order] Biteship response:", r.status, JSON.stringify(data).slice(0, 500));

    if (!r.ok || !data.success) {
      console.error("[biteship] create order failed", { status: r.status, body: data });
      return json(
        {
          error: data.error?.message || data.error || `Biteship API error (HTTP ${r.status})`,
          raw: data,
        },
        r.status || 502
      );
    }

    // 4. Persist biteship_order_id + tracking_number ke orders
    // ⚠️ FIELD PRIORITY: prefer courier.waybill_id (actual AWB) over tracking_id (Biteship internal)
    const biteshipOrderId = data.id;
    const trackingNumber =
      data.courier?.waybill_id || data.courier?.tracking_id || data.tracking_id || null;

    await supabase
      .from("orders")
      .update({
        biteship_order_id: biteshipOrderId,
        tracking_number: trackingNumber,
        status: "processing",
      })
      .eq("id", order_id);

    // 5. Auto-trigger waybill sync 10 detik setelah create
    // Delay supaya Biteship selesai process order + assign courier
    // Async (fire-and-forget) — jangan block response ke caller
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || SUPABASE_SERVICE_ROLE_KEY;

    setTimeout(async () => {
      try {
        console.log("[create-biteship-order] Auto-triggering generate-biteship-waybill...");
        const syncResp = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-biteship-waybill`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ order_id }),
          }
        );
        const syncResult = await syncResp.json();
        console.log(
          "[create-biteship-order] generate-biteship-waybill result:",
          JSON.stringify(syncResult).slice(0, 500)
        );
      } catch (e) {
        console.warn(
          "[create-biteship-order] Auto-generate waybill failed (non-blocking):",
          e.message || e
        );
      }
    }, 10000); // 10 detik delay

    return json({
      success: true,
      biteship_order_id: biteshipOrderId,
      tracking_number: trackingNumber,
      note: "Waybill sync akan auto-trigger dalam 10 detik via generate-biteship-waybill function.",
    });
  } catch (e) {
    console.error("[create-biteship-order]", e);
    return json({ error: e.message }, 500);
  }
});
