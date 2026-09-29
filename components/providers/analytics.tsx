"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { PostHog } from "posthog-js";

/**
 * Page views on the public site, counted by PostHog.
 *
 * Only public pages render this (app/[locale]/layout.tsx), so the admin panel
 * never loads it and her own work is never counted as visits.
 *
 * WHEN IT LOADS
 *
 * posthog-js is not part of the page's own JavaScript. It is fetched once the
 * page has finished loading and the browser has a quiet moment, so on a phone
 * it never competes with the page for the network or for the processor while
 * the visitor is waiting to read. A visit that ends before then is simply not
 * counted, which is the right trade for a statistic.
 *
 * WHERE IT DOES NOT RUN
 *
 * Without a key, and on localhost: a development server or the test suite on
 * this machine would otherwise count as visits in her statistics.
 */

/**
 * The query parameters that are keys, not places: a waiting-list claim
 * (?claim=) and a link to write a testimonial (?token=). Whoever holds one can
 * use it, so none leaves this site in an analytics event.
 */
const SECRET_PARAMS = ["claim", "token"];

function withoutSecrets(url: string): string {
  return url.replace(new RegExp(`([?&])(${SECRET_PARAMS.join("|")})=[^&#]*`, "g"), "$1$2=redacted");
}

/** Every address PostHog attaches to an event, with the keys taken out. */
function sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$pathname"]) {
    const value = properties[key];
    if (typeof value === "string") properties[key] = withoutSecrets(value);
  }
  return properties;
}

/** Waits for the page to finish loading, then for the browser to be idle. */
function afterLoadAndIdle(): Promise<void> {
  const loaded =
    document.readyState === "complete"
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
  return loaded.then(
    () =>
      new Promise<void>((resolve) => {
        // Safari has no requestIdleCallback; a short pause does the same job.
        if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 4000 });
        else setTimeout(resolve, 1500);
      })
  );
}

let client: Promise<PostHog | null> | null = null;

/** PostHog, loaded and set up once per visit; null where it does not run. */
function posthog(): Promise<PostHog | null> {
  client ??= (async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (!key || local) return null;
    await afterLoadAndIdle();
    const { default: instance } = await import("posthog-js");
    instance.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      capture_pageview: false,
      // Nothing is stored in the visitor's browser: no cookie, no
      // localStorage. Each page load counts as a fresh anonymous visitor.
      // The cookie policy (legal.cookies) says the statistics run without
      // cookies, which is what lets the site go without a consent banner.
      persistence: "memory",
      sanitize_properties: sanitizeProperties,
    });
    return instance;
  })().catch(() => null);
  return client;
}

/**
 * One page view per address, including the first.
 *
 * Its own component because `useSearchParams()` needs a Suspense boundary
 * above it, and that boundary must stay this small: wrapped around the page
 * instead, it would make Next send the response before a page could call
 * notFound(), and missing pages would answer 200 (CLAUDE.md, "A Suspense
 * boundary high in the tree").
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    const url = withoutSecrets(`${pathname}${query ? `?${query}` : ""}`);
    void posthog().then((instance) => instance?.capture("$pageview", { $current_url: url }));
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}
