// supabase/functions/unsubscribe-newsletter/index.ts
// ============================================================================
// unsubscribe-newsletter — Unsubscribe newsletter via token
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/unsubscribe-newsletter
//   Body: { "token": "subscriber_uuid" }
//
// Flow:
//   1. Cari subscriber by ID (token) — TIDAK perlu email match (PII protection)
//   2. Update status → 'unsubscribed'
//   3. Return success (tanpa expose email di response)
//
// ⚠️ Security (v2):
//   - Email TIDAK lagi di-expose di URL unsubscribe (sebelumnya ?token=xxx&email=yyy)
//   - Lookup hanya by token (UUID) — token sudah unik, tidak perlu email match
//   - Email TIDAK di-return di response — frontend tidak perlu render email
//   - Cegah email bocor ke: browser history, server logs, Referer header
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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { token } = await req.json();

    if (!token) {
      return json({ error: "Token wajib diisi" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ⭐ Lookup subscriber by ID (token) saja — tidak perlu email match
    // Token (UUID) sudah unik, jadi email match redundant & expose PII
    const { data: subscriber, error: findErr } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("id", token)
      .maybeSingle();

    if (findErr || !subscriber) {
      return json({ error: "Token tidak valid" }, 404);
    }

    if (subscriber.status === "unsubscribed") {
      return json({
        success: true,
        message: "Email sudah unsubscribe sebelumnya.",
        already_unsubscribed: true,
      });
    }

    // Update status → unsubscribed
    const { error: updateErr } = await supabase
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("id", subscriber.id);

    if (updateErr) {
      return json({ error: "Gagal unsubscribe" }, 500);
    }

    console.log("[unsubscribe-newsletter] ✓ Unsubscribed subscriber:", subscriber.id);

    return json({
      success: true,
      message: "Berhasil unsubscribe. Kamu tidak akan menerima email newsletter lagi.",
    });
  } catch (e) {
    console.error("[unsubscribe-newsletter]", e);
    return json({ error: e.message }, 500);
  }
});
