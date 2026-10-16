// supabase/functions/_shared/waba-shared.ts
// ============================================================================
// Shared helpers untuk WABA (WhatsApp Business API) functions — v5.0
// ============================================================================
// Dipakai oleh:
//   - send-waba-test/index.ts
//   - send-waba-live/index.ts (v4.1 — handle 3 events)
//   - admin-resend-waba/index.ts
//   - cron-retry-failed-waba/index.ts
//   - midtrans-webhook/index.ts (v3.3 — call send-waba-live untuk shipping_update)
//   - submit-return-request/index.ts (v3.2 — call send-waba-live untuk retur_status)
//
// ⭐ v5.0 CHANGES:
//   - SUPPORTED_EVENTS: tambah "shipping_update" + "retur_status" (sebelumnya cuma "payment_success")
//   - TEMPLATE_NAMES: tambah 2 mapping (shipping_update + retur_status templates)
//   - OrderData: tambah field `tracking_number` (untuk shipping_update)
//   - fetchOrderData: select tracking_number dari orders table
//   - validateRequest: handle event-specific fields (tracking_number, retur_reference, status_text, additional_info)
//   - New builder: buildShippingUpdateMessage(order) — 5 params
//   - New builder: buildReturStatusMessage(order, returRef, status, info) — 5 params
//
// Berisi:
//   - Constants: CORS_HEADERS, SUPPORTED_EVENTS, TEMPLATE_NAMES, MAX_RETRY_ATTEMPTS
//   - Types: SupportedEvent, OrderData, WabaMessage
//   - Helpers: jsonResponse, normalizePhoneForMeta, formatRupiah, shortOrderId
//   - DB: fetchOrderData, saveWabaMessage, updateWabaMessageStatus, fetchWabaMessage
//   - Retry: fetchMessagesForRetry, isRetryable, updateRetryTracking
//   - Provider APIs: sendToMeta (legacy Skenario A), sendToQiscus (active Skenario B)
//   - Validation: validateRequest
//   - Builders: buildPaymentSuccessMessage, buildShippingUpdateMessage, buildReturStatusMessage
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

// ⭐ v5.0: 3 events sekarang (sebelumnya cuma 1)
export const SUPPORTED_EVENTS = [
  "payment_success",
  "shipping_update",
  "retur_status",
] as const;
export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

// ⭐ v5.0: 3 template names mapping ke Qiscus-approved templates
// PENTING: Nama template HARUS match persis dengan yang di Qiscus Dashboard
// (case-sensitive, exact spelling). Kalau gak match, Qiscus API akan reject.
//
// Template names yang approved di Qiscus Dashboard (per 16 Okt 2026):
//   - "payment_notification"   (untuk event payment_success)
//   - "shipping_update"         (untuk event shipping_update)
//   - "retur_status"            (untuk event retur_status)
export const TEMPLATE_NAMES: Record<SupportedEvent, string> = {
  payment_success: "payment_notification",
  shipping_update: "shipping_update",
  retur_status: "retur_status",
};

// Max retry attempts untuk failed WABA messages (cron auto-retry)
export const MAX_RETRY_ATTEMPTS = 3;

// Error codes yang eligible untuk retry (Meta Cloud API docs — Qiscus pakai Meta codes juga)
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
  // ⭐ v5.0: tracking_number dari orders table (untuk shipping_update event)
  tracking_number: string | null;
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
 * Normalize phone ke E.164 tanpa "+" (format Meta Cloud API / Qiscus).
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
 * ⭐ v5.0: select tracking_number juga (untuk shipping_update event)
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
      tracking_number,
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
    // ⭐ v5.0: tracking_number (string nullable)
    tracking_number: order.tracking_number || null,
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

  const message = await fetchWabaMessage(supabaseUrl, serviceRoleKey, messageId);
  if (!message) {
    console.error("[waba-shared] updateRetryTracking: message not found");
    return;
  }

  const newRetryCount = message.retry_count + 1;
  const isMaxReached = newRetryCount >= MAX_RETRY_ATTEMPTS;

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
// Provider API: Meta Cloud API (Skenario A — Legacy, kept for reference)
// ============================================================================

