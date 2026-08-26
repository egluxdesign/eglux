// supabase/functions/subscribe-newsletter/index.ts
// ============================================================================
// subscribe-newsletter — Public endpoint untuk subscribe newsletter
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/subscribe-newsletter
//   Body: {
//     email: "user@example.com",
//     phone: "+6281234567890",        // OPTIONAL — nomor WA
//     name: "John Doe",                 // OPTIONAL — nama subscriber
//     source: "footer",                 // OPTIONAL — "footer" | "register" | "checkout"
//     marketing_email_opt_in: true,     // OPTIONAL — persetujuan email marketing
//     marketing_wa_opt_in: true,        // OPTIONAL — persetujuan WA marketing
//     user_id: "uuid"                   // OPTIONAL — kalau subscribe dari register (logged in)
//   }
//
// Flow:
//   1. Validate email format + phone format (kalau diisi)
//   2. UPSERT subscriber (check existing by email)
//   3. Kalau sudah active → return "already subscribed" (tapi update opt-in flags kalau berubah)
//   4. Kalau unsubscribed → re-activate + update opt-in flags
//   5. Kalau baru → INSERT
//   6. Kirim welcome email via Resend (non-blocking)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isE164(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone);
}

function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).replace(/\D/g, "");
  if (!p) return null;
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (!p.startsWith("62") && !p.startsWith("1")) p = "62" + p;
  return `+${p}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const email = (body?.email || "").trim().toLowerCase();
    const phone = normalizePhone(body?.phone || "");
    const name = (body?.name || "").trim() || null;
    const source = body?.source || "footer";
    const marketingEmailOptIn = body?.marketing_email_opt_in === true;
    const marketingWaOptIn = body?.marketing_wa_opt_in === true;
    const userId = body?.user_id || null;
    const voucherCode = (body?.voucher_code || "").trim().toUpperCase() || null;  // ⭐ NEW: voucher fisik tracking

    // Validate
    if (!email) return json({ error: "Email wajib diisi" }, 400);
    if (!isEmail(email)) return json({ error: "Format email tidak valid" }, 400);
    if (phone && !isE164(phone)) {
      return json({ error: "Format nomor WhatsApp tidak valid (harus E.164: +62xxx)" }, 400);
    }

    // ⭐ Consent requirement: minimal salah satu opt-in harus true
    // (gak boleh subscribe tanpa persetujuan minimal 1 channel)
    if (!marketingEmailOptIn && !marketingWaOptIn) {
      return json({
        error: "Pilih minimal satu channel (email atau WhatsApp) untuk subscribe newsletter",
      }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build payload untuk upsert
    const upsertData: Record<string, unknown> = {
      email,
      status: "active",
      source,
      marketing_email_opt_in: marketingEmailOptIn,
      marketing_wa_opt_in: marketingWaOptIn,
      subscribed_at: new Date().toISOString(),
    };
    if (phone) upsertData.phone = phone;
    if (name) upsertData.name = name;
    if (userId) upsertData.user_id = userId;
    if (voucherCode) upsertData.voucher_code = voucherCode;  // ⭐ NEW: voucher tracking

    console.log("[subscribe-newsletter] Upsert data:", JSON.stringify(upsertData));

    // Cek apakah email sudah ada
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status, phone, name, marketing_email_opt_in, marketing_wa_opt_in")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      // Update existing subscriber dengan opt-in flags + phone/name baru
      const { error: updateErr } = await supabase
        .from("newsletter_subscribers")
        .update({
          ...upsertData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: "Gagal update subscription", details: updateErr.message }, 500);
      }

      const wasUnsubscribed = existing.status === "unsubscribed";
      return json({
        success: true,
        message: wasUnsubscribed
          ? "Berhasil subscribe kembali! Terima kasih."
          : "Subscription Anda sudah diperbarui. Terima kasih!",
        already_subscribed: !wasUnsubscribed,
      });
    }

    // INSERT new subscriber
    const { data: insertData, error: insertErr } = await supabase
      .from("newsletter_subscribers")
      .insert(upsertData)
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        // Unique violation — race condition, email sudah ada
        return json({
          success: true,
          message: "Email sudah terdaftar.",
          already_subscribed: true,
        });
      }
      return json({ error: "Gagal menyimpan subscriber", details: insertErr.message }, 500);
    }

    const subscriberId = insertData?.id;
    console.log("[subscribe-newsletter] ✓ New subscriber:", email, "from", source, "ID:", subscriberId, {
      phone: phone || "(none)",
      name: name || "(none)",
      email_opt_in: marketingEmailOptIn,
      wa_opt_in: marketingWaOptIn,
    });

    // ⭐ Kirim welcome email via Resend (hanya kalau opt-in email = true, non-blocking)
    if (subscriberId && marketingEmailOptIn) {
      try {
        const { error: emailErr } = await supabase.functions.invoke(
          "send-newsletter-welcome",
          { body: { email, subscriber_id: subscriberId, name } }
        );
        if (emailErr) {
          console.warn("[subscribe-newsletter] Welcome email failed (subscriber still saved):", emailErr.message);
        } else {
          console.log("[subscribe-newsletter] ✓ Welcome email sent to:", email);
        }
      } catch (emailErr) {
        console.warn("[subscribe-newsletter] Welcome email invoke error (subscriber still saved):", emailErr?.message);
      }
    }

    // ⭐ NEW: Record voucher redemption (kalau ada voucher_code)
    // Voucher code hanya bisa dipakai checkout kalau ada record di voucher_redemptions
    if (voucherCode && phone) {
      try {
        const { error: redemptionErr } = await supabase
          .from("voucher_redemptions")
          .upsert({
            voucher_code: voucherCode,
            phone: phone,
            name: name,
            status: "claimed",
            claimed_at: new Date().toISOString(),
          }, {
            onConflict: "voucher_code,phone",
            ignoreDuplicates: false,
          });

        if (redemptionErr) {
          console.warn("[subscribe-newsletter] Voucher redemption record failed (non-blocking):", redemptionErr.message);
        } else {
          console.log("[subscribe-newsletter] ✓ Voucher redemption recorded:", voucherCode, phone);
        }
      } catch (redemptionErr) {
        console.warn("[subscribe-newsletter] Voucher redemption error (non-blocking):", redemptionErr?.message);
      }
    }

    return json({
      success: true,
      message: "Berhasil subscribe! Terima kasih telah bergabung dengan EGLUX.",
    });
  } catch (e) {
    console.error("[subscribe-newsletter]", e);
    return json({ error: e.message }, 500);
  }
});
