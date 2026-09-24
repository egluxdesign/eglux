// supabase/functions/submit-return-request/index.ts
// ============================================================================
// submit-return-request v3.1 FULL REWRITE — Customer + Admin return/refund actions
// ============================================================================
//
// Edge function ini handle SEMUA action terkait return/refund:
//   - Customer: submit return baru, cancel, confirm_refund
//   - Admin: process, propose_refund, approve, reject, confirm_received,
//            complete, upload_forward_tracking
//
// FLOW LENGKAP (10 status):
//   1. pending                       (customer submit awal, no nominal)
//   2. processing                    (admin klik "Proses" + WA customer)
//   3. awaiting_customer_confirmation (admin input nominal, tunggu customer konfirmasi)
//   4. customer_confirmed            (customer konfirmasi nominal)
//   5. approved                      (admin final approve dengan resolution)
//   6. shipping_back                 (customer kirim balik dengan tracking — optional)
//   7. received                      (admin konfirmasi barang diterima di gudang)
//   8. completed                     (admin selesaikan return → trigger SQL 090 sync ke orders)
//   9. cancelled                     (customer/admin cancel sebelum approve)
//  10. rejected                      (admin reject dengan alasan)
//
// SECURITY (anti-manipulasi nominal):
//   - Untuk status customer_confirmed: nominal di-LOCK ke customer_refund_amount
//     Admin gak bisa ubah nominal saat final approve (anti manipulasi)
//     Kalau mau ubah, gunakan action 'propose_refund' (re-propose) →
//     customer harus konfirmasi ulang → status balik ke awaiting_customer_confirmation
//   - Untuk status awaiting_customer_confirmation (skip mode): nominal di-LOCK ke refund_amount
//   - Untuk status pending (legacy mode): allow body.refund_amount (admin set manual)
//
// AUTO-COMPLETE:
//   - partial_refund: auto-complete setelah approve (customer simpan barang, gak perlu kirim balik)
//   - exchange dengan skip_return_shipping=true: auto-complete (langsung kirim pengganti)
//
// BACKEND DEPENDENCIES:
//   - Tables: order_returns, orders, customers, profiles, products, product_variants
//   - SQL 090 trigger: sync refund_amount + refunded_at ke orders table saat
//     order_returns.status='completed' (full_refund/partial_refund only)
//
// ACTION SIGNATURES:
//
//   [CUSTOMER] INSERT new return:
//     POST { order_id, reason, resolution, description, phone, images[], video, customer_notes }
//
//   [CUSTOMER] cancel:
//     POST { return_id, action: 'cancel' }
//
//   [CUSTOMER] confirm_refund:
//     POST { return_id, action: 'confirm_refund', customer_refund_amount, customer_notes? }
//
//   [ADMIN] process:
//     POST { return_id, action: 'process' }
//
//   [ADMIN] propose_refund:
//     POST { return_id, action: 'propose_refund', refund_amount, admin_notes? }
//
//   [ADMIN] approve (final approve):
//     POST {
//       return_id, action: 'approve',
//       admin_resolution: 'full_refund' | 'exchange' | 'partial_refund',
//       refund_amount?,                  // for legacy pending mode
//       partial_refund_amount?,          // for legacy pending mode
//       replacement_product_id?,         // for exchange
//       replacement_variant_id?,
//       replacement_product_name?,
//       replacement_variant_name?,
//       replacement_price?,
//       price_difference?,
//       return_shipping_paid_by?,
//       forward_shipping_cost?,
//       skip_return_shipping?,           // for exchange auto-complete
//       admin_notes?,
//       force_skip_customer_confirmation? // for "Paksa Setujui"
//     }
//
//   [ADMIN] reject:
//     POST { return_id, action: 'reject', admin_notes }
//
//   [ADMIN] confirm_received:
//     POST { return_id, action: 'confirm_received' }
//     // ⭐ v3.1: Allow dari approved OR shipping_back status
//
//   [ADMIN] complete:
//     POST { return_id, action: 'complete' }
//     // Triggers SQL 090 sync to orders table
//
//   [ADMIN] upload_forward_tracking:
//     POST { return_id, action: 'upload_forward_tracking', forward_tracking_number, forward_courier? }
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticated, json, corsHeaders } from "../_shared/auth.ts";

