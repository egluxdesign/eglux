// supabase/functions/process-notification-queue/index.ts
// ============================================================================
// Notification Queue Worker — processes pending notification_queue items
// ============================================================================
//
// Purpose:
//   The doku-webhook now calls send-email-notification + Qiscus WABA DIRECTLY
//   (v3.5). But any notifications queued BEFORE the fix (via the old
//   notification_queue.insert() path) are stuck as "pending" with no worker.
//   This function processes those stuck items.
//
// Trigger:
//   Manual:  supabase functions invoke process-notification-queue
//   Cron:    supabase functions schedule process-notification-queue --cron '*/5 * * * *'
//
// Behavior:
//   1. Fetch pending notification_queue items (limit 10)
//   2. For each item:
//      a. Send WABA via Qiscus API (template: eglux_payment_success)
//      b. Send email via send-email-notification edge function
//      c. Update queue status → sent / failed
//   3. Return summary
//
// Required env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   QISCUS_APP_ID, QISCUS_SECRET_KEY, QISCUS_CHANNEL_ID (for WABA)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Qiscus config
const QISCUS_APP_ID = Deno.env.get("QISCUS_APP_ID");
const QISCUS_SECRET_KEY = Deno.env.get("QISCUS_SECRET_KEY");
const QISCUS_CHANNEL_ID = Deno.env.get("QISCUS_CHANNEL_ID");
const QISCUS_REGION = Deno.env.get("QISCUS_REGION") || "id";
const QISCUS_PAYMENT_TEMPLATE = Deno.env.get("QISCUS_PAYMENT_TEMPLATE") || "eglux_payment_success";
const QISCUS_TEMPLATE_NAMESPACE = Deno.env.get("QISCUS_TEMPLATE_NAMESPACE") || "4ba2e5a5_1f46_4283_8b29_b0d29113e5f3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function sha256Base64(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

