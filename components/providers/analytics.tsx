"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { CaptureResult, PostHog } from "posthog-js";
import {
  analyticsHost,
  isCounted,
  pageKey,
  scrubbed,
  whyNotCounted,
  withoutSecrets,
  type AnalyticsEvents,
} from "@/lib/analytics";

/**
 * Visitor statistics, counted by PostHog on its EU cloud.
 *
 * The rules (where it runs, what is cleaned out, what each event carries) are
 * in lib/analytics.ts. This file loads the library and hands it events.
 *
 * WHERE IT RUNS
 *
 * Only public pages render <Analytics /> (app/[locale]/layout.tsx), so the
 * admin panel never loads it, and a browser signed in to the admin panel is
 * not counted on the public site either: her own visits are not her
 * visitors. Nor is a browser that sends Global Privacy Control or Do Not
 * Track, one driven by a program, the admin's previews, or a page reached
 * through someone's personal link. And only the site's public address sends
 * anything: a development server, a preview or the test suite never reaches
 * her statistics.
 *
 * WHEN IT LOADS
 *
 * posthog-js is not part of the page's own JavaScript. It is fetched once the
 * page has finished loading and the browser has a quiet moment, so on a phone
 * it never competes with the page while the visitor is waiting to read.
 * Events from before then wait for it, each with the address and time it
 * happened at; a visit that ends before then is not counted, which is the
 * right trade for a statistic.
 *
 * WHAT IT DOES NOT DO
 *
 * No cookie and nothing in the browser's storage, no person profiles, no
 * clicks recorded on their own, no recordings of the screen, no surveys. Each
 * is switched off here rather than in PostHog's settings, and the settings
 * are not even fetched, so nothing changed there can switch them back on.
 */

const DEBUG = process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "1";

/** The admin's session cookie, which Supabase names sb-<project>-auth-token (split into .0, .1… when long). */
function signedIn(): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie);
}

/**
 * A browser driven by a program, as tests and some crawlers are. posthog-js
 * drops what such a browser sends, on these same signs among others; asking
 * first spares it the download.
 */
function automated(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  return (
    nav.webdriver === true ||
    nav.userAgent.includes("HeadlessChrome") ||
    !!nav.userAgentData?.brands?.some((entry) => entry.brand.includes("HeadlessChrome"))
  );
}

/** Global Privacy Control, or the older Do Not Track. */
function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return nav.globalPrivacyControl === true || [nav.doNotTrack, nav.msDoNotTrack, win.doNotTrack].some((v) => v === "1" || v === "yes");
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

/**
 * The last word before anything leaves the browser: no keys or click
 * identifiers anywhere in it, and nothing from a page that is not counted
 * (PostHog's own $pageleave can be sent from one).
 */
function cleanEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return null;
  const pathname = event.properties?.$pathname;
  if (typeof pathname === "string" && !isCounted(pathname)) return null;
  return {
    ...event,
    properties: scrubbed(event.properties),
    ...(event.$set ? { $set: scrubbed(event.$set) } : {}),
    ...(event.$set_once ? { $set_once: scrubbed(event.$set_once) } : {}),
  };
}

let client: Promise<PostHog | null> | null = null;

/** PostHog, loaded and set up once per visit; null where it does not run. */
function posthog(): Promise<PostHog | null> {
  client ??= (async () => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = analyticsHost();
    const reason = whyNotCounted({
      key,
      host,
      page: { origin: window.location.origin, hostname: window.location.hostname },
      site: process.env.NEXT_PUBLIC_SITE_URL,
      debug: DEBUG,
      signedIn: signedIn(),
      optedOut: optedOut(),
      automated: automated(),
    });
    if (reason || !key) {
      if (DEBUG) console.info(`[analytics] Not counting this visit: ${reason}.`);
      return null;
    }
    await afterLoadAndIdle();
    const { default: instance } = await import("posthog-js");
    instance.init(key, {
      api_host: host,
      // Page views are sent below, with the address they happened at.
      capture_pageview: false,
      // How long a page was read, and how far down; sent as the visitor leaves it.
      capture_pageleave: true,
      autocapture: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      // PostHog's settings are not fetched, and nothing is loaded from it, so
      // a switch flipped there cannot turn any of the above back on.
      advanced_disable_flags: true,
      disable_external_dependency_loading: true,
      // Nothing is stored in the visitor's browser: no cookie, no
      // localStorage. Each page load counts as a fresh anonymous visitor. The
      // cookie policy (legal.cookies) says the statistics run without cookies,
      // which is what lets the site go without a consent banner.
      persistence: "memory",
      person_profiles: "never",
      before_send: cleanEvent,
      debug: DEBUG,
    });
    return instance;
  })().catch(() => null);
  return client;
}

/** Where and when something happened, taken at the moment it did: PostHog may load after the visitor has moved on. */
interface Moment {
  url: string;
  pathname: string;
  time: Date;
}

function now(): Moment {
  return { url: withoutSecrets(window.location.href), pathname: window.location.pathname, time: new Date() };
}

function send(event: string, properties: Record<string, unknown>, at: Moment, leaving = false) {
  if (!isCounted(at.pathname)) return;
  void posthog().then((instance) =>
    instance?.capture(
      event,
      { ...properties, $current_url: at.url, $pathname: at.pathname },
      // Sent at once rather than with the next batch, when the visitor may be
      // about to leave for Stripe.
      { timestamp: at.time, ...(leaving ? { send_instantly: true } : {}) }
    )
  );
}

let lastPage: string | null = null;

/** Counts the page being shown, once (lib/analytics.ts, pageKey). */
function countPage() {
  const key = pageKey(window.location.pathname, window.location.search);
  if (key === lastPage) return;
  lastPage = key;
  send("$pageview", {}, now());
}

/**
 * Records one of the site's events (lib/analytics.ts, AnalyticsEvents).
 * `leaving`: the page may navigate away straight after, so it is sent at once.
 */
export function track<K extends keyof AnalyticsEvents>(
  name: K,
  properties: AnalyticsEvents[K],
  options: { leaving?: boolean } = {}
) {
  // An event is never recorded ahead of the view of the page it happened on.
  countPage();
  send(name, { ...properties }, now(), options.leaving);
}

/** Records an event when the page that renders it is shown: for server pages, which cannot call track(). */
export function TrackView<K extends keyof AnalyticsEvents>({
  name,
  properties,
}: {
  name: K;
  properties: AnalyticsEvents[K];
}) {
  const signature = JSON.stringify(properties);
  useEffect(() => {
    track(name, JSON.parse(signature) as AnalyticsEvents[K]);
  }, [name, signature]);
  return null;
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
    countPage();
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