// ============================================================================
// CONSTANTS
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_IMAGES = 5;
const RETURN_WINDOW_DAYS = 7;

const VALID_REASONS = ["damaged", "missing_item", "wrong_item"];
const VALID_RESOLUTIONS = ["refund", "refund_return"];
const VALID_ADMIN_RESOLUTIONS = ["full_refund", "exchange", "partial_refund"];

// Customer-only actions (skip admin block biar gak fall through ke "Unknown admin action")
// Kalau admin testing sebagai customer di OrderHistoryPage, role=admin → isAdmin=true,
// tapi action cancel/confirm_refund harus tetap masuk customer section
const CUSTOMER_ONLY_ACTIONS = ["cancel", "confirm_refund"];

// Admin roles (sesuai profiles.role CHECK constraint)
const ADMIN_ROLES = ["team_dev", "master", "admin"];

// Status yang considered "active" (belum final)
const ACTIVE_STATUSES = [
  "pending", "processing", "awaiting_customer_confirmation",
  "customer_confirmed", "approved", "shipping_back", "received"
];

// ============================================================================
// MAIN SERVE HANDLER
// ============================================================================

serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ── Auth check ──
    const authResult = await requireAuthenticated(req);
    if (!authResult.success) return authResult.response!;
    const userId = authResult.user!.id;

    // ── Parse body ──
    const body = await req.json().catch(() => ({}));

    // ── Create Supabase client (service_role, bypass RLS) ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Check admin role ──
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const isAdmin = profile && ADMIN_ROLES.includes(profile.role);

    // ═══════════════════════════════════════════════════════════════════
    // ADMIN ACTIONS (exclude customer-only actions)
    // ═══════════════════════════════════════════════════════════════════
    if (body.return_id && body.action && isAdmin && !CUSTOMER_ONLY_ACTIONS.includes(body.action)) {
      const { return_id, action } = body;

      // ── Fetch return record ──
      const { data: ret, error: fetchErr } = await supabase
        .from("order_returns")
        .select("*")
        .eq("id", return_id)
        .maybeSingle();
      if (fetchErr || !ret) {
        return json({ error: "Return tidak ditemukan" }, 404);
      }

      // ═══════════════════════════════════════════════════════════════
      // APPROVE — Final approve dengan resolution type
      // ═══════════════════════════════════════════════════════════════
      if (action === "approve") {
        // ⭐ Flow v4: approve support dari customer_confirmed (normal flow)
        //   ATAU awaiting_customer_confirmation (admin skip konfirmasi customer via "Paksa Setujui")
        //   ATAU pending (legacy mode — admin set manual)
        const allowApproveFromStatus = ["customer_confirmed", "awaiting_customer_confirmation", "pending"];
        if (!allowApproveFromStatus.includes(ret.status)) {
          return json({
            error: `Hanya status ${allowApproveFromStatus.join(", ")} yang bisa di-approve. Status saat ini: ${ret.status}`,
          }, 400);
        }

        const adminResolution = body.admin_resolution || "full_refund";
        if (!VALID_ADMIN_RESOLUTIONS.includes(adminResolution)) {
          return json({
            error: `admin_resolution tidak valid. Pilihan: ${VALID_ADMIN_RESOLUTIONS.join(", ")}`,
          }, 400);
        }

        // ⭐ SECURITY: Lock nominal untuk hindari admin manipulasi
        // - Dari customer_confirmed: refund_amount HARUS = customer_refund_amount (yang customer konfirmasi)
        // - Dari awaiting_customer_confirmation (skip mode): refund_amount = ret.refund_amount (yang admin kasih awal)
        // - Dari pending (legacy mode): allow body.refund_amount (admin set manual, backward compat)
        let lockedRefundAmount: number | null = null;
        if (ret.status === "customer_confirmed") {
          if (!ret.customer_refund_amount || Number(ret.customer_refund_amount) <= 0) {
            return json({ error: "Nominal customer_refund_amount belum di-set. Tidak bisa approve." }, 400);
          }
          lockedRefundAmount = Number(ret.customer_refund_amount);
          // ⭐ Validasi: kalau admin kirim body.refund_amount yang beda, REJECT
          if (body.refund_amount && Number(body.refund_amount) !== lockedRefundAmount) {
            return json({
              error: `🚫 SECURITY: Nominal final tidak boleh berbeda dari yang customer konfirmasi. ` +
                     `Customer konfirmasi: Rp ${lockedRefundAmount.toLocaleString("id-ID")}, ` +
                     `admin input: Rp ${Number(body.refund_amount).toLocaleString("id-ID")}. ` +
                     `Kalau mau ubah nominal, gunakan tombol "Edit Nominal" (re-propose) untuk minta konfirmasi customer ulang.`,
            }, 400);
          }
        } else if (ret.status === "awaiting_customer_confirmation") {
          if (!ret.refund_amount || Number(ret.refund_amount) <= 0) {
            return json({ error: "Nominal refund_amount belum di-set. Tidak bisa approve." }, 400);
          }
          lockedRefundAmount = Number(ret.refund_amount);
          // ⭐ Skip customer confirmation: validasi body.refund_amount kalau ada
          if (body.refund_amount && Number(body.refund_amount) !== lockedRefundAmount) {
            return json({
              error: `🚫 SECURITY: Nominal final tidak boleh berbeda dari yang Anda kirim ke customer. ` +
                     `Dikirim: Rp ${lockedRefundAmount.toLocaleString("id-ID")}, ` +
                     `input final: Rp ${Number(body.refund_amount).toLocaleString("id-ID")}. ` +
                     `Kalau mau ubah, gunakan "Edit Nominal" (re-propose).`,
            }, 400);
          }
        }

        // ── Build updates object ──
        const updates: any = {
          status: "approved",
          admin_resolution: adminResolution,
          admin_user_id: userId,
          resolved_at: new Date().toISOString(),
        };

        // ⭐ Set refund_amount dari locked value (untuk customer_confirmed atau awaiting_customer_confirmation)
        // Untuk pending (legacy), pakai body.refund_amount
        if (lockedRefundAmount !== null) {
          updates.refund_amount = lockedRefundAmount;
          // Untuk partial_refund resolution, partial_refund_amount = locked value juga
          if (adminResolution === "partial_refund") {
            updates.partial_refund_amount = lockedRefundAmount;
          }
        } else if (body.refund_amount) {
          // Legacy mode (pending): admin set manual
          updates.refund_amount = Number(body.refund_amount);
        }

        // ⭐ Partial refund: kirim body.partial_refund_amount kalau ada (untuk pending legacy)
        if (body.partial_refund_amount && adminResolution === "partial_refund" && lockedRefundAmount === null) {
          updates.partial_refund_amount = Number(body.partial_refund_amount);
        }

        // ⭐ Exchange fields
        if (body.replacement_product_id) updates.replacement_product_id = body.replacement_product_id;
        if (body.replacement_variant_id) updates.replacement_variant_id = body.replacement_variant_id;
        if (body.replacement_product_name) updates.replacement_product_name = body.replacement_product_name;
        if (body.replacement_variant_name) updates.replacement_variant_name = body.replacement_variant_name;
        if (body.replacement_price) updates.replacement_price = Number(body.replacement_price);
        if (body.price_difference !== undefined) updates.price_difference = Number(body.price_difference);

        // ⭐ Shipping fields
        if (body.return_shipping_paid_by) updates.return_shipping_paid_by = body.return_shipping_paid_by;
        if (body.forward_shipping_cost) updates.forward_shipping_cost = Number(body.forward_shipping_cost);

        // ⭐ Admin notes
        if (body.admin_notes) updates.admin_notes = body.admin_notes;

        // ⭐ Skip customer confirmation: kalau approve dari awaiting_customer_confirmation,
        // set customer_acknowledged_cs = true + customer_confirmed_at untuk audit trail
        if (ret.status === "awaiting_customer_confirmation") {
          updates.customer_acknowledged_cs = true;
          updates.customer_confirmed_at = new Date().toISOString();
          updates.customer_refund_amount = ret.refund_amount;
        }

        // ── Execute update ──
        const { error: updErr } = await supabase
          .from("order_returns")
          .update(updates)
          .eq("id", return_id);
        if (updErr) {
          return json({ error: "Gagal approve", details: updErr.message }, 500);
        }

        // ⭐ Auto-complete for partial_refund (no shipping back needed)
        if (adminResolution === "partial_refund") {
          await supabase.from("order_returns").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          }).eq("id", return_id);

          // Sync orders table untuk revenue tracking (Shopee-style)
          await supabase.from("orders").update({
            refund_amount: lockedRefundAmount,
            refunded_at: new Date().toISOString(),
            status: "refund",
          }).eq("id", ret.order_id);

          return json({
            success: true,
            message: "Partial refund disetujui & diselesaikan. Order tetap 'completed'. Transfer refund ke customer via bank.",
          });
        }

        // ⭐ Auto-complete for exchange IF customer doesn't need to send back
        if (adminResolution === "exchange" && body.skip_return_shipping === true) {
          await supabase.from("order_returns").update({
            status: "completed",
            resolved_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          }).eq("id", return_id);
          // exchange → orders stays 'completed' (no money out)
          return json({
            success: true,
            message: "Exchange disetujui. Customer tidak perlu kirim balik. Kirim barang pengganti ke customer.",
          });
        }

        return json({
          success: true,
          message: adminResolution === "exchange"
            ? "Exchange disetujui. Tunggu customer kirim balik barang, lalu kirim pengganti."
            : "Return disetujui. Tunggu customer kirim balik barang.",
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // PROCESS — Admin klik "Proses", akan kontak customer via WA
      // ═══════════════════════════════════════════════════════════════
      if (action === "process") {
        if (ret.status !== "pending") {
          return json({ error: "Hanya status pending yang bisa di-proses" }, 400);
        }
        const { error: updErr } = await supabase.from("order_returns").update({
          status: "processing",
          admin_user_id: userId,
          updated_at: new Date().toISOString(),
        }).eq("id", return_id);
        if (updErr) return json({ error: "Gagal process" }, 500);
        return json({
          success: true,
          message: "Status diubah ke 'Diproses'. Hubungi customer via WA untuk arahan nominal refund.",
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // PROPOSE_REFUND — Admin input nominal proposed, tunggu customer konfirmasi
      // ═══════════════════════════════════════════════════════════════
      if (action === "propose_refund") {
        const proposedAmount = Number(body.refund_amount);
        if (!proposedAmount || proposedAmount <= 0) {
          return json({ error: "Nominal refund_amount wajib diisi" }, 400);
        }
        // ⭐ Allow dari processing (normal flow) ATAU awaiting_customer_confirmation (re-propose)
        //   ATAU customer_confirmed (re-propose kalau admin mau ubah nominal yang sudah di-confirm)
        if (!["processing", "awaiting_customer_confirmation", "customer_confirmed"].includes(ret.status)) {
          return json({
            error: `Hanya status processing, awaiting_customer_confirmation, atau customer_confirmed yang bisa re-propose. Status saat ini: ${ret.status}`,
          }, 400);
        }
        const { error: updErr } = await supabase.from("order_returns").update({
          status: "awaiting_customer_confirmation",
          refund_amount: proposedAmount, // nominal proposed (bisa di-edit sebelum final approve)
          admin_notes: body.admin_notes || null,
          admin_user_id: userId,
          updated_at: new Date().toISOString(),
          // ⭐ Reset customer confirmation (kalau re-propose dari customer_confirmed)
          customer_acknowledged_cs: false,
          customer_refund_amount: null,
          customer_confirmed_at: null,
        }).eq("id", return_id);
        if (updErr) return json({ error: "Gagal propose refund" }, 500);
        return json({
          success: true,
          message: "Nominal refund dikirim ke customer. Customer akan konfirmasi nominal via ReturnModal Mode Konfirmasi.",
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // REJECT — Admin bisa reject di tahap manapun sebelum customer_confirmed
      // ═══════════════════════════════════════════════════════════════
      if (action === "reject") {
        if (!body.admin_notes || !body.admin_notes.trim()) {
          return json({ error: "admin_notes wajib diisi untuk reject (alasan penolakan)" }, 400);
        }
        const { error: updErr } = await supabase.from("order_returns").update({
          status: "rejected",
          admin_notes: body.admin_notes.trim(),
          admin_user_id: userId,
          resolved_at: new Date().toISOString(),
        }).eq("id", return_id);
        if (updErr) return json({ error: "Gagal reject" }, 500);
        return json({ success: true, message: "Return ditolak. Customer akan dihubungi." });
      }

      // ═══════════════════════════════════════════════════════════════
      // CONFIRM_RECEIVED — Admin terima barang balik di gudang
      // ⭐ v3.1 FIX: Allow dari approved ATAU shipping_back status
      // ═══════════════════════════════════════════════════════════════
      if (action === "confirm_received") {
        if (!["approved", "shipping_back"].includes(ret.status)) {
          return json({
            error: `Hanya status approved atau shipping_back yang bisa confirm received. Status saat ini: ${ret.status}`,
          }, 400);
        }
        await supabase.from("order_returns").update({
          status: "received",
          admin_user_id: userId,
          // ⭐ updated_at dipakai sebagai proxy untuk received_at (column belum ada)
          updated_at: new Date().toISOString(),
        }).eq("id", return_id);
        return json({
          success: true,
          message: "Barang diterima. Siap untuk complete/exchange. Klik 'Selesaikan Return' untuk finalize.",
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // COMPLETE — Selesaikan return + sync ke orders table (trigger SQL 090)
      // ═══════════════════════════════════════════════════════════════
      if (action === "complete") {
        if (!["received", "approved"].includes(ret.status)) {
          return json({
            error: `Status harus received atau approved untuk complete. Status saat ini: ${ret.status}`,
          }, 400);
        }

        const adminRes = ret.admin_resolution || "full_refund";
        const completedAt = new Date().toISOString();
        // ⭐ Nominal actual refund (locked value dari approve action)
        const actualRefundAmount = Number(ret.refund_amount) || 0;

        // ⭐ Update order_returns: set status=completed + completed_at
        await supabase.from("order_returns").update({
          status: "completed",
          resolved_at: completedAt,
          completed_at: completedAt,
          admin_user_id: userId,
        }).eq("id", return_id);

        // ⭐ Sync orders table untuk revenue tracking (Shopee-style)
        // - full_refund + partial_refund: ada uang keluar → orders.refund_amount + refunded_at + status='refund'
        // - exchange: gak ada uang keluar → order tetap 'completed'
        if (adminRes === "full_refund" || adminRes === "partial_refund") {
          await supabase.from("orders").update({
            refund_amount: actualRefundAmount,
            refunded_at: completedAt,
            status: "refund",
          }).eq("id", ret.order_id);
        }
        // exchange → orders stays 'completed' (no money out)

        return json({
          success: true,
          message: adminRes === "exchange"
            ? "Exchange selesai. Kirim barang pengganti ke customer. (No refund amount)"
            : adminRes === "partial_refund"
            ? `Partial refund selesai. Refund ${actualRefundAmount.toLocaleString("id-ID")} di-sync ke orders. Order status → refund.`
            : `Full refund selesai. Refund ${actualRefundAmount.toLocaleString("id-ID")} di-sync ke orders. Order status → refund.`,
        });
      }

      // ═══════════════════════════════════════════════════════════════
      // UPLOAD_FORWARD_TRACKING — Resi kirim pengganti untuk exchange
      // ═══════════════════════════════════════════════════════════════
      if (action === "upload_forward_tracking") {
        if (ret.admin_resolution !== "exchange") {
          return json({ error: "Upload forward tracking hanya untuk resolution type 'exchange'" }, 400);
        }
        if (!body.forward_tracking_number) {
          return json({ error: "forward_tracking_number wajib diisi" }, 400);
        }
        await supabase.from("order_returns").update({
          forward_tracking_number: body.forward_tracking_number.trim(),
          forward_courier: body.forward_courier || null,
          updated_at: new Date().toISOString(),
        }).eq("id", return_id);
        return json({
          success: true,
          message: "Resi pengganti diupload. Customer bisa lacak di halaman Order History.",
        });
      }

      // ── Unknown admin action ──
      return json({ error: `Unknown admin action: ${action}` }, 400);
    }

    // ═════════════════════════════════════════════════════════════════
    // CUSTOMER ACTIONS
    // ═════════════════════════════════════════════════════════════════

    // ── CANCEL — Customer batalkan return ──
    if (body.return_id && body.action === "cancel") {
      const { data: ret } = await supabase
        .from("order_returns")
        .select("user_id, status")
        .eq("id", body.return_id)
        .maybeSingle();
      if (!ret) return json({ error: "Return tidak ditemukan" }, 404);

      // ⭐ Security: customer hanya bisa cancel return milik sendiri
      if (ret.user_id !== userId) return json({ error: "Akses ditolak" }, 403);

      // ⭐ Customer bisa cancel di status pre-approval (belum final)
      const cancellableStatuses = ["pending", "processing", "awaiting_customer_confirmation"];
      if (!cancellableStatuses.includes(ret.status)) {
        return json({
          error: `Hanya return pre-approval yang bisa dibatalkan. Status saat ini: ${ret.status}`,
        }, 400);
      }

      await supabase.from("order_returns").update({
        status: "cancelled",
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", body.return_id);

      return json({ success: true, message: "Return dibatalkan" });
    }

    // ── CONFIRM_REFUND — Customer konfirmasi nominal yang admin kasih ──
    if (body.return_id && body.action === "confirm_refund") {
      const { data: ret } = await supabase
        .from("order_returns")
        .select("user_id, status, refund_amount")
        .eq("id", body.return_id)
        .maybeSingle();
      if (!ret) return json({ error: "Return tidak ditemukan" }, 404);

      // ⭐ Security: customer hanya bisa confirm return milik sendiri
      if (ret.user_id !== userId) return json({ error: "Akses ditolak" }, 403);

      if (ret.status !== "awaiting_customer_confirmation") {
        return json({
          error: `Hanya status awaiting_customer_confirmation yang bisa di-konfirmasi. Status saat ini: ${ret.status}`,
        }, 400);
      }
      if (!ret.refund_amount || Number(ret.refund_amount) <= 0) {
        return json({ error: "Admin belum input nominal refund. Tunggu admin kontak." }, 400);
      }

      // ⭐ Customer input nominal konfirmasi — HARUS sama dengan yang admin kasih
      const customerAmount = Number(body.customer_refund_amount);
      if (!customerAmount || customerAmount <= 0) {
        return json({ error: "Nominal konfirmasi wajib diisi" }, 400);
      }
      if (Number(customerAmount) !== Number(ret.refund_amount)) {
        return json({
          error: `Nominal yang Anda input (Rp ${customerAmount.toLocaleString("id-ID")}) ` +
                 `tidak sesuai dengan yang admin kasih (Rp ${Number(ret.refund_amount).toLocaleString("id-ID")}). ` +
                 `Hubungi admin kembali kalau ada kebingungan.`,
        }, 400);
      }

      const { error: updErr } = await supabase.from("order_returns").update({
        status: "customer_confirmed",
        customer_refund_amount: customerAmount,
        customer_acknowledged_cs: true,
        customer_confirmed_at: new Date().toISOString(),
        customer_notes: body.customer_notes || null,
        updated_at: new Date().toISOString(),
      }).eq("id", body.return_id);
      if (updErr) return json({ error: "Gagal konfirmasi", details: updErr.message }, 500);

      return json({
        success: true,
        message: "Konfirmasi berhasil. Admin akan final approve dan proses refund.",
      });
    }

    // ═════════════════════════════════════════════════════════════════
    // INSERT NEW RETURN REQUEST (customer submit awal)
    // ⭐ Flow baru: customer submit awal TANPA nominal (admin yang akan kasih nominal nanti)
    // ═════════════════════════════════════════════════════════════════

    const {
      order_id, reason, resolution, description, images, video, phone,
      customer_notes, // catatan customer ke admin (opsional, di-step awal)
    } = body;

    // ── Validate required fields ──
    if (!order_id) return json({ error: "order_id wajib diisi" }, 400);
    if (!reason || !VALID_REASONS.includes(reason)) {
      return json({ error: `Alasan tidak valid. Pilihan: ${VALID_REASONS.join(", ")}` }, 400);
    }
    if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
      return json({ error: `Resolusi tidak valid. Pilihan: ${VALID_RESOLUTIONS.join(", ")}` }, 400);
    }
    if (!phone) return json({ error: "Nomor telepon wajib diisi" }, 400);

    // ── Validasi bukti: minimal 3 foto ATAU 1 video ──
    const hasEnoughEvidence = (images && Array.isArray(images) && images.length >= 3) || video;
    if (!hasEnoughEvidence) {
      return json({
        error: "Wajib upload minimal 3 foto, ATAU 1 video sebagai bukti. Kalau foto kurang dari 3, wajib sertakan video.",
      }, 400);
    }

    // ── Verify order exists + customer has access ──
    const { data: orderData } = await supabase
      .from("orders")
      .select("id, status, customer_id, updated_at, total_amount")
      .eq("id", order_id)
      .maybeSingle();
    if (!orderData) return json({ error: "Order tidak ditemukan" }, 404);

    const { data: customerData } = await supabase
      .from("customers")
      .select("user_id")
      .eq("id", orderData.customer_id)
      .maybeSingle();
    if (!customerData || customerData.user_id !== userId) {
      return json({ error: "Akses ditolak" }, 403);
    }

    // ── Validate order status + return window ──
    if (orderData.status !== "completed") {
      return json({ error: "Order harus berstatus 'completed' untuk bisa diajukan return" }, 400);
    }
    const daysSince = (Date.now() - new Date(orderData.updated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > RETURN_WINDOW_DAYS) {
      return json({ error: `Batas waktu pengembalian habis (${RETURN_WINDOW_DAYS} hari sejak order completed)` }, 400);
    }

    // ── Check existing active return (gak boleh double-submit) ──
    const { data: existing } = await supabase
      .from("order_returns")
      .select("id")
      .eq("order_id", order_id)
      .in("status", ACTIVE_STATUSES)
      .maybeSingle();
    if (existing) {
      return json({ error: "Sudah ada pengajuan pengembalian aktif untuk order ini" }, 400);
    }

    // ── Build return data ──
    // ⭐ Flow baru: customer submit awal TANPA nominal
    // customer_acknowledged_cs akan di-set true saat customer confirm_refund nanti
    // customer_refund_amount akan di-set saat confirm_refund nanti
    const returnData: any = {
      order_id,
      user_id: userId,
      reason,
      resolution,
      phone: phone.trim(),
      status: "pending",
    };
    if (description) returnData.description = description.trim();
    if (customer_notes) returnData.customer_notes = customer_notes.trim();
    if (images && Array.isArray(images) && images.length > 0) {
      returnData.images = images.slice(0, MAX_IMAGES);
    }
    if (video) returnData.video = video;

    // ── Insert ──
    const { data: newReturn, error: insertErr } = await supabase
      .from("order_returns")
      .insert(returnData)
      .select("id, status, reason, resolution, phone, video, created_at")
      .single();
    if (insertErr) {
      return json({ error: "Gagal menyimpan return request", details: insertErr.message }, 500);
    }

    return json({
      success: true,
      message: "Pengembalian berhasil diajukan. Admin akan review + hubungi Anda via WhatsApp untuk nominal refund.",
      return_request: newReturn,
    });
  } catch (e) {
    console.error("[submit-return-request] Error:", e);
    return json({ error: e.message }, 500);
  }
});
