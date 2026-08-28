// supabase/functions/change-password/index.ts
// ============================================================================
// change-password — Ganti/set password user
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/change-password
//   Headers: Authorization: Bearer <jwt>
//   Body: {
//     new_password: string,        // min 8 chars, max 72 chars
//     verified: boolean            // frontend harus verify current password
//                                  //   via supabase.auth.signInWithPassword()
//                                  //   sebelum call endpoint ini
//   }
//
// ⭐ Arsitektur:
//   - Frontend verify current password via signInWithPassword (anon key)
//   - Endpoint cuma handle update password (gak butuh anon key)
//   - Tidak wajib cek provider — getUserById opsional (untuk message saja)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ── Pre-flight: cek env vars ──
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[change-password] Missing env vars:", {
      hasUrl: !!SUPABASE_URL,
      hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
    });
    return json({ error: "Server configuration error (missing env vars)" }, 500);
  }

  try {
    const t0 = Date.now();

    // ── Step 1: Auth ──
    console.log("[change-password] Step 1: requireAuthenticated");
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) {
      console.warn("[change-password] Auth failed:", JSON.stringify(authResult));
      return authResult.response!;
    }

    // ⭐ FIX: Validate userId exists AND is valid UUID format
    // authResult.user might be undefined even if success=true (parallel fetch edge case)
    const userId = authResult.user?.id;
    console.log("[change-password] userId from authResult:", userId);

    if (!userId) {
      console.error("[change-password] ❌ No userId in auth result. authResult.user:", authResult.user);
      return json({
        error: "User ID tidak ditemukan di session. Coba logout dan login ulang.",
        debug: { has_user: !!authResult.user, user_keys: authResult.user ? Object.keys(authResult.user) : [] },
      }, 400);
    }

    // Validate UUID format (supabase-js updateUserById strict about this)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(userId)) {
      console.error("[change-password] ❌ Invalid UUID format:", JSON.stringify(userId));
      return json({
        error: "Format User ID tidak valid. Coba logout dan login ulang.",
        debug: { userId_received: userId, userId_type: typeof userId },
      }, 400);
    }

    console.log(`[change-password] ✓ Auth OK for user ${userId} (${Date.now() - t0}ms)`);

    // ── Step 2: Parse body ──
    console.log("[change-password] Step 2: parse body");
    const body = await req.json().catch((e) => {
      console.error("[change-password] Body parse error:", e?.message);
      return {};
    });
    const { new_password, verified } = body;
    console.log("[change-password] Body:", {
      has_new_password: !!new_password,
      new_password_length: new_password?.length,
      verified: !!verified,
    });

    // ── Step 3: Validate new_password ──
    console.log("[change-password] Step 3: validate new_password");
    if (!new_password || typeof new_password !== "string") {
      return json({ error: "new_password wajib diisi" }, 400);
    }
    if (new_password.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter` }, 400);
    }
    if (new_password.length > MAX_PASSWORD_LENGTH) {
      return json({ error: `Password baru maksimal ${MAX_PASSWORD_LENGTH} karakter` }, 400);
    }

    // ── Step 4: Validate verified flag ──
    console.log("[change-password] Step 4: validate verified flag");
    if (!verified) {
      return json({
        error: "Current password belum diverifikasi. Frontend harus verify via signInWithPassword sebelum call endpoint ini.",
        requires_frontend_verify: true,
      }, 400);
    }

    // ── Step 5: Update password ──
    console.log("[change-password] Step 5: create admin client");
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("[change-password] Step 6: updateUserById");
    const tUpdate = Date.now();
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, {
      password: new_password,
    });
    console.log(`[change-password] updateUserById: ${Date.now() - tUpdate}ms`);

    if (updateErr) {
      console.error("[change-password] ❌ updateUserById failed:", updateErr.message, updateErr.status);
      return json({
        error: "Gagal update password",
        details: updateErr.message,
        code: updateErr.name,
      }, 500);
    }

    // ── Step 7: Done ──
    console.log(`[change-password] ✓ Password changed for user ${userId} (total ${Date.now() - t0}ms)`);
    return json({
      success: true,
      message: "Password berhasil diubah. Anda akan dialihkan ke halaman login.",
      force_logout: true,
    });
  } catch (e) {
    console.error("[change-password] ❌ Uncaught error:", e?.message || e);
    console.error("[change-password] Stack:", e?.stack);
    return json({
      error: e?.message || "Internal server error",
      stack: e?.stack?.split("\n").slice(0, 3).join(" | "),
    }, 500);
  }
});
