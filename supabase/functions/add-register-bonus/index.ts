// supabase/functions/add-register-bonus/index.ts
// ============================================================================
// add-register-bonus — Berikan +20 poin bonus untuk user baru register
// ============================================================================
//
// Dipanggil dari AuthContext.jsx setelah signUp() sukses (fire-and-forget).
//
// Cara panggil:
//   POST /functions/v1/add-register-bonus
//   Headers: Authorization: Bearer <anon_key>, apikey: <anon_key>
//   Body: { user_id: "uuid" }
//
// Flow:
//   1. Cek apakah user sudah pernah dapat register bonus (idempotent)
//   2. Kalau belum → call add_points RPC (+20, source='register_bonus', expire 1 tahun)
//   3. Return success
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BONUS_POINTS = 20;
const EXPIRY_DAYS = 365;

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
    const { user_id } = await req.json();
    if (!user_id) return json({ error: "user_id is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ⭐ Idempotent: cek apakah user sudah pernah dapat register bonus
    const { data: existing } = await supabase
      .from("point_transactions")
      .select("id")
      .eq("user_id", user_id)
      .eq("source", "register_bonus")
      .maybeSingle();

    if (existing) {
      return json({
        success: true,
        message: "Register bonus already awarded — skip (idempotent)",
        already_awarded: true,
      });
    }

    // ⭐ Add +20 points via RPC (atomic)
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error: rpcErr } = await supabase.rpc("add_points", {
      p_user_id: user_id,
      p_amount: BONUS_POINTS,
      p_source: "register_bonus",
      p_description: "Bonus registrasi EGLUX — Selamat datang!",
      p_expires_at: expiresAt,
    });

    if (rpcErr) {
      console.error("[add-register-bonus] RPC error:", rpcErr.message);
      return json({ error: "Failed to add bonus points", details: rpcErr.message }, 500);
    }

    console.log(`[add-register-bonus] ✓ +${BONUS_POINTS} points awarded to user ${user_id.slice(0, 8)}`);

    return json({
      success: true,
      points_awarded: BONUS_POINTS,
      message: `+${BONUS_POINTS} poin bonus registrasi berhasil ditambahkan!`,
    });
  } catch (e) {
    console.error("[add-register-bonus] Error:", e);
    return json({ error: e.message }, 500);
  }
});
