// supabase/functions/create-midtrans-transaction/index.ts
// ============================================================================
// [v2] Updated: save Midtrans Snap response fields baru ke orders table
// ============================================================================
//
// New fields saved to orders table (per sql/002_orders_alignment.sql):
//   - midtrans_payment_type     (qris, gopay, bca_va, dst.)
//   - midtrans_settlement_time  (timestamp, diisi saat settlement via webhook)
//   - midtrans_fraud_status     (accept, deny, challenge — credit card only)
//   - midtrans_payment_code     (VA number / retail code)
//   - midtrans_pdf_url          (URL PDF instruksi pembayaran)
//
// Catatan:
//   - Pada saat create Snap token, Midtrans BELUM return payment_type,
//     payment_code, pdf_url, settlement_time. Field-field ini baru muncul
//     SETELAH customer bayar — di-update via Midtrans webhook notification.
//   - Function ini hanya menyimpan: snap_token, snap_redirect_url,
//     midtrans_transaction_status='pending', dan transaction_id kalau ada.
//   - Untuk populate fields baru, perlu function `midtrans-webhook` (TODO).
//
// Flow lengkap:
//   1. Frontend call create-midtrans-transaction → dapat snap_token
//   2. Customer bayar via Snap popup
//   3. Midtrans kirim webhook notification ke /functions/v1/midtrans-webhook
//   4. midtrans-webhook update orders: payment_type, settlement_time,
//      fraud_status, payment_code, pdf_url, transaction_status, dll.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const MIDTRANS_SNAP_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// "08123456789" → "628123456789", "+62 812-345-67890" → "628123456789"
function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 ? p : undefined;
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = (fullName || "").trim().split(/\s+/);
  return {
    first_name: parts[0] || "Customer",
    last_name: parts.slice(1).join(" ") || undefined,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── AUTH: Cukup login (any role). Customer yang checkout butuh akses ini. ──
    // Admin/Pro/Verified semua boleh, asal sudah login.
    // Optional: bisa tambah verify ownership order_id untuk hardening.
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!MIDTRANS_SERVER_KEY) return json({ error: "MIDTRANS_SERVER_KEY not set" }, 500);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order + nested customer & items
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select(`
        id, total_amount, subtotal, shipping_cost,
        shipping_address, shipping_city, shipping_postal_code,
        courier_code, courier_service, notes,
        customer:customers(name, phone, email),
        items:order_items(product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity)
      `)
      .eq("id", order_id)
      .single();

    if (oe || !order) return json({ error: "Order not found", details: oe?.message }, 404);

    // 2. Build item_details (Midtrans requires id, name, price, quantity per item)
    const items = (order.items || []) as any[];
    const item_details = items.map((it, i) => {
      const name = `${it.product_name_snapshot}${it.variant_name_snapshot ? " (" + it.variant_name_snapshot + ")" : ""}`;
      return {
        id: `ITEM-${i + 1}`,
        name: name.slice(0, 50),
        price: Math.round(Number(it.unit_price_snapshot) || 0),
        quantity: Math.max(1, Number(it.quantity) || 1),
      };
    });

    // Shipping as a separate line item (so gross_amount = subtotal + shipping)
    const shippingCost = Math.round(Number(order.shipping_cost) || 0);
    if (shippingCost > 0) {
      item_details.push({
        id: "SHIPPING",
        name: `Ongkir ${order.courier_code || ""} ${order.courier_service || ""}`.trim().slice(0, 50),
        price: shippingCost,
        quantity: 1,
      });
    }

    // 3. Sanity check: gross_amount MUST equal order.total_amount
    const gross_amount = item_details.reduce((s, i) => s + i.price * i.quantity, 0);
    const expected_total = Math.round(Number(order.total_amount) || 0);

    if (gross_amount !== expected_total) {
      console.error("[midtrans] total mismatch", {
        gross_amount,
        expected_total,
        subtotal: order.subtotal,
        shipping_cost: order.shipping_cost,
      });
      return json(
        {
          error: "Total mismatch — order.total_amount tidak cocok dengan item_details + shipping",
          debug: { gross_amount, expected_total, order_total: order.total_amount },
        },
        400
      );
    }

    // 4. customer_details + billing/shipping address (Midtrans spec)
    const customer = (order.customer || {}) as any;
    const phone = normalizePhone(customer.phone);
    const { first_name, last_name } = splitName(customer.name);

    const addressBlock = {
      first_name,
      last_name,
      phone,
      email: customer.email || undefined,
      address: order.shipping_address || customer.address || undefined,
      city: order.shipping_city || undefined,
      postal_code: order.shipping_postal_code || undefined,
      country_code: "IDN",
    };

    const payload = {
      transaction_details: { order_id, gross_amount },
      customer_details: {
        first_name,
        last_name,
        email: customer.email || undefined,
        phone,
        billing_address: addressBlock,
        shipping_address: addressBlock,
      },
      item_details,
      // Payment methods: TIDAK di-restrict (biarkan Midtrans tampilkan semua
      // methods yang aktif di akun merchant). Kalau restrict ke ["qris"] saja
      // tapi QRIS belum di-enable di Dashboard → "No payment channels available".
      // Untuk restrict QRIS only: enable QRIS di Dashboard dulu, lalu set:
      //   enabled_payments: ["qris"],
      custom_field1: order.courier_code ? `${order.courier_code}/${order.courier_service}` : null,
      custom_field2: order.shipping_postal_code || null,
    };

    // 5. POST to Midtrans Snap
    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const r = await fetch(MIDTRANS_SNAP_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const snap = await r.json();

    if (!r.ok || !snap.token) {
      console.error("[midtrans] snap API failed", { status: r.status, body: snap });
      return json(
        {
          error: snap.error_messages?.[0] || "Midtrans Snap API error",
          raw: snap,
        },
        r.status || 502
      );
    }

    // 6. Persist snap_token + redirect_url + initial midtrans fields
    // Catatan: Pada tahap ini (sebelum customer bayar), Midtrans Snap response
    // hanya return: token, redirect_url. Field seperti payment_type, payment_code,
    // settlement_time, pdf_url BELUM ada — diisi via webhook nanti.
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        snap_token: snap.token,
        snap_redirect_url: snap.redirect_url,
        midtrans_transaction_status: "pending",
        midtrans_payment_type: null,    // akan diisi via webhook
        midtrans_settlement_time: null, // akan diisi via webhook
        midtrans_fraud_status: null,    // akan diisi via webhook
        midtrans_payment_code: null,    // akan diisi via webhook
        midtrans_pdf_url: null,         // akan diisi via webhook
      })
      .eq("id", order_id);

    if (updateError) {
      console.error("[midtrans] failed to update order with snap token:", updateError);
      // Jangan fail request — token sudah dapat, customer masih bisa bayar
    }

    // 7. Return token for window.snap.pay()
    return json({ success: true, token: snap.token, redirect_url: snap.redirect_url });
  } catch (e) {
    console.error("[create-midtrans-transaction]", e);
    return json({ error: e.message }, 500);
  }
});
