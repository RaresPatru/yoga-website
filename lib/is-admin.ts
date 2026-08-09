import { createClient } from "@supabase/supabase-js";

/**
 * Decides whether an incoming API request comes from an administrator.
 *
 * Used by the admin-only API routes (/api/upload, /api/translate). The browser
 * sends the logged-in user's access token as `Authorization: Bearer <token>`;
 * see lib/get-auth-token.ts for the sending side.
 *
 * Two checks happen here, and both matter:
 *
 *   1. Is the token real?  `auth.getUser(token)` asks Supabase to verify the
 *      signature and expiry. A forged or stale token fails here.
 *
 *   2. Is that user an administrator?  This is the check that was missing.
 *      The previous version stopped after step 1, which meant *any* valid
 *      account passed — and because public sign-ups were enabled, anyone could
 *      make themselves one. See supabase/migrations/20260807_admin_role_and_
 *      rls_hardening.sql for the full write-up.
 *
 * Step 2 calls the `is_admin()` SQL function rather than querying the admins
 * table directly, deliberately: that function is also what every RLS policy
 * calls, so there is exactly one definition of "is an admin" in the system. If
 * the rule ever changes, it changes in one place and the API and the database
 * cannot drift apart.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;

  // Attaching the token as a global header makes every call on this client run
  // "as" that user, which is what lets auth.uid() inside is_admin() resolve to
  // them. Sessions are not persisted because this client lives for one request.
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return false;

  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin");
  if (rpcError) {
    console.error("is_admin check failed:", rpcError.message);
    return false; // fail closed: an unanswerable question is not a yes
  }

  return isAdmin === true;
}
