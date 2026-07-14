// supabase/functions/_shared/waba-shared.ts
// ============================================================================
// Shared helpers untuk WABA (WhatsApp Business API) functions.
// ============================================================================
// Dipakai oleh:
//   - send-waba-test/index.ts
//   - send-waba-live/index.ts
//   - admin-resend-waba/index.ts
//   - cron-retry-failed-waba/index.ts
//
// Berisi:
//   - Constants: CORS_HEADERS, SUPPORTED_EVENTS, TEMPLATE_NAMES, MAX_RETRY_ATTEMPTS
//   - Types: SupportedEvent, OrderData, WabaMessage
//   - Helpers: jsonResponse, normalizePhoneForMeta, formatRupiah, shortOrderId
//   - DB: fetchOrderData, saveWabaMessage, updateWabaMessageStatus, fetchWabaMessage
//   - Retry: fetchMessagesForRetry, isRetryable, updateRetryTracking
//   - Meta API: sendToMeta
//   - Validation: validateRequest
//   - Build: buildPaymentSuccessMessage
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// Constants
// ============================================================================
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const SUPPORTED_EVENTS = ["payment_success"] as const;
export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

export const TEMPLATE_NAMES: Record<SupportedEvent, string> = {
  payment_success: "eglux_payment_success",
};

// Max retry attempts untuk failed WABA messages (cron auto-retry)
export const MAX_RETRY_ATTEMPTS = 3;

// Error codes yang eligible untuk retry (Meta Cloud API docs)
export const RETRYABLE_ERROR_CODES = [
  "131047",      // Recipient phone number not in allowed list (dev mode)
  "131052",      // Message undeliverable (temporary)
  "131073",      // Recipient cannot receive message (temporary)
  "131030",      // Re-engagement message
  "131031",      // Recipient phone number not a WhatsApp user
  "470",         // Reengagement message
  "131048",      // Recipient phone number does not exist
  "131069",      // Too many requests
  "10",          // Internal error
  "service_unavailable",
  "timeout",
  "rate_limit",
];

// ============================================================================
// Types
// ============================================================================
export interface OrderData {
  order_id: string;
  short_order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_amount: number;
  subtotal: number;
  shipping_cost: number;
  payment_method: string;
  courier_code: string | null;
  courier_service: string | null;
  courier_duration: string | null;
  items: Array<{
    name: string;
    variant: string | null;
    quantity: number;
    unit_price: number;
  }>;
}

export interface WabaMessage {
  id: string;
  order_id: string;
  phone: string;
  event: string;
  template_name: string;
  template_params: Record<string, string>;
  message_body: string;
  mode: "test" | "live";
  status: "pending" | "test_sent" | "sent" | "failed";
  provider_response: unknown;
  provider_message_id: string | null;
  error_message: string | null;
  error_code: string | null;
  retry_count: number;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string;
}

// ============================================================================
// Helpers
// ============================================================================
export function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * Normalize phone ke E.164 tanpa "+" (format Meta Cloud API).
 * Input: "+6281234567890", "081234567890", "6281234567890", "81234567890"
 * Output: "6281234567890"
 */
export function normalizePhoneForMeta(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62")) p = "62" + p;
  return p.length >= 9 && p.length <= 15 ? p : null;
}

export function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

export function shortOrderId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ============================================================================
// DB Helpers
// ============================================================================

/**
 * Fetch order + customer + items dari Supabase.
 */
