// supabase/functions/update-profile/index.ts
// ============================================================================
// update-profile — Update user profile (full_name, phone, address, avatar)
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/update-profile
//   Headers: Authorization: Bearer <jwt>
//   Body: {
//     full_name?: string,    // min 2 chars, max 100 chars
//     phone?: string,        // format E.164 (+62xxx) atau 08xxx, max 20 chars
//     address?: string,      // alamat lengkap (jalan, nomor, RT/RW)
//     city?: string,         // kota
//     postal_code?: string,  // kode pos (max 10 chars)
//     avatar_url?: string    // URL avatar (dari Storage atau dataURL fallback)
//   }
//
// Catatan:
//   - Email TIDAK bisa diubah (anti break FK)
//   - Avatar di-handle di frontend: generate pixel art → upload ke Storage →
//     pass URL ke sini untuk disimpan di profiles.avatar_url
//   - Phone saat ini langsung update (no OTP).
//   - Field yang tidak di-pass akan di-skip (partial update)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Normalize phone ke format E.164 (Indonesia)
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("08")) {
    return "+62" + trimmed.slice(1);
  }
  if (trimmed.startsWith("62") && !trimmed.startsWith("+62")) {
    return "+" + trimmed;
  }
  if (trimmed.startsWith("+62")) {
    return trimmed;
  }
  if (trimmed.startsWith("8") && trimmed.length >= 9) {
    return "+62" + trimmed;
  }
  return trimmed;
}

function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^\+62\d{9,13}$/.test(normalized) || /^\+\d{10,15}$/.test(normalized);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    const body = await req.json().catch(() => ({}));
    const { full_name, phone, address, city, postal_code, avatar_url } = body;

    // ── Validate inputs (hanya field yang di-pass) ──
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (full_name !== undefined) {
      if (typeof full_name !== "string" || full_name.trim().length < 2) {
        return json({ error: "Nama minimal 2 karakter" }, 400);
      }
      if (full_name.trim().length > 100) {
        return json({ error: "Nama maksimal 100 karakter" }, 400);
      }
      updates.full_name = full_name.trim();
    }

    if (phone !== undefined) {
      if (phone === null || phone === "") {
        updates.phone = null;
      } else {
        if (typeof phone !== "string" || !isValidPhone(phone)) {
          return json({
            error: "Nomor WhatsApp tidak valid. Format: +62xxx atau 08xxx (9-13 digit setelah kode negara)",
          }, 400);
        }
        updates.phone = normalizePhone(phone);
      }
    }

    if (address !== undefined) {
      if (address === null || address === "") {
        updates.address = null;
      } else {
        if (typeof address !== "string" || address.length > 500) {
          return json({ error: "Alamat maksimal 500 karakter" }, 400);
        }
        updates.address = address.trim();
      }
    }

    if (city !== undefined) {
      if (city === null || city === "") {
        updates.city = null;
      } else {
        if (typeof city !== "string" || city.length > 100) {
          return json({ error: "Kota maksimal 100 karakter" }, 400);
        }
        updates.city = city.trim();
      }
    }

    if (postal_code !== undefined) {
      if (postal_code === null || postal_code === "") {
        updates.postal_code = null;
      } else {
        if (typeof postal_code !== "string" || postal_code.length > 10) {
          return json({ error: "Kode pos maksimal 10 karakter" }, 400);
        }
        updates.postal_code = postal_code.trim();
      }
    }

    if (avatar_url !== undefined) {
      // Avatar URL bisa dari Storage public URL atau dataURL (fallback)
      if (avatar_url === null || avatar_url === "") {
        updates.avatar_url = null;
      } else {
        if (typeof avatar_url !== "string") {
          return json({ error: "avatar_url harus string" }, 400);
        }
        // Validate: harus URL http(s) atau dataURL
        if (!avatar_url.startsWith("http") && !avatar_url.startsWith("data:")) {
          return json({ error: "avatar_url format tidak valid" }, 400);
        }
        updates.avatar_url = avatar_url;
      }
    }

    // Kalau gak ada field yang di-update
    if (Object.keys(updates).length === 1) { // hanya updated_at
      return json({ error: "Tidak ada field yang di-update. Kirim full_name, phone, address, city, postal_code, atau avatar_url." }, 400);
    }

    // ── Update profile ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("id, full_name, email, phone, address, city, postal_code, avatar_url, role")
      .single();

    if (error) {
      console.error("[update-profile] DB error:", error);
      return json({ error: "Gagal update profile", details: error.message }, 500);
    }

    console.log(`[update-profile] ✓ Updated for user ${userId}:`, Object.keys(updates).filter(k => k !== "updated_at"));
    return json({
      success: true,
      message: "Profile berhasil diupdate",
      profile: data,
    });
  } catch (e) {
    console.error("[update-profile] Error:", e);
    return json({ error: e.message }, 500);
  }
});
