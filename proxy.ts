import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * Runs before every matching request. Two jobs:
 *
 *   /admin/*  -> confirm the visitor is a signed-in administrator, server-side,
 *                before any HTML is sent.
 *   everything else -> hand off to next-intl, which handles the /ro and /en
 *                URL prefixes.
 *
 * Why the admin check moved here: it used to live in app/admin/layout.tsx as a
 * useEffect that called router.push("/admin/login"). That runs in the browser
 * *after* the page has already been downloaded and hydrated, so an
 * unauthenticated visitor briefly saw the admin shell before being bounced.
 * Checking here means they get a redirect instead of a page.
 *
 * The database is still the real gate — the RLS policies mean a non-admin sees
 * no data even if they somehow reach a page. This is the outer layer of two.
 */
export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return handleAdmin(request);
  }
  return intlMiddleware(request);
}

async function handleAdmin(request: NextRequest) {
  // The login page must stay reachable, otherwise a signed-out admin would be
  // redirected to the page that redirects them, forever.
  if (request.nextUrl.pathname === "/admin/login") {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured we cannot prove anyone is an admin, so we do
  // not let anyone in. Failing closed: a misconfigured deploy locks the admin
  // panel rather than opening it.
  if (!url || !anonKey) {
    return redirectToLogin(request);
  }

  // Supabase keeps the session in cookies. `createServerClient` reads them from
  // the incoming request, and if the access token needed refreshing it writes
  // the new ones onto the response we hand back.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() re-validates the token against Supabase. getSession() would only
  // read the cookie, which the browser controls and could therefore be forged.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectToLogin(request);
  }

  // Signed in is not the same as authorised — same distinction the RLS policies
  // now draw. is_admin() is the single source of truth for both.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) {
    return redirectToLogin(request, "forbidden");
  }

  return response;
}

function redirectToLogin(request: NextRequest, reason?: string) {
  const loginUrl = new URL("/admin/login", request.url);
  if (reason) loginUrl.searchParams.set("error", reason);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // `admin` is no longer excluded here — that exclusion is what left the admin
  // area without any server-side protection. Static assets and API routes stay
  // out: API routes do their own auth via lib/is-admin.ts.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
