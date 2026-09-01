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
 * This is the right client for anything a logged-out stranger is allowed to
 * see: every public page, the share-image routes and the sitemap. None of them
 * need an identity — and deliberately should not have one. Reaching for
 * admin.ts here would hand a service-role key to an endpoint that anyone can
 * call with any slug, which is exactly the kind of shortcut that turns into a
 * data leak. With this client, Row Level Security still applies: an unpublished
 * event is invisible, so no draft can be previewed by guessing its URL.
 *
 * WHY THE PUBLIC PAGES WERE MOVED HERE
 *
 * /events, /blog and /testimonials used to call server.ts, which reads the
 * visitor's cookies. They never needed to — every one of those queries already
 * filters to public rows explicitly (`published`, `approved`, `hidden`) — but
 * touching cookies at all was enough to take them down. If the caller happened
 * to be carrying an expired Supabase session, Supabase tried to refresh it
 * mid-render, could not write the new cookie from a Server Component, and left
 * its refresh lock held; the request then ran until Vercel killed it with a
 * 504. The full account is in the comment on setAll in ./server.ts.
 *
 * Using a client that has no session is what makes that impossible rather than
 * merely fixed: a page built on this client has nothing to refresh, so no
 * amount of stale cookie state in a visitor's browser can affect it.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
