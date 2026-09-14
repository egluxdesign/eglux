// supabase/functions/cleanup-storage/index.ts
// ============================================================================
// cleanup-storage — Auto-cleanup old images from Storage buckets
// ============================================================================
// Runs via pg_cron (calls this edge function) or manual trigger.
//
// Cleanup rules:
//   1. Return images: hapus kalau return completed/cancelled >30 hari
//   2. Review images: hapus kalau review unpublished >90 hari
//   3. Orphaned files: hapus file >7 hari yang gak ada reference active
//
// Cara trigger:
//   POST /functions/v1/cleanup-storage
//   No auth required (called by pg_cron via pg_net or manual admin trigger)
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const results = {
    return_images_deleted: 0,
    review_images_deleted: 0,
    orphaned_deleted: 0,
    db_columns_cleared: 0,
    errors: [] as string[],
  };

  try {
    // ====================================================================
    // STEP 1: Cleanup return images (completed/cancelled/rejected >30 hari)
    // ====================================================================

    // 1a. Get list of returns with images/video that are old
    const { data: oldReturns, error: retErr } = await supabase
      .from("order_returns")
      .select("id, user_id, images, video")
      .in("status", ["completed", "cancelled", "rejected"])
      .lt("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .not("images", "is", null);

    if (retErr) results.errors.push(`Return fetch: ${retErr.message}`);

    if (oldReturns && oldReturns.length > 0) {
      const filesToDelete: string[] = [];

      for (const ret of oldReturns) {
        // Collect image paths
        if (ret.images && Array.isArray(ret.images)) {
          for (const url of ret.images) {
            // Extract path from URL: .../return-images/{user_id}/{filename}
            const match = url.match(/\/return-images\/(.+)$/);
            if (match) filesToDelete.push(match[1]);
          }
        }
        // Collect video path
        if (ret.video) {
          const match = ret.video.match(/\/return-images\/(.+)$/);
          if (match) filesToDelete.push(match[1]);
        }
      }

      // Delete files from storage
      if (filesToDelete.length > 0) {
        const { error: delErr } = await supabase.storage
          .from("return-images")
          .remove(filesToDelete);

        if (delErr) {
          results.errors.push(`Return delete: ${delErr.message}`);
        } else {
          results.return_images_deleted = filesToDelete.length;
        }
      }

      // Clear DB columns
      const { error: updErr } = await supabase
        .from("order_returns")
        .update({ images: null, video: null })
        .in("id", oldReturns.map(r => r.id));

      if (updErr) results.errors.push(`Return DB clear: ${updErr.message}`);
      else results.db_columns_cleared += oldReturns.length;
    }

    // ====================================================================
    // STEP 2: Cleanup review images (unpublished >90 hari)
    // ====================================================================

    const { data: oldReviews, error: revErr } = await supabase
      .from("product_reviews")
      .select("id, user_id, images")
      .eq("is_published", false)
      .lt("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .not("images", "is", null);

    if (revErr) results.errors.push(`Review fetch: ${revErr.message}`);

    if (oldReviews && oldReviews.length > 0) {
      const filesToDelete: string[] = [];

      for (const rev of oldReviews) {
        if (rev.images && Array.isArray(rev.images)) {
          for (const url of rev.images) {
            const match = url.match(/\/review-images\/(.+)$/);
            if (match) filesToDelete.push(match[1]);
          }
        }
      }

      if (filesToDelete.length > 0) {
        const { error: delErr } = await supabase.storage
          .from("review-images")
          .remove(filesToDelete);

        if (delErr) {
          results.errors.push(`Review delete: ${delErr.message}`);
        } else {
          results.review_images_deleted = filesToDelete.length;
        }
      }

      // Clear DB columns
      const { error: updErr } = await supabase
        .from("product_reviews")
        .update({ images: null })
        .in("id", oldReviews.map(r => r.id));

      if (updErr) results.errors.push(`Review DB clear: ${updErr.message}`);
      else results.db_columns_cleared += oldReviews.length;
    }

    // ====================================================================
    // STEP 3: Cleanup orphaned files (>7 hari, no active reference)
    // ====================================================================

    // 3a. List all files in return-images bucket
    const { data: returnFiles } = await supabase.storage
      .from("return-images")
      .list("", { limit: 1000 });

    if (returnFiles && returnFiles.length > 0) {
      // Get user_ids that have active returns
      const { data: activeReturnUsers } = await supabase
        .from("order_returns")
        .select("user_id")
        .in("status", ["pending", "approved", "shipping_back", "received"]);

      const activeUserIds = new Set((activeReturnUsers || []).map(r => r.user_id));
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const orphanedFolders: string[] = [];
      for (const folder of returnFiles) {
        // Check if folder name (user_id) is NOT in active returns
        if (!activeUserIds.has(folder.name) && folder.created_at) {
          const createdAt = new Date(folder.created_at).getTime();
          if (createdAt < sevenDaysAgo) {
            orphanedFolders.push(folder.name);
          }
        }
      }

      // List and delete files in orphaned folders
      for (const folder of orphanedFolders) {
        const { data: files } = await supabase.storage
          .from("return-images")
          .list(folder);

        if (files && files.length > 0) {
          const filePaths = files.map(f => `${folder}/${f.name}`);
          await supabase.storage.from("return-images").remove(filePaths);
          results.orphaned_deleted += filePaths.length;
        }
      }
    }

    // 3b. List all files in review-images bucket
    const { data: reviewFiles } = await supabase.storage
      .from("review-images")
      .list("", { limit: 1000 });

    if (reviewFiles && reviewFiles.length > 0) {
      const { data: activeReviewUsers } = await supabase
        .from("product_reviews")
        .select("user_id")
        .eq("is_published", true);

      const activeUserIds = new Set((activeReviewUsers || []).map(r => r.user_id));
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const orphanedFolders: string[] = [];
      for (const folder of reviewFiles) {
        if (!activeUserIds.has(folder.name) && folder.created_at) {
          const createdAt = new Date(folder.created_at).getTime();
          if (createdAt < sevenDaysAgo) {
            orphanedFolders.push(folder.name);
          }
        }
      }

      for (const folder of orphanedFolders) {
        const { data: files } = await supabase.storage
          .from("review-images")
          .list(folder);

        if (files && files.length > 0) {
          const filePaths = files.map(f => `${folder}/${f.name}`);
          await supabase.storage.from("review-images").remove(filePaths);
          results.orphaned_deleted += filePaths.length;
        }
      }
    }

    console.log("[cleanup-storage] ✅ Results:", results);

    return json({
      success: true,
      message: "Cleanup completed",
      ...results,
    });
  } catch (e) {
    console.error("[cleanup-storage] Error:", e);
    return json({
      success: false,
      error: e.message,
      ...results,
    }, 500);
  }
});
