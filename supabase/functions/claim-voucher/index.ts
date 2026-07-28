// supabase/functions/claim-voucher/index.ts
// ============================================================================
// claim-voucher — User claim voucher to their account (Shopee/Tokopedia style)
// ============================================================================
//
// Actions:
//   POST { action: "claim", voucher_id } → claim voucher
//   POST { action: "my_vouchers" } → list user's claimed vouchers
//
// Auth: requireAuthenticated (any logged-in user)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: { ...corsHeaders, "Access-Control-Max-Age": "86400" },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;

    const body = await req.json();
    const { action } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userId = authResult.user!.id;

    // ── CLAIM VOUCHER ──
    if (action === "claim") {
      const { voucher_id } = body;
      if (!voucher_id) return json({ error: "voucher_id wajib diisi" }, 400);

      // 1. Get voucher
      const { data: voucher, error: vErr } = await supabase
        .from("vouchers")
        .select("*")
        .eq("id", voucher_id)
        .maybeSingle();

      if (vErr || !voucher) return json({ error: "Voucher tidak ditemukan" }, 404);

      // 2. Check is_active + date range
      if (!voucher.is_active) return json({ error: "Voucher tidak aktif" }, 400);
      const now = new Date();
      if (new Date(voucher.start_at) > now) return json({ error: "Voucher belum berlaku" }, 400);
      if (new Date(voucher.end_at) < now) return json({ error: "Voucher sudah berakhir" }, 400);

      // 3. Check total quota (claims + usages)
      const { count: claimCount } = await supabase
        .from("voucher_claims")
        .select("*", { count: "exact", head: true })
        .eq("voucher_id", voucher_id);
      const { count: usageCount } = await supabase
        .from("voucher_usages")
        .select("*", { count: "exact", head: true })
        .eq("voucher_id", voucher_id);
      const totalClaimed = (claimCount || 0) + (usageCount || 0);
      if (voucher.quota_total !== null && totalClaimed >= voucher.quota_total) {
        return json({ error: "Kuota voucher sudah habis" }, 400);
      }

      // 4. Check if already claimed
      const { data: existing } = await supabase
        .from("voucher_claims")
        .select("id")
        .eq("voucher_id", voucher_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) return json({ error: "Kamu sudah klaim voucher ini" }, 400);

      // 5. Insert claim
      const { error: insertErr } = await supabase
        .from("voucher_claims")
        .insert({ voucher_id, user_id: userId });

      if (insertErr) {
        if (insertErr.code === "23505") return json({ error: "Kamu sudah klaim voucher ini" }, 400);
        return json({ error: "Gagal klaim voucher: " + insertErr.message }, 500);
      }

      return json({ success: true, message: "Voucher berhasil di-klaim!" });
    }

    // ── MY VOUCHERS (list claimed vouchers) ──
    if (action === "my_vouchers") {
      const { data, error } = await supabase
        .from("voucher_claims")
        .select(`
          id, claimed_at,
          voucher:vouchers(*)
        `)
        .eq("user_id", userId)
        .order("claimed_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);

      // Get all voucher_usages for this user (untuk cek apakah user sudah pakai voucher)
      const { data: userUsages } = await supabase
        .from("voucher_usages")
        .select("voucher_id")
        .eq("user_id", userId);
      const usedVoucherIds = new Set((userUsages || []).map((u: any) => u.voucher_id));

      // Filter: only return vouchers yang masih aktif + belum expired
      const now = new Date();
      let activeVouchers = (data || []).filter((claim: any) => {
        const v = claim.voucher;
        if (!v) return false;
        if (!v.is_active) return false;
        if (new Date(v.end_at) < now) return false;
        return true;
      });

      // ⭐ Filter: hide voucher yang:
      //   1. Sudah dipakai user ini (ada di voucher_usages) — tidak bisa dipakai lagi
      //   2. Quota total sudah habis (remaining <= 0)
      const filteredVouchers = [];
      for (const claim of activeVouchers) {
        const v = claim.voucher;

        // Skip kalau user sudah pakai voucher ini
        if (usedVoucherIds.has(v.id)) {
          continue;
        }

        // Skip kalau quota total habis
        if (v.quota_total !== null) {
          const { count: claimCount } = await supabase
            .from("voucher_claims")
            .select("*", { count: "exact", head: true })
            .eq("voucher_id", v.id);
          const { count: usageCount } = await supabase
            .from("voucher_usages")
            .select("*", { count: "exact", head: true })
            .eq("voucher_id", v.id);
          const remaining = v.quota_total - ((claimCount || 0) + (usageCount || 0));
          if (remaining <= 0) continue;
        }

        filteredVouchers.push(claim);
      }

      return json({ success: true, vouchers: filteredVouchers });
    }

    return json({ error: "Unknown action: " + action }, 400);
  } catch (e) {
    console.error("[claim-voucher]", e);
    return json({ error: e.message }, 500);
  }
});