export async function fetchOrderData(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
): Promise<OrderData | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id, total_amount, subtotal, shipping_cost,
      payment_method, courier_code, courier_service, courier_duration,
      customer:customers(name, phone, email),
      items:order_items(product_name_snapshot, variant_name_snapshot, unit_price_snapshot, quantity)
    `)
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.error("[waba-shared] fetchOrderData error:", error?.message);
    return null;
  }

  const customer = (order.customer as any) || {};
  const items = (order.items as any[]) || [];

  return {
    order_id: order.id,
    short_order_id: shortOrderId(order.id),
    customer_name: customer.name || "Pelanggan",
    customer_phone: normalizePhoneForMeta(customer.phone) || "",
    customer_email: customer.email || null,
    total_amount: Number(order.total_amount) || 0,
    subtotal: Number(order.subtotal) || 0,
    shipping_cost: Number(order.shipping_cost) || 0,
    payment_method: order.payment_method || "midtrans_snap",
    courier_code: order.courier_code || null,
    courier_service: order.courier_service || null,
    courier_duration: order.courier_duration || null,
    items: items.map((it: any) => ({
      name: it.product_name_snapshot || "",
      variant: it.variant_name_snapshot || null,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price_snapshot) || 0,
    })),
  };
}

/**
 * Save WABA message ke audit table.
 */
export async function saveWabaMessage(
  supabaseUrl: string,
  serviceRoleKey: string,
  data: {
    order_id: string;
    phone: string;
    event: string;
    template_name: string;
    template_params: Record<string, string>;
    message_body: string;
    mode: "test" | "live";
    status: "pending" | "test_sent" | "sent" | "failed";
  },
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: row, error } = await supabase
    .from("waba_messages")
    .insert({
      order_id: data.order_id,
      phone: data.phone,
      event: data.event,
      template_name: data.template_name,
      template_params: data.template_params,
      message_body: data.message_body,
      mode: data.mode,
      status: data.status,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[waba-shared] saveWabaMessage error:", error.message);
    return null;
  }

  return row?.id || null;
}

/**
 * Update WABA message status.
 */
export async function updateWabaMessageStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  data: {
    status: "sent" | "failed" | "test_sent";
    provider_response?: unknown;
    provider_message_id?: string;
    error_message?: string;
    error_code?: string;
  },
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const update: Record<string, unknown> = {
    status: data.status,
    provider_response: data.provider_response || null,
    sent_at: new Date().toISOString(),
  };

  if (data.provider_message_id) {
    update.provider_message_id = data.provider_message_id;
  }
  if (data.error_message) {
    update.error_message = data.error_message;
  }
  if (data.error_code) {
    update.error_code = data.error_code;
  }

  const { error } = await supabase
    .from("waba_messages")
    .update(update)
    .eq("id", messageId);

  if (error) {
    console.error("[waba-shared] updateWabaMessageStatus error:", error.message);
  }
}

/**
 * Fetch single WABA message by ID.
 */
export async function fetchWabaMessage(
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
): Promise<WabaMessage | null> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("waba_messages")
    .select("*")
    .eq("id", messageId)
    .single();

  if (error || !data) {
    console.error("[waba-shared] fetchWabaMessage error:", error?.message);
    return null;
  }

  return data as WabaMessage;
}

/**
 * Fetch all WABA messages yang eligible untuk retry.
 * Conditions: status='failed' + retry_count < MAX + next_retry_at IS NULL atau <= NOW
 */
export async function fetchMessagesForRetry(
  supabaseUrl: string,
  serviceRoleKey: string,
  limit: number = 20,
): Promise<WabaMessage[]> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("waba_messages")
    .select("*")
    .eq("status", "failed")
    .lt("retry_count", MAX_RETRY_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) {
    console.error("[waba-shared] fetchMessagesForRetry error:", error?.message);
    return [];
  }

  return data as WabaMessage[];
}

/**
 * Check if error code eligible for retry.
 */
export function isRetryable(errorCode: string | null): boolean {
  if (!errorCode) return false;
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

/**
 * Update retry tracking: increment retry_count + set next_retry_at (exponential backoff).
 *
 * Backoff schedule:
 *   Attempt 1 failed → wait 5 min  → retry (attempt 2)
 *   Attempt 2 failed → wait 30 min → retry (attempt 3)
 *   Attempt 3 failed → give up (max attempts reached)
 */
export async function updateRetryTracking(
  supabaseUrl: string,
  serviceRoleKey: string,
  messageId: string,
  data: {
    status: "failed" | "sent";
    error_message?: string;
    error_code?: string;
    provider_response?: unknown;
    provider_message_id?: string;
  },
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch current message untuk dapat retry_count
  const message = await fetchWabaMessage(supabaseUrl, serviceRoleKey, messageId);
  if (!message) {
    console.error("[waba-shared] updateRetryTracking: message not found");
    return;
  }

  const newRetryCount = message.retry_count + 1;
  const isMaxReached = newRetryCount >= MAX_RETRY_ATTEMPTS;

  // Exponential backoff: 5min, 30min (atau null kalau max reached)
  const backoffMs = newRetryCount === 1 ? 5 * 60 * 1000 : 30 * 60 * 1000;
  const nextRetryAt = isMaxReached || data.status === "sent"
    ? null
    : new Date(Date.now() + backoffMs).toISOString();

  const update: Record<string, unknown> = {
    status: data.status,
    retry_count: newRetryCount,
    next_retry_at: nextRetryAt,
    error_message: data.error_message || null,
    error_code: data.error_code || null,
    provider_response: data.provider_response || null,
  };

  if (data.provider_message_id) {
    update.provider_message_id = data.provider_message_id;
  }
  if (data.status === "sent") {
    update.sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("waba_messages")
    .update(update)
    .eq("id", messageId);

  if (error) {
    console.error("[waba-shared] updateRetryTracking error:", error.message);
  }
}

// ============================================================================
// Meta Cloud API
// ============================================================================

/**
 * Send message ke Meta Cloud API.
 * Returns: { success, message_id?, error_code?, error_message?, response? }
 */
export async function sendToMeta(
  metaGraphUrl: string,
  accessToken: string,
  phoneNumber: string, // E.164 tanpa + (e.g., "6281234567890")
  templateName: string,
  templateParams: Record<string, string>,
  templateLanguage: string = "id",
): Promise<{
  success: boolean;
  message_id?: string;
  error_code?: string;
  error_message?: string;
  response?: unknown;
}> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phoneNumber,
    type: "template",
    template: {
      name: templateName,
      language: { code: templateLanguage },
      components: [
        {
          type: "body",
          parameters: Object.entries(templateParams).map(([, value]) => ({
            type: "text",
            text: value,
          })),
        },
      ],
    },
  };

  try {
    const resp = await fetch(metaGraphUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return {
        success: false,
        error_code: String(data?.error?.code || resp.status),
        error_message: data?.error?.message || "Meta API error",
        response: data,
      };
    }

    return {
      success: true,
      message_id: data?.messages?.[0]?.id,
      response: data,
    };
  } catch (e) {
    return {
      success: false,
      error_code: "network_error",
      error_message: e.message,
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

export function validateRequest(body: unknown): {
  valid: boolean;
  error?: string;
  order_id?: string;
  event?: SupportedEvent;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body required" };
  }

  const { order_id, event } = body as { order_id: string; event?: string };

  if (!order_id || typeof order_id !== "string") {
    return { valid: false, error: "order_id is required (string)" };
  }

  const finalEvent: SupportedEvent = (event as SupportedEvent) || "payment_success";

  if (!SUPPORTED_EVENTS.includes(finalEvent)) {
    return {
      valid: false,
      error: `Event "${event}" not supported. Supported: ${SUPPORTED_EVENTS.join(", ")}`,
    };
  }

  return { valid: true, order_id, event: finalEvent };
}

// ============================================================================
// Message Builders
// ============================================================================

/**
 * Build WABA message dari order data (template: eglux_payment_success).
 */
export function buildPaymentSuccessMessage(order: OrderData) {
  const itemsSummary = order.items
    .slice(0, 3)
    .map((it) => `• ${it.name}${it.variant ? ` (${it.variant})` : ""} × ${it.quantity}`)
    .join("\n");

  const moreItemsNote =
    order.items.length > 3
      ? `\n• ...dan ${order.items.length - 3} item lainnya`
      : "";

  const template_params: Record<string, string> = {
    "1": order.customer_name,
    "2": order.short_order_id,
    "3": formatRupiah(order.total_amount),
    "4": order.courier_service
      ? `${order.courier_code?.toUpperCase() || ""} ${order.courier_service}`.trim()
      : "Standard",
    "5": order.courier_duration || "3-5 hari kerja",
  };

  const body = `Halo ${order.customer_name}, terima kasih sudah berbelanja di EGLUX! ✨

Pesanan #${order.short_order_id} sudah kami terima dengan rincian:
${itemsSummary}${moreItemsNote}

Total: ${formatRupiah(order.total_amount)}
Pengiriman: ${template_params["4"]} (${template_params["5"]})

Resi & update status akan kami kirim via WA. Untuk pertanyaan, balas pesan ini ya.

— Tim EGLUX`;

  return {
    template_name: TEMPLATE_NAMES.payment_success,
    template_params,
    body,
  };
}
