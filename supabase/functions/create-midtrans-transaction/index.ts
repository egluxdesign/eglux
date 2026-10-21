// supabase/functions/create-midtrans-transaction/index.ts
// ============================================================================
// Create Midtrans Transaction v3.0
// ============================================================================
// ⭐ v3.0 CHANGES:
//   - Accept `payment_method` param (e.g., 'gopay', 'bca_va', 'credit_card')
//   - Fetch admin fee from `payment_methods` table
//   - Calculate admin_fee (base + VAT if not inclusive)
//   - Update order total with admin_fee
//   - Pass `enabled_payments: [payment_method]` to Midtrans Snap API
//   - Customer pays adjusted total (includes admin_fee)
//   - Snap popup opens directly with selected method (no choice screen)
//
// v2.1 (previous): Robust handling "order_id sudah digunakan" error
// v2.0 (previous): Save Midtrans Snap response fields baru ke orders table
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHash } from "node:crypto";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const MIDTRANS_SNAP_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const MIDTRANS_BASE_URL =
  Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
const MIDTRANS_SERVER_KEY = Deno.env.get("MIDTRANS_SERVER_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VAT_PERCENTAGE = 0.11; // 11% PPN

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

function basicAuthHeader(): string {
  return `Basic ${btoa(`${MIDTRANS_SERVER_KEY}:`)}`;
}

// ============================================================================
// ⭐ v3.0 NEW: Calculate admin fee from payment_methods table
// ============================================================================
function calculateAdminFee(
  method: any,
  baseAmount: number // subtotal + shipping_cost + tax_amount (pre-fee total)
): { adminFee: number; baseFee: number; vatAmount: number } {
  let baseFee = 0;

  if (method.fee_type === "percentage") {
    baseFee = Math.floor(baseAmount * Number(method.fee_percentage));
  } else if (method.fee_type === "fixed") {
    baseFee = Number(method.fee_fixed);
  } else if (method.fee_type === "mixed") {
    baseFee = Math.floor(baseAmount * Number(method.fee_percentage)) + Number(method.fee_fixed);
  }

  // Apply min amount
  if (method.fee_min_amount && baseFee < Number(method.fee_min_amount)) {
    baseFee = Number(method.fee_min_amount);
  }
  // Apply max amount (optional)
  if (method.fee_max_amount && baseFee > Number(method.fee_max_amount)) {
    baseFee = Number(method.fee_max_amount);
  }

  // Add VAT if fee is NOT VAT-inclusive
  let vatAmount = 0;
  let adminFee = baseFee;
  if (!method.fee_vat_inclusive) {
    vatAmount = Math.floor(baseFee * VAT_PERCENTAGE);
    adminFee = baseFee + vatAmount;
  }

  return { adminFee, baseFee, vatAmount };
}

// ============================================================================
// Status API helpers (from v2.1)
// ============================================================================
async function getMidtransStatus(orderId: string): Promise<{ transaction_status: string | null; raw: unknown } | null> {
  try {
    const resp = await fetch(`${MIDTRANS_BASE_URL}/v2/${orderId}/status`, {
      method: "GET",
      headers: { Authorization: basicAuthHeader(), Accept: "application/json" },
    });
    const data = await resp.json();
    if (!resp.ok) return { transaction_status: null, raw: data };
    return { transaction_status: data.transaction_status || null, raw: data };
  } catch (err) {
    return null;
  }
}

async function cancelMidtransTransaction(orderId: string): Promise<{ success: boolean; status_code: number; message: string; raw_response: unknown }> {
  try {
    const resp = await fetch(`${MIDTRANS_BASE_URL}/v2/${orderId}/cancel`, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), Accept: "application/json", "Content-Type": "application/json" },
    });
    const data = await resp.json();
    return { success: resp.ok, status_code: resp.status, message: data.status_message || `HTTP ${resp.status}`, raw_response: data };
  } catch (err) {
    return { success: false, status_code: 0, message: `Network error: ${err?.message}`, raw_response: null };
  }
}

