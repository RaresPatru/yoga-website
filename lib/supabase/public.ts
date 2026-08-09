import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A Supabase client with no session attached, for reading public data on the
 * server.
 *
 * Distinct from the other two clients in this folder, and the distinction is
 * worth keeping straight:
 *
 *   client.ts  browser, publishable key, carries the signed-in user's session
 *   server.ts  server, publishable key, reads the session from cookies
 *   admin.ts   server, SECRET key, bypasses Row Level Security entirely
 *   public.ts  server, publishable key, no session at all  <- this file
 *
 * Used by the share-image routes. They render pictures of published events and
 * blog posts, so they need no identity — and deliberately should not have one.
 * Reaching for admin.ts here would hand a service-role key to an endpoint that
 * anyone can call with any slug, which is exactly the kind of shortcut that
 * turns into a data leak. With this client, Row Level Security still applies:
 * an unpublished event is invisible, so no draft can be previewed by guessing
 * its URL.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
