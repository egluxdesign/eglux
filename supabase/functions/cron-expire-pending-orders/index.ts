// supabase/functions/cron-expire-pending-orders/index.ts
// ============================================================================
// cron-expire-pending-orders
// ============================================================================
// Schedule: EVERY 1 HOUR (via Supabase Dashboard → Functions → Schedules)
//
// Logic:
//   Find orders WHERE:
//     - status = 'pending'
//     - payment_status = 'unpaid'
//     - created_at < NOW() - INTERVAL '24 hours'
//     - expired_at IS NULL
//   Update each:
//     - status = 'expired'
//     - payment_status = 'expired'
//     - expired_at = NOW()
//
// Why 24 hours?
//   - Matches Midtrans Snap default expiry (snap.pay() token expired 24h after creation)
//   - Industry standard (Shopee/Tokopedia juga 24h)
//   - User has enough time to complete payment (VA, QRIS, etc.)
//
// Why hourly?
//   - Order expire within max 1 hour after threshold (acceptable latency)
//   - Light query (indexed) — cheap to run
//
// Stock behavior:
//   Stock TIDAK berkurang saat order dibuat (current behavior).
//   Saat order expired, TIDAK ada stock restore yang perlu dilakukan
//   (karena stock memang gak pernah decrement).
//   Future: kalau stock decrement on payment settlement diimplement,
//           expire logic tetap gak perlu restore stock (order gak pernah paid).
//
// Setup:
//   1. Deploy function: supabase functions deploy cron-expire-pending-orders
//   2. Set schedule via Supabase Dashboard:
//      Functions → cron-expire-pending-orders → Schedules → Add
//      Cron: 0 * * * *  (every hour at minute 0)
//      Timezone: Asia/Jakarta (atau UTC — bebas, selama konsisten)
//   3. (Optional) Test manual invoke via Dashboard → "Test" button
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ⭐ Expiry window: 24 jam
const EXPIRY_HOURS = 24;

serve(async (req: Request) => {
  // ⭐ Security: hanya allow Supabase cron (yang inject auth header)
  // atau manual invoke dari Dashboard (yang juga auth).
  // Block public access.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const startedAt = new Date();
  console.log(`[cron-expire-pending-orders] Started at ${startedAt.toISOString()}`);

  try {
    // ── Step 1: Find pending orders older than 24h ──
    // Uses index idx_orders_pending_expiry (partial index on pending+unpaid)
    const threshold = new Date(Date.now() - EXPIRY_HOURS * 60 * 60 * 1000);

    const { data: expiredOrders, error: findError } = await supabase
      .from("orders")
      .select("id, customer_id, total_amount, created_at")
      .eq("status", "pending")
      .eq("payment_status", "unpaid")
      .lt("created_at", threshold.toISOString())
      .is("expired_at", null)
      .order("created_at", { ascending: true })
      .limit(500); // safety cap, kalau ada backlog

    if (findError) {
      console.error("[cron-expire-pending-orders] Find error:", findError);
      return new Response(
        JSON.stringify({ error: "Find failed", details: findError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!expiredOrders || expiredOrders.length === 0) {
      const duration = Date.now() - startedAt.getTime();
      console.log(`[cron-expire-pending-orders] No orders to expire. Done in ${duration}ms.`);
      return new Response(
        JSON.stringify({
          success: true,
          expired_count: 0,
          threshold: threshold.toISOString(),
          duration_ms: duration,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[cron-expire-pending-orders] Found ${expiredOrders.length} orders to expire`);

    // ── Step 2: Update each order to 'expired' ──
    // Process in batches of 50 untuk avoid giant IN clause
    const BATCH_SIZE = 50;
    let updatedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < expiredOrders.length; i += BATCH_SIZE) {
      const batch = expiredOrders.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((o: any) => o.id);

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          status: "expired",
          payment_status: "expired",
          expired_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", batchIds);

      if (updateError) {
        console.error(`[cron-expire-pending-orders] Batch update error:`, updateError);
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${updateError.message}`);
      } else {
        updatedCount += batchIds.length;
        console.log(`[cron-expire-pending-orders] Batch ${i / BATCH_SIZE + 1}: expired ${batchIds.length} orders`);
      }
    }

    // ── Step 3: (Optional) Log summary untuk audit ──
    console.log(`[cron-expire-pending-orders] Summary:
      - Total found: ${expiredOrders.length}
      - Successfully expired: ${updatedCount}
      - Errors: ${errors.length}
      - Sample expired IDs: ${expiredOrders.slice(0, 3).map((o: any) => o.id).join(", ")}
    `);

    const duration = Date.now() - startedAt.getTime();
    return new Response(
      JSON.stringify({
        success: true,
        expired_count: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
        threshold: threshold.toISOString(),
        sample_ids: expiredOrders.slice(0, 5).map((o: any) => o.id),
        duration_ms: duration,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[cron-expire-pending-orders] Exception:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
