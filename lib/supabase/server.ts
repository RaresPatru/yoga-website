import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client that carries the signed-in user's session.
 *
 * Use this only where the session actually matters — the admin panel and the
 * API routes that act on behalf of a signed-in administrator. Public pages
 * should use `createPublicClient()` from ./public.ts instead, which has no
 * session at all and therefore cannot be affected by whatever cookies the
 * visitor happens to be carrying. See the note below for why that distinction
 * turned out to matter.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // WHY THIS IS WRAPPED, AND WHAT HAPPENED WITHOUT IT
          //
          // Supabase calls setAll when it decides the access token needs
          // refreshing. That is fine inside a Server Action, a Route Handler or
          // the proxy — all of them own the outgoing response and may set
          // headers on it. It is NOT allowed while rendering a Server
          // Component, where the response has already begun; Next throws
          //
          //   Cookies can only be modified in a Server Action or Route Handler
          //
          // The throw does not surface as a clean 500. It escapes from inside
          // gotrue-js's refresh routine, which runs while holding an internal
          // lock that serialises token refreshes. The lock is never released,
          // so every later call on that client waits on it forever and the
          // request runs until Vercel kills it:
          //
          //   504 GATEWAY_TIMEOUT / FUNCTION_INVOCATION_TIMEOUT
          //
          // That is exactly what took /events, /blog and /testimonials down in
          // production while /, /about and an incognito window stayed perfectly
          // healthy. The tell was the incognito part: no cookies means no
          // expired token, means no refresh, means no throw. Anyone who had
          // ever signed in to the admin panel — which, on this project, is the
          // instructor and the developer — eventually hit it once their token
          // aged past its expiry. Ordinary visitors never did, so the site
          // looked fine from the outside.
          //
          // Swallowing the error is the documented Supabase pattern and is safe
          // here: a refreshed token that cannot be written is simply not
          // persisted, and the request continues with the session it already
          // had. The proxy refreshes and writes cookies properly on the admin
          // routes that need it.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called while rendering a Server Component. Ignore it.
          }
        },
      },
    }
  );
}
