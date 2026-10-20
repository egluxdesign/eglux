// supabase/functions/_shared/waba-shared.ts
// ============================================================================
// Shared helpers untuk WABA (WhatsApp Business API) functions — v5.1
// ============================================================================
//
// ⭐ v5.1 CHANGES (dari v5.0):
//   - TEMPLATE_NAMES.shipping_update → "shipping_updatesv2" (template baru dengan 6 vars)
//   - OrderData: tambah field `biteship_waybill_url` (untuk {{6}} di shipping_update)
//   - fetchOrderData: select `biteship_waybill_url` dari orders table
//   - buildShippingUpdateMessage: kirim 6 params (waybill_url sebagai {{6}})
//     + accept waybillUrlOverride parameter + update body text pakai waybill_url
//
// v5.0 (sebelumnya):
//   - SUPPORTED_EVENTS: 3 events (payment_success, shipping_update, retur_status)
//   - OrderData: tracking_number field
//   - 3 builders: buildPaymentSuccessMessage, buildShippingUpdateMessage, buildReturStatusMessage
//   - sendToQiscus (Skenario B - Qiscus Omnichannel API)
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

export const SUPPORTED_EVENTS = [
  "payment_success",
  "shipping_update",
  "retur_status",
] as const;
export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

// ⭐ v5.1: Template names mapping — shipping_update pakai "shipping_updatesv2"
// (template baru dengan 6 body variables — waybill_url sebagai {{6}})
// PENTING: Nama template HARUS match persis dengan yang di Qiscus Dashboard
export const TEMPLATE_NAMES: Record<SupportedEvent, string> = {
  payment_success: "payment_notification",
  shipping_update: "shipping_updatesv2",  // ⭐ v5.1: ganti dari "shipping_update" → "shipping_updatesv2"
  retur_status: "retur_status",
};

// Max retry attempts untuk failed WABA messages
export const MAX_RETRY_ATTEMPTS = 3;

export const RETRYABLE_ERROR_CODES = [
  "131047", "131052", "131073", "131030", "131031",
  "470", "131048", "131069", "10",
  "service_unavailable", "timeout", "rate_limit",
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
  tracking_number: string | null;
  // ⭐ v5.1 NEW: biteship_waybill_url untuk {{6}} di shipping_update template
  biteship_waybill_url: string | null;
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
 * ⭐ v5.1: select biteship_waybill_url juga (untuk {{6}} di shipping_update)
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
      biteship_waybill_url,
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
    tracking_number: order.tracking_number || null,
    // ⭐ v5.1 NEW
    biteship_waybill_url: order.biteship_waybill_url || null,
    items: items.map((it: any) => ({
      name: it.product_name_snapshot || "",
      variant: it.variant_name_snapshot || null,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price_snapshot) || 0,
    })),
  };
}

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

export function isRetryable(errorCode: string | null): boolean {
  if (!errorCode) return false;
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

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
// Provider API: Meta Cloud API (Skenario A — Legacy)
// ============================================================================

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
 * ⭐ v5.1: validateRequest — handle 3 events + waybill_url (untuk shipping_update)
 *
 * payment_success: butuh order_id saja
 * shipping_update: butuh order_id + optional tracking_number + optional waybill_url
 *                  (kalau gak ada di body, fallback ke DB orders.tracking_number + biteship_waybill_url)
 * retur_status: butuh order_id + retur_reference + status_text + optional additional_info
 */
export function validateRequest(body: unknown): {
  valid: boolean;
  error?: string;
  order_id?: string;
  event?: SupportedEvent;
  tracking_number?: string;
  waybill_url?: string;  // ⭐ v5.1 NEW
  retur_reference?: string;
  status_text?: string;
  additional_info?: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body required" };
  }

  const {
    order_id,
    event,
    tracking_number,
    waybill_url,  // ⭐ v5.1 NEW
    retur_reference,
    status_text,
    additional_info,
  } = body as {
    order_id?: string;
    event?: string;
    tracking_number?: string;
    waybill_url?: string;  // ⭐ v5.1 NEW
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

  if (finalEvent === "retur_status") {
    if (!retur_reference || typeof retur_reference !== "string") {
      return { valid: false, error: "retur_reference is required for retur_status event" };
    }
    if (!status_text || typeof status_text !== "string") {
      return { valid: false, error: "status_text is required for retur_status event" };
    }
  }
  // shipping_update: tracking_number + waybill_url optional (fallback ke DB)

  return {
    valid: true,
    order_id,
    event: finalEvent,
    tracking_number: tracking_number || undefined,
    waybill_url: waybill_url || undefined,  // ⭐ v5.1 NEW
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
 * ⭐ v5.1: Build WABA message untuk shipping_update event.
 * Template: shipping_updatesv2 (6 body variables — waybill_url sebagai {{6}})
 *
 * Variables:
 *   {{1}} = customer_name
 *   {{2}} = short_order_id
 *   {{3}} = courier_service (e.g., "JNE REG")
 *   {{4}} = tracking_number
 *   {{5}} = courier_duration (e.g., "3-5 hari kerja")
 *   {{6}} = waybill_url (link lacak realtime — biteship_waybill_url)  ← NEW v5.1
 *
 * Override priority:
 *   1. waybillUrlOverride dari request body (kalau ada)
 *   2. order.biteship_waybill_url dari DB
 *   3. Fallback: https://track.biteship.com/{tracking_number} (kalau waybill_url NULL)
 */
export function buildShippingUpdateMessage(
  order: OrderData,
  trackingNumberOverride?: string,
  waybillUrlOverride?: string,  // ⭐ v5.1 NEW
) {
  const trackingNumber = trackingNumberOverride || order.tracking_number || "(belum tersedia)";
  // ⭐ v5.1: waybill_url priority: override > DB > fallback
  const waybillUrl = waybillUrlOverride
    || order.biteship_waybill_url
    || `https://track.biteship.com/${trackingNumber}`;

  const template_params: Record<string, string> = {
    "1": order.customer_name,
    "2": order.short_order_id,
    "3": order.courier_service
      ? `${order.courier_code?.toUpperCase() || ""} ${order.courier_service}`.trim()
      : "Standard",
    "4": trackingNumber,
    "5": order.courier_duration || "3-5 hari kerja",
    "6": waybillUrl,  // ⭐ v5.1 NEW: waybill_url sebagai {{6}}
  };

  const body = `Halo ${order.customer_name}, kabar baik! Pesanan #${order.short_order_id} sudah dikirim via ${template_params["3"]}.

No. Resi: ${trackingNumber}
Estimasi sampai: ${template_params["5"]}

Lacak real-time di: ${waybillUrl}

— Tim EGLUX`;

  return {
    template_name: TEMPLATE_NAMES.shipping_update,  // = "shipping_updatesv2"
    template_params,
    body,
  };
}

/**
 * Build WABA message untuk retur_status event.
 * Template: retur_status (5 body variables)
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
