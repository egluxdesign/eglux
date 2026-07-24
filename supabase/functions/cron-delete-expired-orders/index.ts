// supabase/functions/cron-delete-expired-orders/index.ts
// ============================================================================
// cron-delete-expired-orders
// ============================================================================
// Schedule: EVERY 1 DAY at 03:00 AM (via Supabase Dashboard → Schedules)
//
// Logic:
//   Find orders WHERE:
//     - expired_at IS NOT NULL
//     - expired_at < NOW() - INTERVAL '7 days'
//   HARD DELETE each (CASCADE ke order_items karena FK ON DELETE CASCADE)
//
// Lifecycle:
//   Day 0 (created): status='pending', expired_at=NULL
//   Day 1 (24h):     status='expired', expired_at=NOW()  (cron-expire)
//                    → hidden dari "Pesanan Saya" frontend
//   Day 1-8:          Row tetap di DB untuk audit (admin bisa query manual)
//   Day 8 (7d post-expire): HARD DELETE  (cron-delete, this function)
//                    → CASCADE delete order_items
//                    → customer row TETAP dipertahankan (bukan CASCADE)
//
// Why 7 days retention post-expiry?
//   - Grace period untuk admin investigate jika ada customer complaint
//   - Audit trail untuk laporan "X order expired minggu ini"
//   - Setelah 7 hari, data dianggap tidak relevan
//
// Why hard delete (bukan soft delete)?
//   - User explicit request: "hilangkan dari database"
//   - Storage saving: orders table tidak menumpuk
//   - PII cleanup: customer phone/email/address ikut terhapus (GDPR-friendly)
//
// CASCADE behavior:
//   - order_items.order_id FK sudah ON DELETE CASCADE (dari SQL 011/012)
//   - Saat orders row di-DELETE, semua order_items terkait otomatis di-DELETE
//   - customers TIDAK ter-CASCADE (FK di orders side, bukan di customers)
//     → customer row tetap ada (user bisa checkout lagi)
//
// Setup:
//   1. Deploy: supabase functions deploy cron-delete-expired-orders
//   2. Set schedule:
//      Cron: 0 3 * * *  (daily at 03:00 AM)
//      Timezone: Asia/Jakarta
//   3. (Optional) Test manual via Dashboard "Test" button
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ⭐ Retention: 7 hari setelah expired_at
const RETENTION_DAYS = 7;

serve(async (req: Request) => {
  // ⭐ Security: hanya allow Supabase cron atau manual invoke
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
  console.log(`[cron-delete-expired-orders] Started at ${startedAt.toISOString()}`);

  try {
    // ── Step 1: Find expired orders older than 7 days ──
    // Uses index idx_orders_expired_at (partial index where expired_at IS NOT NULL)
    const threshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const { data: ordersToDelete, error: findError } = await supabase
      .from("orders")
      .select("id, customer_id, created_at, expired_at")
      .not("expired_at", "is", null)
      .lt("expired_at", threshold.toISOString())
      .order("expired_at", { ascending: true })
      .limit(200); // safety cap per run

    if (findError) {
      console.error("[cron-delete-expired-orders] Find error:", findError);
      return new Response(
        JSON.stringify({ error: "Find failed", details: findError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ordersToDelete || ordersToDelete.length === 0) {
      const duration = Date.now() - startedAt.getTime();
      console.log(`[cron-delete-expired-orders] No orders to delete. Done in ${duration}ms.`);
      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: 0,
          threshold: threshold.toISOString(),
          duration_ms: duration,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[cron-delete-expired-orders] Found ${ordersToDelete.length} orders to delete`);

    // ── Step 2: Hard DELETE (CASCADE ke order_items) ──
    // Process in batches of 50
    const BATCH_SIZE = 50;
    let deletedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < ordersToDelete.length; i += BATCH_SIZE) {
      const batch = ordersToDelete.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((o: any) => o.id);

      const { error: deleteError } = await supabase
        .from("orders")
        .delete()
        .in("id", batchIds);

      if (deleteError) {
        console.error(`[cron-delete-expired-orders] Batch delete error:`, deleteError);
        errors.push(`Batch ${i / BATCH_SIZE + 1}: ${deleteError.message}`);
      } else {
        deletedCount += batchIds.length;
        console.log(`[cron-delete-expired-orders] Batch ${i / BATCH_SIZE + 1}: deleted ${batchIds.length} orders (+ cascade order_items)`);
      }
    }

    // ── Step 3: Log summary ──
    console.log(`[cron-delete-expired-orders] Summary:
      - Total found: ${ordersToDelete.length}
      - Successfully deleted: ${deletedCount}
      - Errors: ${errors.length}
      - Sample deleted IDs: ${ordersToDelete.slice(0, 3).map((o: any) => o.id).join(", ")}
    `);

    const duration = Date.now() - startedAt.getTime();
    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: deletedCount,
        errors: errors.length > 0 ? errors : undefined,
        threshold: threshold.toISOString(),
        sample_ids: ordersToDelete.slice(0, 5).map((o: any) => o.id),
        duration_ms: duration,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[cron-delete-expired-orders] Exception:", e);
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