// ── Send WABA via Qiscus (same pattern as doku-webhook + send-waba-otp) ──
async function sendQiscusWaba(supabase: any, orderId: string): Promise<{ success: boolean; error?: string }> {
  if (!QISCUS_APP_ID || !QISCUS_SECRET_KEY || !QISCUS_CHANNEL_ID) {
    return { success: false, error: "Qiscus env vars not set" };
  }

  try {
    const { data: orderData, error: orderErr } = await supabase
      .from("orders")
      .select(`id, total_amount, customer:customers(name, phone, email)`)
      .eq("id", orderId)
      .single();

    if (orderErr || !orderData) {
      return { success: false, error: `Order not found: ${orderErr?.message}` };
    }

    const customer = orderData.customer as any;
    let phone = String(customer?.phone || "").replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "62" + phone.slice(1);
    else if (!phone.startsWith("62")) phone = "62" + phone;
    if (phone.length < 9) return { success: false, error: `Invalid phone: ${phone}` };

    const totalAmount = Number(orderData.total_amount) || 0;
    const customerName = customer?.name || "Customer";
    const shortId = String(orderId).slice(0, 8).toUpperCase();
    const totalStr = `Rp ${totalAmount.toLocaleString("id-ID")}`;

    const baseUrl = QISCUS_REGION.toLowerCase() === "my"
      ? "https://omnichannel-my.qiscus.com"
      : "https://omnichannel.qiscus.com";
    const qiscusUrl = `${baseUrl}/whatsapp/v1/${QISCUS_APP_ID}/${QISCUS_CHANNEL_ID}/messages`;

    const payload = {
      to: phone,
      type: "template",
      template: {
        namespace: QISCUS_TEMPLATE_NAMESPACE,
        name: QISCUS_PAYMENT_TEMPLATE,
        language: { policy: "deterministic", code: "id" },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: customerName },
            { type: "text", text: shortId },
            { type: "text", text: totalStr },
          ],
        }],
      },
    };

    console.log(`[worker] WABA → ${phone} (order ${shortId})`);

    const resp = await fetch(qiscusUrl, {
      method: "POST",
      headers: {
        "Qiscus-App-Id": QISCUS_APP_ID,
        "Qiscus-Secret-Key": QISCUS_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let qiscusData: any;
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) qiscusData = await resp.json();
    else { const t = await resp.text(); try { qiscusData = JSON.parse(t); } catch { qiscusData = { raw: t }; } }

    const msgId = qiscusData?.data?.message_id || qiscusData?.data?.id || "";

    // Save to waba_messages
    try {
      await supabase.from("waba_messages").insert({
        order_id: orderId,
        event: "payment_success",
        phone,
        template_name: QISCUS_PAYMENT_TEMPLATE,
        status: resp.ok ? "sent" : "failed",
        mode: "live",
        message_id: msgId,
        error_message: resp.ok ? null : JSON.stringify(qiscusData?.error || qiscusData).substring(0, 500),
        raw_response: qiscusData,
      });
    } catch (e) { console.warn("[worker] waba_messages save failed:", e); }

    if (!resp.ok) {
      return { success: false, error: `Qiscus ${resp.status}: ${JSON.stringify(qiscusData).substring(0, 150)}` };
    }

    console.log(`[worker] ✓ WABA sent: ${msgId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Send email via send-email-notification edge function ──
async function sendEmail(supabase: any, orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "payment_success", order_id: orderId }),
    });

    const text = await resp.text();
    let result: any;
    try { result = JSON.parse(text); } catch { result = { raw: text }; }

    if (!resp.ok || (!result.success && !result.skipped)) {
      return { success: false, error: result.error || `HTTP ${resp.status}` };
    }

    console.log(`[worker] ✓ Email sent for ${orderId.slice(0, 8)}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log("[worker] === Processing notification_queue ===");

  // 1. Fetch pending items (limit 10 per run)
  const { data: pendingItems, error: fetchErr } = await supabase
    .from("notification_queue")
    .select("id, type, order_id, payload, attempts")
    .eq("status", "pending")
    .lt("attempts", 3)  // max 3 attempts
    .order("created_at", { ascending: true })
    .limit(10);

  if (fetchErr) {
    console.error("[worker] Failed to fetch queue:", fetchErr);
    return json({ success: false, error: fetchErr.message }, 500);
  }

  if (!pendingItems || pendingItems.length === 0) {
    console.log("[worker] No pending notifications.");
    return json({ success: true, processed: 0, message: "No pending notifications" });
  }

  console.log(`[worker] Found ${pendingItems.length} pending notification(s)`);

  let sent = 0;
  let failed = 0;

  for (const item of pendingItems) {
    console.log(`[worker] Processing ${item.id} (type=${item.type}, order=${item.order_id?.slice(0, 8)})`);

    const orderId = item.order_id;
    if (!orderId) {
      // No order_id → mark as failed
      await supabase.from("notification_queue").update({
        status: "failed",
        last_error: "No order_id",
        attempts: (item.attempts || 0) + 1,
      }).eq("id", item.id);
      failed++;
      continue;
    }

    // Send WABA + Email
    const [wabaResult, emailResult] = await Promise.all([
      sendQiscusWaba(supabase, orderId),
      sendEmail(supabase, orderId),
    ]);

    const allOk = wabaResult.success || emailResult.success;  // at least one succeeded
    const errors = [
      wabaResult.success ? null : `WABA: ${wabaResult.error}`,
      emailResult.success ? null : `Email: ${emailResult.error}`,
    ].filter(Boolean).join("; ");

    if (allOk) {
      await supabase.from("notification_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: (item.attempts || 0) + 1,
        last_error: errors || null,
      }).eq("id", item.id);
      sent++;
      console.log(`[worker] ✓ ${item.id} → sent (${errors || "all OK"})`);
    } else {
      await supabase.from("notification_queue").update({
        status: (item.attempts || 0) + 1 >= 3 ? "failed" : "pending",
        attempts: (item.attempts || 0) + 1,
        last_error: errors,
      }).eq("id", item.id);
      failed++;
      console.error(`[worker] ❌ ${item.id} → failed: ${errors}`);
    }
  }

  const summary = { success: true, processed: pendingItems.length, sent, failed };
  console.log("[worker] === DONE ===", summary);
  return json(summary);
});