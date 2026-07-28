// supabase/functions/upload-blog-media/index.ts
// ============================================================================
// upload-blog-media — Upload image/video to blog-media storage bucket
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/upload-blog-media
//   Headers: Authorization: Bearer <admin-jwt>
//   Body: FormData { file: <File> }
//
// Returns: { success: true, url: "https://...supabase.co/storage/v1/object/public/blog-media/..." }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "video/mp4", "video/webm", "video/quicktime",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return json({ error: "File wajib diisi" }, 400);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: `Tipe file tidak diizinkan: ${file.type}. Hanya image dan video.` }, 400);
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: "Ukuran file terlalu besar. Maksimal 50MB." }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate unique filename
    const ext = file.name.split(".").pop() || "bin";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = filename;

    // Upload to blog-media bucket
    const { error: uploadError } = await supabase.storage
      .from("blog-media")
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      return json({ error: "Upload gagal: " + uploadError.message }, 500);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from("blog-media")
      .getPublicUrl(filePath);

    return json({
      success: true,
      url: publicUrlData.publicUrl,
      path: filePath,
      type: file.type,
      size: file.size,
    });
  } catch (e) {
    console.error("[upload-blog-media]", e);
    return json({ error: e.message }, 500);
  }
});
