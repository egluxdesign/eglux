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
// ⭐ v2: strip ALL non-digit chars (spasi, dash, kurung, titik) sebelum normalize
// Sebelumnya: phone dengan spasi/dash ("0812 3456 7890") gak ke-handle → validation fail
function normalizePhone(phone: string): string {
  if (!phone) return "";
  // ⭐ Bersihin semua karakter non-digit + non-leading-plus
  // Step 1: Trim whitespace awal/akhir
  let trimmed = phone.trim();

  // Step 2: Detect kalau ada leading + (international)
  const hasLeadingPlus = trimmed.startsWith("+");

  // Step 3: Strip SEMUA non-digit chars (spasi, dash, kurung, titik, dll)
  const digitsOnly = trimmed.replace(/[^\d]/g, "");

  // Step 4: Reconstruct berdasarkan pattern
  // Indonesia: 08xxx → +628xxx | 62xxx → +62xxx | 8xxx (>=9 digit) → +628xxx
  // International: +<digits>
  if (digitsOnly.startsWith("08")) {
    return "+62" + digitsOnly.slice(1);          // 08xxx → +628xxx
  }
  if (digitsOnly.startsWith("62")) {
    return "+" + digitsOnly;                      // 62xxx → +62xxx
  }
  if (digitsOnly.startsWith("8") && digitsOnly.length >= 9 && !hasLeadingPlus) {
    return "+62" + digitsOnly;                    // 8xxx (tanpa 0 atau 62) → +628xxx
  }
  if (hasLeadingPlus) {
    return "+" + digitsOnly;                      // +<digits>
  }
  // Fallback: kalau gak match pattern, return digits aja (akan fail validation)
  return digitsOnly;
}

function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const normalized = normalizePhone(phone);
  // ⭐ Indonesian phone: +62 + 9-13 digit (total 11-15 digit after +62)
  // International: + + 10-15 digit total
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
          const normalized = normalizePhone(phone);
          return json({
            error: `Nomor WhatsApp tidak valid. Format yang diterima: +62xxx atau 08xxx (9-13 digit setelah kode negara).
            Anda kirim: "${phone}", setelah normalize: "${normalized}"`,
          }, 400);
        }
        updates.phone = normalizePhone(phone);
      }
    }

    // ⛔ SKIP: address, city, postal_code
    // SQL 024 sudah DROP city + postal_code dari profiles table (sengaja —
    // data alamat lengkap disimpan di orders table saat checkout, bukan di profile)
    // address column juga tidak pernah ada di profiles schema.
    // Frontend mungkin masih kirim field ini (untuk backward compat), tapi kita
    // ignore supaya gak trigger PostgreSQL error "column does not exist".
    // Kalau user mau update alamat pengiriman, itu dilakukan saat checkout
    // (create-order edge function insert ke customers table per-order).
    if (address !== undefined) {
      console.log("[update-profile] Ignoring 'address' field — column doesn't exist in profiles table (stored per-order in customers/orders tables)");
    }
    if (city !== undefined) {
      console.log("[update-profile] Ignoring 'city' field — column dropped by SQL 024 (stored per-order in orders table)");
    }
    if (postal_code !== undefined) {
      console.log("[update-profile] Ignoring 'postal_code' field — column dropped by SQL 024 (stored per-order in orders table)");
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
      .select("id, full_name, email, phone, avatar_url, role")
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
