// supabase/functions/admin-search-user/index.ts
// ============================================================================
// admin-search-user — Admin search user by email (bypass RLS)
// ============================================================================
//
// Cara panggil:
//   POST /functions/v1/admin-search-user
//   Headers: Authorization: Bearer <user-jwt> (admin only)
//   Body: { email: "user@example.com" }
//
// Return: profile + user_points + point_transactions (last 20)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ⭐ Admin only
    const authResult = await requireAdmin(req);
    if (!authResult.success) return authResult.response!;

    const { email } = await req.json();
    if (!email || !email.trim()) return json({ error: "Email is required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Search profile — coba exact match dulu (pake index, cepat), fallback ke ilike
    const searchEmail = email.trim();
    let profile = null;

    // Exact match (cepat — pakai index)
    const { data: exactMatch } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone, role")
      .eq("email", searchEmail.toLowerCase())
      .maybeSingle();

    if (exactMatch) {
      profile = exactMatch;
    } else {
      // Partial match (untuk search "john" → john@example.com)
      const { data: partialMatch } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, role")
        .ilike("email", `%${searchEmail}%`)
        .limit(1)
        .maybeSingle();
      profile = partialMatch;
    }

    if (!profile) {
      return json({ error: "User tidak ditemukan" }, 404);
    }

    // 2. Get points + transactions PARALEL (bukan sequential — hemat 1 round trip)
    const [pointsRes, transactionsRes] = await Promise.all([
      supabase
        .from("user_points")
        .select("balance, total_earned, total_spent")
        .eq("user_id", profile.id)
        .maybeSingle(),
      supabase
        .from("point_transactions")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const points = pointsRes.data || { balance: 0, total_earned: 0, total_spent: 0 };
    const transactions = transactionsRes.data || [];

    return json({
      success: true,
      profile,
      points,
      transactions,
    });
  } catch (e) {
    console.error("[admin-search-user] Error:", e);
    return json({ error: e.message }, 500);
  }
});
