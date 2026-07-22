// supabase/functions/subscribe-newsletter/index.ts
// ============================================================================
// subscribe-newsletter — Public endpoint untuk subscribe newsletter
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/subscribe-newsletter
//   Body: { "email": "user@example.com", "source": "footer" }
//
// Flow:
//   1. Validate email format
//   2. Check apakah email sudah subscribe (UPSERT)
//   3. Kalau sudah active → return "already subscribed"
//   4. Kalau unsubscribed → re-activate
//   5. Kalau baru → INSERT
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const email = (body?.email || "").trim().toLowerCase();
    const source = body?.source || "footer";

    if (!email) return json({ error: "Email wajib diisi" }, 400);
    if (!isEmail(email)) return json({ error: "Format email tidak valid" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Cek apakah email sudah ada
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (existing.status === "active") {
        return json({
          success: true,
          message: "Email sudah terdaftar. Terima kasih sudah subscribe!",
          already_subscribed: true,
        });
      }
      // Re-activate kalau sebelumnya unsubscribed
      const { error: updateErr } = await supabase
        .from("newsletter_subscribers")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateErr) {
        return json({ error: "Gagal re-activate subscription" }, 500);
      }
      return json({
        success: true,
        message: "Berhasil subscribe kembali! Terima kasih.",
      });
    }

    // INSERT new subscriber (dapat subscriber_id untuk email link)
    const { data: insertData, error: insertErr } = await supabase
      .from("newsletter_subscribers")
      .insert({ email, status: "active", source })
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
    console.log("[subscribe-newsletter] ✓ New subscriber:", email, "from", source, "ID:", subscriberId);

    // ⭐ Kirim welcome email via Resend (non-blocking — jangan fail subscribe kalau email gagal)
    if (subscriberId) {
      try {
        const { error: emailErr } = await supabase.functions.invoke(
          "send-newsletter-welcome",
          { body: { email, subscriber_id: subscriberId } }
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

    return json({
      success: true,
      message: "Berhasil subscribe! Cek email kamu untuk konfirmasi. Terima kasih telah bergabung.",
    });
  } catch (e) {
    console.error("[subscribe-newsletter]", e);
    return json({ error: e.message }, 500);
  }
});
