// supabase/functions/upload-homepage-image/index.ts
// ============================================================================
// upload-homepage-image — Admin upload banner/category image ke Storage
// ============================================================================
//
// Auth: requireAdmin
// Input: FormData dengan file + type ('banner' | 'category')
// Output: { success, url }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "banner";

    if (!file) return json({ error: "file is required" }, 400);
    if (!ALLOWED_TYPES.includes(file.type)) {
      return json({ error: `File type must be: ${ALLOWED_TYPES.join(", ")}` }, 400);
    }
    if (file.size > MAX_SIZE) {
      return json({ error: "File size must be < 5MB" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Generate filename: banners/1234567890-abc123.jpg or categories/...
    const ext = file.name.split(".").pop() || "jpg";
    const filename = `${type}s/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("homepage-images")
      .upload(filename, file, { upsert: false, contentType: file.type });

    if (uploadErr) {
      return json({ error: "Upload failed", details: uploadErr.message }, 500);
    }

    const { data: urlData } = supabase.storage
      .from("homepage-images")
      .getPublicUrl(filename);

    return json({
      success: true,
      url: urlData.publicUrl,
      path: filename,
    });
  } catch (e) {
    console.error("[upload-homepage-image]", e);
    return json({ error: e.message }, 500);
  }
});
