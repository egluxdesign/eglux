// supabase/functions/create-order/index.ts
// ============================================================================
// create-order — Customer-facing endpoint untuk save order ke DB
// ============================================================================
//
// Mengapa edge function ini ada?
//   Setelah SQL 006 (tighten RLS), anon key TIDAK BISA INSERT ke
//   customers/orders/order_items. Hanya service_role yang bisa.
//   Frontend (CheckoutModalMidtrans) pakai anon key → akan FAIL.
//
//   Solusi: frontend call edge function ini, edge function pakai
//   service_role key untuk INSERT. Auth verify via JWT user (any role
//   boleh, asal sudah login).
//
// Cara panggil:
//   POST /functions/v1/create-order
//   Headers:
//     Authorization: Bearer <user-jwt>  ← WAJIB, hasil dari supabase.auth
//   Body: {
//     customer: { name, phone, email?, address },
//     order: {
//       subtotal, shipping_cost, total_amount,
//       shipping_address, shipping_city, shipping_postal_code,
//       shipping_area_id?, shipping_area_name?,
//       courier_code, courier_service?, courier_duration?, courier_rate,
//       notes?
//     },
//     items: [
//       { product_id, variant_id?, product_name_snapshot, variant_name_snapshot?,
//         unit_price_snapshot, quantity, subtotal, weight_gram }
//     ]
//   }
//
// Response:
//   { success: true, order_id: "uuid", customer_id: "uuid" }
//   { success: false, error: "..." }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// Validation helpers
// ============================================================================
function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function isE164(phone: string): boolean {
  // +62xxxxxxxxxxxx (8-15 digits after country code)
  return /^\+\d{8,15}$/.test(phone);
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================================
// Main
// ============================================================================
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ── AUTH: Customer-facing endpoint, cukup login (any role) ──
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) {
      return authResult.response!;
    }

    const body = await req.json();
    const { customer, order, items } = body;

    // ── Validate customer ──
    if (!customer || !customer.name || !customer.phone || !customer.address) {
      return json({ error: "customer.{name,phone,address} are required" }, 400);
    }
    if (customer.phone && !isE164(customer.phone)) {
      return json(
        { error: `customer.phone must be E.164 format (+628xxx), got: ${customer.phone}` },
        400,
      );
    }
    if (customer.email && !isEmail(customer.email)) {
      return json({ error: "customer.email format invalid" }, 400);
    }

    // ── Validate order ──
    if (!order) {
      return json({ error: "order is required" }, 400);
    }
    const requiredOrderFields = [
      "subtotal", "shipping_cost", "total_amount",
      "shipping_address", "shipping_city", "shipping_postal_code",
      "courier_code", "courier_rate",
    ];
    for (const field of requiredOrderFields) {
      if (order[field] === undefined || order[field] === null) {
        return json({ error: `order.${field} is required` }, 400);
      }
    }
    if (Number(order.subtotal) < 0 || Number(order.shipping_cost) < 0 || Number(order.total_amount) < 0) {
      return json({ error: "order amounts must be >= 0" }, 400);
    }

    // ── Validate items ──
    if (!Array.isArray(items) || items.length === 0) {
      return json({ error: "items array is required (cannot be empty)" }, 400);
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.product_id || !isUUID(item.product_id)) {
        return json({ error: `items[${i}].product_id must be a valid UUID` }, 400);
      }
      if (item.variant_id && !isUUID(item.variant_id)) {
        return json({ error: `items[${i}].variant_id must be a valid UUID` }, 400);
      }
      if (!item.product_name_snapshot) {
        return json({ error: `items[${i}].product_name_snapshot is required` }, 400);
      }
      if (Number(item.unit_price_snapshot) < 0) {
        return json({ error: `items[${i}].unit_price_snapshot must be >= 0` }, 400);
      }
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
        return json({ error: `items[${i}].quantity must be positive integer` }, 400);
      }
      if (Number(item.subtotal) < 0) {
        return json({ error: `items[${i}].subtotal must be >= 0` }, 400);
      }
    }

    // ── Execute INSERT pakai service_role (bypass RLS) ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Insert customer (generate UUID)
    // ⭐ Set user_id supaya orders bisa di-filter by user (untuk order history)
    const customerId = crypto.randomUUID();
    const { error: customerError } = await supabase.from("customers").insert({
      id: customerId,
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      email: customer.email?.trim() || null,
      address: customer.address.trim(),
      user_id: authResult.user!.id, // ⭐ link customer ke user yang login
    });
    if (customerError) {
      return json({ error: "Failed to insert customer", details: customerError.message }, 500);
    }

    // 2. Insert order
    // NOTE: user_id tidak di-include karena column belum ada di orders table.
    // Kalau nanti mau link order ke user (untuk order history di user account),
    // tambah migration: ALTER TABLE orders ADD COLUMN user_id UUID REFERENCES auth.users(id).
    // Lalu uncomment baris user_id di bawah.
    const orderId = crypto.randomUUID();
    const { error: orderError } = await supabase.from("orders").insert({
      id: orderId,
      customer_id: customerId,
      // user_id: authResult.user!.id,  // ← enable setelah migration
      status: "pending",
      payment_method: "midtrans_snap",
      payment_status: "unpaid",
      subtotal: Number(order.subtotal),
      shipping_cost: Number(order.shipping_cost),
      total_amount: Number(order.total_amount),
      shipping_address: order.shipping_address.trim(),
      shipping_city: order.shipping_city.trim(),
      shipping_postal_code: String(order.shipping_postal_code).trim(),
      shipping_area_id: order.shipping_area_id ? String(order.shipping_area_id).trim() : null,
      shipping_area_name: order.shipping_area_name || null,
      courier_code: String(order.courier_code).toLowerCase(),
      courier_service: order.courier_service || null,
      courier_duration: order.courier_duration || null,
      courier_rate: Number(order.courier_rate),
      notes: order.notes?.trim() || null,
    });
    if (orderError) {
      // Cleanup: hapus customer yang baru di-insert (order gagal)
      await supabase.from("customers").delete().eq("id", customerId);
      return json({ error: "Failed to insert order", details: orderError.message }, 500);
    }

    // 3. Insert order_items
    const itemsPayload = items.map((item: any) => ({
      order_id: orderId,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      product_name_snapshot: item.product_name_snapshot,
      variant_name_snapshot: item.variant_name_snapshot ?? null,
      unit_price_snapshot: Number(item.unit_price_snapshot) || 0,
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
      weight_gram: Number(item.weight_gram) || 500,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(itemsPayload);
    if (itemsError) {
      // Cleanup: hapus order + customer (items gagal)
      await supabase.from("orders").delete().eq("id", orderId);
      await supabase.from("customers").delete().eq("id", customerId);
      return json({ error: "Failed to insert order_items", details: itemsError.message }, 500);
    }

    // ── Success ──
    return json({
      success: true,
      order_id: orderId,
      customer_id: customerId,
      message: "Order saved. Lanjutkan ke create-midtrans-transaction untuk dapat Snap token.",
    });
  } catch (e) {
    console.error("[create-order]", e);
    return json({ error: e.message }, 500);
  }
});
