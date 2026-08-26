// supabase/functions/register-newsletter-optin/index.ts
// ============================================================================
// register-newsletter-optin — Subscribe newsletter saat user register
// ============================================================================
//
// Dipanggil dari AuthContext.jsx SETELAH supabase.auth.signUp() sukses.
// (Bukan dari RegisterPage.jsx langsung — supaya gak duplicate logic.)
//
// Cara panggil:
//   POST /functions/v1/register-newsletter-optin
//   Headers: Authorization: Bearer <user-jwt>
//   Body: {
//     email: "user@example.com",
//     phone: "+6281234567890",
//     name: "John Doe",
//     marketing_email_opt_in: true,
//     marketing_wa_opt_in: true
//   }
//
// Flow:
//   1. Verify user JWT (harus login)
//   2. Validate email + phone format
//   3. UPSERT newsletter_subscribers dengan user_id dari JWT
//      (unique idx user_id → 1 user = 1 subscriber record)
//   4. Return success
//
// Non-blocking: kalau gagal, register tetap sukses (subscription bukan critical path)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    // ⭐ Auth: user harus login (pakai user JWT, bukan service role)
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing Bearer token" }, 401);
    }

    // Create client dengan user JWT untuk dapat user.id
    const userClient = createClient(SUPABASE_URL, authHeader.replace("Bearer ", ""));
    const { data: { user }, error: userErr } = await userClient.auth.getUser();

    if (userErr || !user) {
      return json({ error: "Unauthorized: invalid token" }, 401);
    }

    const body = await req.json();
    const email = (body?.email || user.email || "").trim().toLowerCase();
    const phone = normalizePhone(body?.phone || user.phone || "");
    const name = (body?.name || "").trim() || null;
    const marketingEmailOptIn = body?.marketing_email_opt_in === true;
    const marketingWaOptIn = body?.marketing_wa_opt_in === true;

    if (!email) return json({ error: "Email required" }, 400);
    if (!isEmail(email)) return json({ error: "Invalid email format" }, 400);

    // ⭐ Consent check: minimal 1 channel harus opt-in
    if (!marketingEmailOptIn && !marketingWaOptIn) {
      // Kalau gak ada opt-in sama sekali, skip subscribe (bukan error — user gak mau newsletter)
      return json({
        success: true,
        message: "No newsletter opt-in — subscriber not created",
        skipped: true,
      });
    }

    // Service role client untuk UPSERT (bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Build payload
    const upsertData: Record<string, unknown> = {
      email,
      status: "active",
      source: "register",
      user_id: user.id,
      marketing_email_opt_in: marketingEmailOptIn,
      marketing_wa_opt_in: marketingWaOptIn,
      subscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (phone) upsertData.phone = phone;
    if (name) upsertData.name = name;

    // ⭐ UPSERT by user_id (unique idx)
    // Kalau user sudah pernah subscribe (dari footer), update record-nya
    // Kalau belum, INSERT baru
    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, email, status")
      .or(`user_id.eq.${user.id},email.eq.${email}`)
      .maybeSingle();

    if (existing) {
      // Update existing record
      const { error: updateErr } = await supabase
        .from("newsletter_subscribers")
        .update(upsertData)
        .eq("id", existing.id);

      if (updateErr) {
        console.error("[register-newsletter-optin] Update failed:", updateErr.message);
        return json({ error: "Failed to update subscription", details: updateErr.message }, 500);
      }

      console.log("[register-newsletter-optin] ✓ Updated existing subscriber:", existing.id, {
        email, phone: phone || "(none)", email_opt_in: marketingEmailOptIn, wa_opt_in: marketingWaOptIn,
      });
    } else {
      // INSERT new
      const { error: insertErr } = await supabase
        .from("newsletter_subscribers")
        .insert(upsertData);

      if (insertErr) {
        console.error("[register-newsletter-optin] Insert failed:", insertErr.message);
        // Gak fatal — register tetap sukses
        return json({ error: "Failed to create subscription", details: insertErr.message }, 500);
      }

      console.log("[register-newsletter-optin] ✓ New subscriber created:", email, {
        user_id: user.id,
        phone: phone || "(none)",
        email_opt_in: marketingEmailOptIn,
        wa_opt_in: marketingWaOptIn,
      });
    }

    return json({
      success: true,
      message: "Newsletter subscription saved",
    });
  } catch (e) {
    console.error("[register-newsletter-optin]", e);
    return json({ error: e.message }, 500);
  }
});
