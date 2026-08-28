// supabase/functions/upload-avatar/index.ts
// ============================================================================
// upload-avatar — Upload user avatar ke Supabase Storage
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/upload-avatar
//   Headers: Authorization: Bearer <jwt>
//   Body: multipart/form-data dengan field 'file' (image/jpeg, image/png, image/webp)
//
// Flow:
//   1. Verify JWT + ambil user.id
//   2. Parse multipart form
//   3. Validate file type (jpg/png/webp) + size (max 2MB)
//   4. Upload ke Storage bucket 'avatars' dengan path: {user_id}/avatar.{ext}
//   5. Hapus avatar lama kalau ada (rename = delete + upload)
//   6. Update profiles.avatar_url
//   7. Return public URL
//
// Path convention: avatars/{user_id}/avatar.{ext}
// RLS Storage policy: user hanya bisa upload ke folder sendiri (auth.uid())
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_EXTS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 1. Parse multipart form ──
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return json({ error: "File tidak ditemukan. Field name harus 'file'." }, 400);
    }

    // ── 2. Validate file type ──
    const contentType = file.type;
    if (!ALLOWED_TYPES.includes(contentType)) {
      return json({
        error: `Tipe file tidak didukung. Allowed: ${ALLOWED_TYPES.join(", ")}`,
      }, 400);
    }

    // ── 3. Validate file size ──
    if (file.size > MAX_SIZE) {
      return json({ error: `File terlalu besar. Maksimal 2MB (saat ini ${(file.size / 1024 / 1024).toFixed(2)}MB).` }, 400);
    }

    // ── 4. Upload ke Storage ──
    const ext = ALLOWED_EXTS[contentType];
    const filePath = `${userId}/avatar.${ext}`;

    // Hapus avatar lama kalau ada (semua ekstensi)
    for (const oldExt of ["jpg", "png", "webp"]) {
      if (oldExt !== ext) {
        await supabase.storage.from("avatars").remove([`${userId}/avatar.${oldExt}`]);
      }
    }

    // Upload file baru
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(filePath, arrayBuffer, {
        contentType,
        upsert: true, // overwrite kalau sama path
      });

    if (uploadErr) {
      console.error("[upload-avatar] Storage error:", uploadErr);
      return json({ error: "Gagal upload avatar ke storage", details: uploadErr.message }, 500);
    }

    // ── 5. Get public URL ──
    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    const publicUrl = publicUrlData.publicUrl;
    // Tambah cache-buster supaya browser gak pakai cached image lama
    const cacheBustedUrl = `${publicUrl}?t=${Date.now()}`;

    // ── 6. Update profiles.avatar_url ──
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateErr) {
      console.error("[upload-avatar] Profile update error:", updateErr);
      // Avatar sudah ter-upload, tapi profile belum diupdate. Return URL tetap.
      return json({
        success: true,
        avatar_url: cacheBustedUrl,
        warning: "Avatar ter-upload tapi profile belum ter-update. Coba refresh halaman.",
      });
    }

    console.log(`[upload-avatar] ✓ Avatar uploaded for user ${userId}: ${filePath}`);
    return json({
      success: true,
      avatar_url: cacheBustedUrl,
      message: "Avatar berhasil diupload",
    });
  } catch (e) {
    console.error("[upload-avatar] Error:", e);
    return json({ error: e.message }, 500);
  }
});