/**
 * Send message ke Meta Cloud API (Skenario A).
 * DEPRECATED: EGLUX pakai Qiscus Omnichannel API (Skenario B → sendToQiscus).
 * Function ini tetap dipertahankan untuk fallback kalau balik ke Skenario A.
 */
export async function sendToMeta(
  metaGraphUrl: string,
  accessToken: string,
  phoneNumber: string,
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
// Provider API: Qiscus Omnichannel API (Skenario B — Active)
// ============================================================================
// Reference:
//   - https://documentation.qiscus.com/omnichannel-chat/whatsapp-business-api
//   - https://support.qiscus.com/hc/en-us/articles/1732590664439
// ============================================================================

/**
 * Send message ke Qiscus Omnichannel API (Skenario B).
 */
export async function sendToQiscus(
  qiscusApiUrl: string,
  appId: string,
  secretKey: string,
  phoneNumber: string,
  templateName: string,
  templateNamespace: string,
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
    to: phoneNumber,
    type: "template",
    template: {
      namespace: templateNamespace,
      name: templateName,
      language: {
        policy: "deterministic",
        code: templateLanguage,
      },
      components: [
        {
          type: "body",
          parameters: Object.entries(templateParams).map(([, value]) => ({
            type: "text",
            text: String(value ?? ""),
          })),
        },
      ],
    },
  };

  try {
    const resp = await fetch(qiscusApiUrl, {
      method: "POST",
      headers: {
        "Qiscus-App-Id": appId,
        "Qiscus-Secret-Key": secretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data: any;
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await resp.json();
    } else {
      const text = await resp.text();
      try { data = JSON.parse(text); } catch { data = { raw_text: text }; }
    }

    if (!resp.ok) {
      const errorMsg =
        data?.error?.message ||
        data?.data?.message ||
        data?.error_message ||
        data?.error ||
        data?.message ||
        `Qiscus API error (HTTP ${resp.status})`;
      const errorCode =
        data?.error?.code ||
        data?.error_code ||
        data?.status ||
        String(resp.status);

      return {
        success: false,
        error_code: String(errorCode),
        error_message: String(errorMsg),
        response: data,
      };
    }

    const messageId =
      data?.data?.message_id ||
      data?.data?.id ||
      data?.message_id ||
      data?.messages?.[0]?.id ||
      data?.id ||
      undefined;

    return {
      success: true,
      message_id: messageId,
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

/**
 * ⭐ v5.0: Validate request body untuk 3 events.
 *
 * payment_success: butuh order_id saja
 * shipping_update: butuh order_id + optional tracking_number (kalau gak ada, ambil dari DB)
 * retur_status: butuh order_id + retur_reference + status_text + optional additional_info
 */
export function validateRequest(body: unknown): {
  valid: boolean;
  error?: string;
  order_id?: string;
  event?: SupportedEvent;
  // ⭐ v5.0: event-specific fields
  tracking_number?: string;          // untuk shipping_update (optional — fallback ke DB)
  retur_reference?: string;          // untuk retur_status
  status_text?: string;              // untuk retur_status
  additional_info?: string;           // untuk retur_status
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body required" };
  }

  const {
    order_id,
    event,
    tracking_number,
    retur_reference,
    status_text,
    additional_info,
  } = body as {
    order_id?: string;
    event?: string;
    tracking_number?: string;
    retur_reference?: string;
    status_text?: string;
    additional_info?: string;
  };

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

  // Event-specific validation
  if (finalEvent === "retur_status") {
    if (!retur_reference || typeof retur_reference !== "string") {
      return { valid: false, error: "retur_reference is required for retur_status event" };
    }
    if (!status_text || typeof status_text !== "string") {
      return { valid: false, error: "status_text is required for retur_status event" };
    }
  }
  // shipping_update: tracking_number optional (akan fallback ke DB kalau kosong)
  // payment_success: tidak butuh field tambahan

  return {
    valid: true,
    order_id,
    event: finalEvent,
    tracking_number: tracking_number || undefined,
    retur_reference: retur_reference || undefined,
    status_text: status_text || undefined,
    additional_info: additional_info || "Tidak ada info tambahan",
  };
}

// ============================================================================
// Message Builders
// ============================================================================

/**
 * Build WABA message untuk payment_success event.
 * Template: payment_notification (5 body variables)
 *
 * Variables:
 *   {{1}} = customer_name
 *   {{2}} = short_order_id
 *   {{3}} = total_amount (formatRupiah)
 *   {{4}} = courier_service (e.g., "JNE REG")
 *   {{5}} = courier_duration (e.g., "3-5 hari kerja")
 */
export function buildPaymentSuccessMessage(order: OrderData) {
  const template_params: Record<string, string> = {
    "1": order.customer_name,
    "2": order.short_order_id,
    "3": formatRupiah(order.total_amount),
    "4": order.courier_service
      ? `${order.courier_code?.toUpperCase() || ""} ${order.courier_service}`.trim()
      : "Standard",
    "5": order.courier_duration || "3-5 hari kerja",
  };

  const body = `Halo ${order.customer_name}, terima kasih sudah berbelanja di EGLUX!

Pesanan #${order.short_order_id} sudah kami terima.

Total: ${formatRupiah(order.total_amount)}
Pengiriman: ${template_params["4"]} (${template_params["5"]})

Harap kembali ke aplikasi EGLUX untuk melihat detail pesanan.

— Tim EGLUX`;

  return {
    template_name: TEMPLATE_NAMES.payment_success,
    template_params,
    body,
  };
}

/**
 * ⭐ v5.0: Build WABA message untuk shipping_update event.
 * Template: shipping_update (5 body variables)
 *
 * Variables:
 *   {{1}} = customer_name
 *   {{2}} = short_order_id
 *   {{3}} = courier_service (e.g., "JNE REG")
 *   {{4}} = tracking_number
 *   {{5}} = courier_duration (e.g., "3-5 hari kerja")
 *
 * Note: {{4}} dipake 2x di template body (No. Resi display + URL tracking).
 */
export function buildShippingUpdateMessage(
  order: OrderData,
  trackingNumberOverride?: string,
) {
  const trackingNumber = trackingNumberOverride || order.tracking_number || "(belum tersedia)";

  const template_params: Record<string, string> = {
    "1": order.customer_name,
    "2": order.short_order_id,
    "3": order.courier_service
      ? `${order.courier_code?.toUpperCase() || ""} ${order.courier_service}`.trim()
      : "Standard",
    "4": trackingNumber,
    "5": order.courier_duration || "3-5 hari kerja",
  };

  const body = `Halo ${order.customer_name}, kabar baik! Pesanan #${order.short_order_id} sudah dikirim via ${template_params["3"]}.

No. Resi: ${trackingNumber}
Estimasi sampai: ${template_params["5"]}

Lacak real-time di: https://track.biteship.com/${trackingNumber}

— Tim EGLUX`;

  return {
    template_name: TEMPLATE_NAMES.shipping_update,
    template_params,
    body,
  };
}

/**
 * ⭐ v5.0: Build WABA message untuk retur_status event.
 * Template: retur_status (5 body variables)
 *
 * Variables:
 *   {{1}} = customer_name
 *   {{2}} = retur_reference (e.g., "RET-0001")
 *   {{3}} = short_order_id
 *   {{4}} = status_text (e.g., "Disetujui", "Ditolak", "Refund diproses", "Refund selesai")
 *   {{5}} = additional_info (default: "Tidak ada info tambahan")
 */
export function buildReturStatusMessage(
  order: OrderData,
  returReference: string,
  statusText: string,
  additionalInfo: string = "Tidak ada info tambahan",
) {
  const template_params: Record<string, string> = {
    "1": order.customer_name,
    "2": returReference,
    "3": order.short_order_id,
    "4": statusText,
    "5": additionalInfo || "Tidak ada info tambahan",
  };

  const body = `Halo ${order.customer_name}, update untuk retur #${returReference} pada pesanan #${order.short_order_id}.

Status: ${statusText}
Info: ${template_params["5"]}

Lihat detail lengkap di aplikasi EGLUX.

— Tim EGLUX`;

  return {
    template_name: TEMPLATE_NAMES.retur_status,
    template_params,
    body,
  };
}