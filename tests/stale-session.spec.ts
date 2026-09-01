import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A visitor carrying a stale Supabase session must not be able to take a public
 * page down.
 *
 * WHAT HAPPENED, SEPTEMBER 2026
 *
 * /events, /blog and /testimonials returned 504 FUNCTION_INVOCATION_TIMEOUT in
 * production while /, /about and any incognito window were perfectly healthy.
 *
 * Those three pages read their data through lib/supabase/server.ts, which reads
 * the visitor's cookies. When the cookies held a session whose access token had
 * expired, Supabase tried to refresh it while the page was rendering and then
 * called `setAll` to persist the new token. Writing a cookie is not allowed
 * during a Server Component render, so Next threw
 *
 *   Cookies can only be modified in a Server Action or Route Handler
 *
 * from inside gotrue-js's refresh routine — which was holding the lock that
 * serialises refreshes. The lock was never released, so the render waited on it
 * until the platform killed the request.
 *
 * Only people who had signed in to the admin panel ever carried such a cookie,
 * which is why the site looked fine to everyone except the two people who
 * maintain it, and why an incognito window "fixed" it.
 *
 * Two independent guards below, because they fail for different reasons:
 * the first proves the behaviour, the second proves the structure that
 * guarantees it.
 */

/**
 * The cookie name @supabase/ssr looks for, derived the same way the library
 * does — from the first label of the project host. Local Supabase runs on
 * 127.0.0.1, so this is `sb-127-auth-token` in CI and `sb-<projectref>-auth-token`
 * against a real project.
 */
function authCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing — check .env.test");
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

/**
 * A session cookie in exactly the shape @supabase/ssr writes, holding an access
 * token that expired on 1 January 2021 and a refresh token that will be
 * rejected.
 *
 * The detail that matters: the access token has to be a *syntactically valid*
 * JWT. An obviously-garbage value is discarded without a refresh attempt and
 * reproduces nothing — that mistake made a first version of this test pass
 * against the very code it was meant to catch. gotrue-js decodes the payload
 * locally, sees `exp` in the past, and only then tries to refresh, which is the
 * step that writes cookies.
 */
function staleSessionCookie(): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const expiredJwt = [
    part({ alg: "HS256", typ: "JWT" }),
    part({
      sub: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      iat: 1609459200,
      exp: 1609462800,
    }),
    "not-a-real-signature",
  ].join(".");

  const session = {
    access_token: expiredJwt,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1609462800,
    refresh_token: "expired-refresh-token",
    user: {
      id: "11111111-1111-1111-1111-111111111111",
      aud: "authenticated",
      role: "authenticated",
      email: "stale@example.com",
    },
  };

  return `base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
}

const PUBLIC_PAGES = [
  "/ro",
  "/ro/about",
  "/ro/events",
  "/ro/blog",
  "/ro/testimonials",
  "/ro/contact",
];

test.describe("a stale admin session must not break the public site", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} renders for a visitor holding an expired session`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        {
          name: authCookieName(),
          value: staleSessionCookie(),
          url: baseURL!,
        },
      ]);

      // Before the fix this never resolved, so the assertion that matters is
      // simply that the navigation completes at all — Playwright's 30s
      // navigation timeout stands in for the platform killing the function.
      const response = await page.goto(path);

      expect(response?.status(), `${path} should answer 200, not hang`).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    });
  }
});

test.describe("public pages must not read the visitor's cookies", () => {
  /**
   * The structural half of the guard.
   *
   * The behavioural test above can only prove the pages work today. This one
   * encodes *why* they work: nothing a visitor sends can influence a page that
   * never looks at a session. Reintroducing the import is what caused the
   * outage, so reintroducing the import is what fails here — immediately, with
   * no browser and no timing involved.
   *
   * lib/supabase/public.ts is the correct client for these pages; Row Level
   * Security still applies, so this is not a loosening of access.
   */
  test("nothing under app/[locale] imports the cookie-aware client", () => {
    const root = join(process.cwd(), "app", "[locale]");

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")
          ? [full]
          : [];
      });

    const offenders = walk(root).filter((file) =>
      /from\s+["']@\/lib\/supabase\/server["']/.test(readFileSync(file, "utf8"))
    );

    expect(
      offenders.map((f) => f.replace(process.cwd(), "").replace(/\\/g, "/")),
      "public pages must use createPublicClient() from lib/supabase/public.ts — " +
        "see the comment at the top of this file for what happens otherwise"
    ).toEqual([]);
  });
});
