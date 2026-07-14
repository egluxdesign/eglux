// supabase/functions/_shared/auth.ts
// ============================================================================
// Shared auth helper untuk edge functions.
// ============================================================================
// Fungsi:
//   1. Parse JWT dari Authorization header (Bearer <token>)
//   2. Verify JWT via supabase.auth.getUser(jwt)
//   3. Fetch profile dari tabel `profiles` untuk dapatkan role terbaru
//   4. Check role against allowedRoles
//
// Pemakaian:
//   import { authenticate, requireAdmin } from "../_shared/auth.ts";
//
//   // Check spesifik role
//   const authResult = await authenticate(req, ['team_dev', 'master', 'admin']);
//   if (!authResult.success) {
//     return authResult.response!;  // 401 / 403 response sudah di-generate
//   }
//   const { user, profile, role } = authResult;
//
//   // Atau cukup "admin" (team_dev / master / admin)
//   const authResult = await requireAdmin(req);
//   if (!authResult.success) return authResult.response!;
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS headers (reusable)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ============================================================================
// Types
// ============================================================================
export interface AuthUser {
  id: string;
  email: string;
  aud: string;
  raw_app_meta_data?: Record<string, unknown>;
}

export interface AuthProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  is_active: boolean;
  referral_code: string | null;
  referred_by: string | null;
  commission_rate: number | null;
}

export interface AuthResult {
  success: boolean;
  response?: Response; // 401 / 403 response (kalau gak success)
  user?: AuthUser;
  profile?: AuthProfile;
  role?: string;
}

// Admin roles (sesuai AuthContext.jsx isAdmin)
const ADMIN_ROLES = ["team_dev", "master", "admin"];

// ============================================================================
// Core: authenticate
// ============================================================================
// Verify JWT + check role. Return object dengan success flag.
// Kalau gak success, response sudah di-generate (tinggal return di caller).
export async function authenticate(
  req: Request,
  allowedRoles?: string[],
): Promise<AuthResult> {
  // ── 1. Parse Authorization header ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      success: false,
      response: json(
        { error: "Missing Authorization header. Expected: Bearer <token>" },
        401,
      ),
    };
  }

  // Header format: "Bearer <jwt>"
  if (!authHeader.startsWith("Bearer ")) {
    return {
      success: false,
      response: json(
        { error: "Invalid Authorization header format. Expected: Bearer <token>" },
        401,
      ),
    };
  }

  const jwt = authHeader.slice(7).trim();
  if (!jwt) {
    return {
      success: false,
      response: json({ error: "Empty token in Authorization header" }, 401),
    };
  }

  // ── 2. Verify JWT via Supabase Auth ──
  // Pakai client dengan user JWT sebagai auth supaya RLS berlaku.
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(jwt);

  if (userError || !user) {
    return {
      success: false,
      response: json(
        { error: "Invalid or expired token", details: userError?.message },
        401,
      ),
    };
  }

  // ── 3. Fetch profile dari tabel `profiles` ──
  // Pakai service_role client supaya pasti dapat profile (RLS profiles hanya
  // allow owner select, jadi gak bisa pakai user JWT untuk fetch profile sendiri
  // di edge function — atau sebenarnya bisa, tapi lebih reliable pakai service_role).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    // Profile belum ada (trigger handle_new_user belum jalan, atau RLS block)
    // Return error — jangan allow akses kalau profile belum ada.
    return {
      success: false,
      response: json(
        {
          error: "Profile not found",
          details:
            "User profile belum ada di tabel profiles. Hubungi administrator.",
        },
        403,
      ),
    };
  }

  // ── 4. Check is_active ──
  if (profile.is_active === false) {
    return {
      success: false,
      response: json(
        { error: "Account is deactivated. Hubungi administrator." },
        403,
      ),
    };
  }

  // ── 5. Determine role ──
  // Precedence: profile.role (fresh dari DB) > user.raw_app_meta_data.role (JWT) > null
  // Pakai profile.role supaya selalu fresh (kalau admin baru ubah role, JWT belum
  // refresh tapi DB sudah updated).
  const role = profile.role || (user.raw_app_meta_data?.role as string) || null;

  if (!role) {
    return {
      success: false,
      response: json(
        { error: "Role not assigned. Hubungi administrator." },
        403,
      ),
    };
  }

  // ── 6. Check role against allowedRoles (kalau specified) ──
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(role)) {
      return {
        success: false,
        response: json(
          {
            error: "Insufficient permissions",
            details: `Role "${role}" tidak diizinkan. Required: ${allowedRoles.join(", ")}`,
          },
          403,
        ),
      };
    }
  }

  // ── 7. All checks passed ──
  return {
    success: true,
    user: user as AuthUser,
    profile: profile as AuthProfile,
    role,
  };
}

// ============================================================================
// Helper: requireAdmin — shortcut untuk admin-only endpoints
// ============================================================================
export async function requireAdmin(req: Request): Promise<AuthResult> {
  return authenticate(req, ADMIN_ROLES);
}

// ============================================================================
// Helper: requireAuthenticated — shortcut untuk endpoints yang butuh login
// (any role, gak peduli apa)
// ============================================================================
export async function requireAuthenticated(req: Request): Promise<AuthResult> {
  return authenticate(req);
}