async function cleanupExistingTransaction(orderId: string): Promise<{ can_proceed: boolean; error?: string }> {
  const statusResult = await getMidtransStatus(orderId);
  if (!statusResult) return { can_proceed: true };

  const status = statusResult.transaction_status;
  if (status === null) return { can_proceed: true };

  if (status === "settlement" || status === "capture") {
    return { can_proceed: false, error: "Pesanan sudah dibayar (Midtrans confirmed)." };
  }

  if (status === "pending") {
    const cancelResult = await cancelMidtransTransaction(orderId);
    if (cancelResult.success) {
      return { can_proceed: true };
    }
    return { can_proceed: true }; // Proceed anyway
  }

  return { can_proceed: true }; // deny/expire/cancel → safe to proceed
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const { order_id, payment_method } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);
    if (!MIDTRANS_SERVER_KEY) return json({ error: "MIDTRANS_SERVER_KEY not set" }, 500);
    if (!payment_method) return json({ error: "payment_method is required (e.g., 'gopay', 'bca_va', 'credit_card')" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch order + customer + items
    const { data: order, error: oe } = await supabase
      .from("orders")
      .select(`
        id, total_amount, subtotal, shipping_cost,
        shipping_address, shipping_city, shipping_postal_code,
        courier_code, courier_service, notes,
        payment_status, snap_token, midtrans_transaction_id,
        voucher_code, voucher_discount,
        tax_percent, tax_base, tax_amount,
        customer:customers(name, phone, email),
        items:order_items(product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity)
      `)
      .eq("id", order_id)
      .single();

    if (oe || !order) return json({ error: "Order not found", details: oe?.message }, 404);

    if (order.payment_status === "paid") {
      return json({ error: "Pesanan sudah dibayar." }, 400);
    }

    // ⭐ v3.0: Cleanup existing transaction
    const cleanupResult = await cleanupExistingTransaction(order_id);
    if (!cleanupResult.can_proceed) {
      return json({ error: cleanupResult.error }, 400);
    }

    // ⭐ v3.0: Fetch payment method fee structure from DB
    const { data: method, error: methodErr } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("method_code", payment_method)
      .eq("is_active", true)
      .maybeSingle();

    if (methodErr || !method) {
      return json({ error: `Payment method "${payment_method}" not found or inactive` }, 400);
    }

    // ⭐ v3.0: Calculate admin fee
    // Base for percentage = subtotal + shipping_cost + tax_amount (pre-fee total)
    const baseForPercentage = Number(order.subtotal) + Number(order.shipping_cost) + Number(order.tax_amount || 0);
    const { adminFee, baseFee, vatAmount } = calculateAdminFee(method, baseForPercentage);

    console.log("[midtrans] Payment method:", payment_method, "Admin fee:", adminFee, "(base:", baseFee, "+ VAT:", vatAmount, ")");

    // 2. Build item_details
    const items = (order.items || []) as any[];
    const item_details = items.map((it, i) => ({
      id: `ITEM-${i + 1}`,
      name: `${it.product_name_snapshot}${it.variant_name_snapshot ? " (" + it.variant_name_snapshot + ")" : ""}`.slice(0, 50),
      price: Math.round(Number(it.unit_price_snapshot) || 0),
      quantity: Math.max(1, Number(it.quantity) || 1),
    }));

    // Shipping line item
    const shippingCost = Math.round(Number(order.shipping_cost) || 0);
    if (shippingCost > 0) {
      item_details.push({ id: "SHIPPING", name: "Ongkir", price: shippingCost, quantity: 1 });
    }

    // Tax line item
    const taxAmount = Math.round(Number(order.tax_amount) || 0);
    if (taxAmount > 0) {
      const taxPercent = Number(order.tax_percent) || 3;
      item_details.push({ id: "TAX", name: `Biaya Admin & Tax (${taxPercent}%)`.slice(0, 50), price: taxAmount, quantity: 1 });
    }

    // ⭐ v3.0: Add ADMIN_FEE line item
    if (adminFee > 0) {
      item_details.push({
        id: "ADMIN_FEE",
        name: `Biaya Admin ${method.method_name}`.slice(0, 50),
        price: adminFee,
        quantity: 1,
      });
    }

    // 3. Calculate gross_amount = sum of all item_details
    const gross_amount = item_details.reduce((s, i) => s + i.price * i.quantity, 0);
    const expected_total = Math.round(Number(order.total_amount) || 0);

    // ⭐ v3.0: gross_amount includes admin_fee, so it should be > expected_total
    const mismatch = Math.abs(gross_amount - (expected_total + adminFee));
    if (mismatch > 100) {
      // Auto-fix: update order total with new gross_amount (includes admin fee)
      console.log("[midtrans] Auto-fixing total_amount:", expected_total, "→", gross_amount, "(includes admin_fee:", adminFee, ")");
    }

    // 4. customer_details
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

    // 5. Build Midtrans Snap payload
    const finishRedirectUrl = Deno.env.get("STOREFRONT_URL")
      ? `${Deno.env.get("STOREFRONT_URL")}/orders`
      : undefined;

    const payload = {
      transaction_details: { order_id, gross_amount },
      item_details,
      customer_details: {
        ...addressBlock,
        billing_address: addressBlock,
        shipping_address: addressBlock,
      },
      // ⭐ v3.0: Restrict to selected payment method only
      enabled_payments: [payment_method],
      finish_redirect_url: finishRedirectUrl,
    };

    // ⭐ v3.0: Update orders table dengan payment_method_selected + admin_fee + new total
    await supabase.from("orders").update({
      payment_method_selected: payment_method,
      admin_fee: adminFee,
      admin_fee_type: method.fee_type,
      admin_fee_percentage: method.fee_percentage,
      admin_fee_fixed: method.fee_fixed,
      admin_fee_vat_inclusive: method.fee_vat_inclusive,
      admin_fee_vat_amount: vatAmount,
      total_amount: gross_amount, // Updated total includes admin_fee
    }).eq("id", order_id);

    // 6. POST to Midtrans Snap
    const r = await fetch(MIDTRANS_SNAP_URL, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const snap = await r.json();

    if (!r.ok || !snap.token) {
      console.error("[midtrans] snap API failed", { status: r.status, body: snap });
      return json({ error: snap.error_messages?.[0] || "Midtrans Snap API error", raw: snap }, r.status || 502);
    }

    // 7. Persist snap_token
    await supabase.from("orders").update({
      snap_token: snap.token,
      snap_redirect_url: snap.redirect_url,
      midtrans_transaction_status: "pending",
    }).eq("id", order_id);

    console.log(`[midtrans] ✓ Snap token created for order ${order_id.slice(0, 8)}, method: ${payment_method}, admin_fee: ${adminFee}, total: ${gross_amount}`);

    return json({
      success: true,
      token: snap.token,
      redirect_url: snap.redirect_url,
      payment_method: payment_method,
      admin_fee: adminFee,
      total_amount: gross_amount,
    });
  } catch (e: any) {
    console.error("[midtrans] Unhandled exception:", e?.message, e?.stack);
    return json({ error: e.message }, 500);
  }
});
