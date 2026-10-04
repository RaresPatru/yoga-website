import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  POSTHOG_EU_HOST,
  analyticsHost,
  isCounted,
  pageKey,
  scrubbed,
  whyNotCounted,
  withoutSecrets,
  type Circumstances,
} from "../lib/analytics";
import { deleteEventBySlug, deletePostBySlug, registerDirectly, seedEvent, seedPost, unique } from "./helpers";
import { resetStripe } from "./stripe-helpers";
import {
  analyticsEvents,
  analyticsRequests,
  anythingOn,
  asVisitor,
  eventsOn,
  pageOf,
  resetAnalytics,
  visitorPage,
  waitForEvents,
} from "./analytics-helpers";

/**
 * Visitor statistics (lib/analytics.ts, components/providers/analytics.tsx).
 *
 * The rules are checked as plain functions; what a visit actually sends is
 * checked against the suite's stand-in for PostHog (tests/fake-posthog.ts),
 * which the test build sends to instead of PostHog itself. Her own visits
 * are checked in admin-analytics.spec.ts, signed in.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const SITE = "https://flow4ward.ro";

/** A production visit that is counted; each case below changes one thing. */
const counted: Circumstances = {
  key: "phc_live",
  host: POSTHOG_EU_HOST,
  page: { origin: SITE, hostname: "flow4ward.ro" },
  site: SITE,
  debug: false,
  signedIn: false,
  optedOut: false,
  automated: false,
};

test.describe("the rules", () => {
  test("only the public layout renders it, and the library is fetched later, not bundled", () => {
    expect(source("app/[locale]/layout.tsx")).toMatch(/<Analytics \/>/);
    expect(source("app/layout.tsx"), "the root layout wraps the admin panel too").not.toMatch(
      /providers\/analytics|posthog/
    );

    // A static import would put posthog-js into the page's own JavaScript.
    const staticImports = ["app", "components", "lib"]
      .flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((file) => /^import(?! type)[^;]*from ["']posthog-js/m.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(staticImports).toEqual([]);
    expect(source("components/providers/analytics.tsx")).toMatch(/await import\("posthog-js"\)/);

    const admin = ["app/admin", "components/admin"]
      .flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((file) => /posthog|providers\/analytics/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(admin, "the admin panel must not load the statistics").toEqual([]);
  });

  test("only the site's public address sends, and never from this machine to PostHog", () => {
    expect(whyNotCounted(counted)).toBeNull();

    expect(whyNotCounted({ ...counted, key: undefined })).toMatch(/no PostHog key/);
    expect(whyNotCounted({ ...counted, optedOut: true })).toMatch(/not to be tracked/);
    expect(whyNotCounted({ ...counted, signedIn: true })).toMatch(/signed in/);
    expect(whyNotCounted({ ...counted, automated: true })).toMatch(/automated/);

    // A preview: another address, and no NEXT_PUBLIC_SITE_URL in that environment.
    const preview = { origin: "https://yoga-website-git-feature-patru.vercel.app", hostname: "yoga-website-git-feature-patru.vercel.app" };
    expect(whyNotCounted({ ...counted, page: preview, site: undefined })).toMatch(/public address/);
    expect(whyNotCounted({ ...counted, page: preview })).toMatch(/public address/);

    // This machine, and a phone on the Wi-Fi reaching it, never send to PostHog,
    // even with the site's address set to match.
    for (const page of [
      { origin: "http://localhost:3000", hostname: "localhost" },
      { origin: "http://127.0.0.1:3000", hostname: "127.0.0.1" },
      { origin: "http://192.168.1.138:3000", hostname: "192.168.1.138" },
    ]) {
      expect(whyNotCounted({ ...counted, page, site: page.origin }), page.origin).toMatch(/this machine/);
    }

    // The suite: this machine, sending to a stand-in on it.
    const suite = { origin: "http://localhost:3100", hostname: "localhost" };
    expect(whyNotCounted({ ...counted, page: suite, site: suite.origin, host: "http://127.0.0.1:12112" })).toBeNull();

    // A deliberate test lifts the address rules, and nothing else.
    expect(whyNotCounted({ ...counted, page: preview, site: undefined, debug: true })).toBeNull();
    expect(whyNotCounted({ ...counted, page: { origin: "http://localhost:3000", hostname: "localhost" }, debug: true })).toBeNull();
    expect(whyNotCounted({ ...counted, debug: true, optedOut: true })).not.toBeNull();
    expect(whyNotCounted({ ...counted, debug: true, signedIn: true })).not.toBeNull();
    expect(whyNotCounted({ ...counted, debug: true, automated: true })).not.toBeNull();
  });

  test("they go to PostHog's EU cloud, or to a stand-in on this machine", () => {
    expect(analyticsHost(undefined)).toBe("https://eu.i.posthog.com");
    expect(analyticsHost("")).toBe(POSTHOG_EU_HOST);
    // No setting sends them out of the EU.
    expect(analyticsHost("https://us.i.posthog.com")).toBe(POSTHOG_EU_HOST);
    expect(analyticsHost("https://app.posthog.com")).toBe(POSTHOG_EU_HOST);
    expect(analyticsHost("https://eu.posthog.com")).toBe(POSTHOG_EU_HOST);
    expect(analyticsHost("not an address")).toBe(POSTHOG_EU_HOST);
    expect(analyticsHost("http://127.0.0.1:12112")).toBe("http://127.0.0.1:12112");
    expect(analyticsHost("http://localhost:8010/")).toBe("http://localhost:8010");
  });

  test("keys and click identifiers are taken out of every address", () => {
    expect(withoutSecrets("https://x.ro/ro/booking?token=abc123&result=cancelled")).toBe(
      "https://x.ro/ro/booking?token=redacted&result=cancelled"
    );
    expect(withoutSecrets("/ro/events/retreat?claim=0b7e-11&utm_source=ig#top")).toBe(
      "/ro/events/retreat?claim=redacted&utm_source=ig#top"
    );
    expect(withoutSecrets("/ro/events/retreat?checkout=cs_test_a1B2c3&paid=1")).toBe(
      "/ro/events/retreat?checkout=redacted&paid=1"
    );
    expect(withoutSecrets("/ro?fbclid=IwAR0abc&igshid=MzRl")).toBe("/ro?fbclid=redacted&igshid=redacted");
    // Inside another address, percent-encoded, as in a referrer.
    expect(withoutSecrets("https://l.instagram.com/?u=https%3A%2F%2Fx.ro%2Fro%2Fbooking%3Ftoken%3Dabc%26x%3D1")).toBe(
      "https://l.instagram.com/?u=https%3A%2F%2Fx.ro%2Fro%2Fbooking%3Ftoken%3Dredacted%26x%3D1"
    );
    // Only those names: a longer name that ends the same way is a place, not a key.
    expect(withoutSecrets("/ro/blog?mytoken=1&tokens=2&page=2")).toBe("/ro/blog?mytoken=1&tokens=2&page=2");

    // Every property, at any depth, and click identifiers PostHog copies into
    // properties of their own. The project's key, in `token`, stays: PostHog
    // throws away an event without it.
    expect(
      scrubbed({
        $current_url: "https://x.ro/ro/booking?token=abc",
        $referrer: "https://x.ro/ro/events/a?claim=b",
        nested: { list: ["/ro?checkout=cs_test_1"] },
        fbclid: "IwAR0abc",
        $session_entry_fbclid: "IwAR0abc",
        $session_entry_utm_source: "instagram",
        utm_source: "instagram",
        token: "phc_project_key",
        count: 3,
      })
    ).toEqual({
      $current_url: "https://x.ro/ro/booking?token=redacted",
      $referrer: "https://x.ro/ro/events/a?claim=redacted",
      nested: { list: ["/ro?checkout=redacted"] },
      fbclid: "redacted",
      $session_entry_fbclid: "redacted",
      $session_entry_utm_source: "instagram",
      utm_source: "instagram",
      token: "phc_project_key",
      count: 3,
    });
  });

  test("which pages count, and when an address is a new page", () => {
    for (const path of ["/ro", "/en/events/retreat", "/ro/blog/post", "/ro/testimonials", "/ro/testimonials/share"]) {
      expect(isCounted(path), path).toBe(true);
    }
    for (const path of [
      "/ro/preview/blog/1",
      "/en/preview/events/2",
      "/ro/booking",
      "/en/unsubscribe",
      "/ro/testimonials/write",
    ]) {
      expect(isCounted(path), path).toBe(false);
    }

    // Taking the checkout's id out of the address is not a second view…
    expect(pageKey("/ro/events/a", "?checkout=cs_test_1&paid=1")).toBe(pageKey("/ro/events/a", ""));
    // …but another page of a list is.
    expect(pageKey("/ro/blog", "?page=2")).not.toBe(pageKey("/ro/blog", ""));
  });

  test("the browser may send them to that one address and load nothing from PostHog", async ({ request }) => {
    const policy = (await request.get("/ro")).headers()["content-security-policy"] ?? "";
    const directive = (name: string) => policy.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";
    // The test build sends to its stand-in; production's is the EU cloud (above).
    expect(directive("connect-src")).toContain("http://127.0.0.1:12112");
    expect(policy).not.toContain("posthog.com");
    expect(directive("script-src")).not.toMatch(/12112/);
  });
});

/** Nothing the site sent was refused, as PostHog refuses an event filed under no project. */
async function nothingRefused() {
  expect((await analyticsRequests()).filter((request) => !request.accepted)).toEqual([]);
}

test.describe("what a visit sends", () => {
  test.beforeEach(async ({ context }) => {
    await asVisitor(context);
    await resetAnalytics();
  });
  test.afterEach(nothingRefused);

  test("a page view each, with nothing kept in the browser and nothing asked of PostHog", async ({ page, context }) => {
    const marker = unique("visit");
    await page.goto(`/ro?utm_campaign=${marker}`);
    const [view] = await waitForEvents("$pageview", marker);
    expect(view.properties.$pathname).toBe("/ro");
    expect(view.properties.utm_campaign).toBe(marker);
    // Nobody becomes a person in PostHog.
    expect(view.properties.$process_person_profile).toBe(false);

    // No cookie and nothing in the browser's storage.
    expect((await context.cookies()).map((cookie) => cookie.name).filter((name) => /^ph_|posthog/i.test(name))).toEqual([]);
    const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
    expect(stored.filter((name) => /ph_|posthog/i.test(name))).toEqual([]);

    // Moving around the site counts each page once.
    await page.locator("next-route-announcer").waitFor({ state: "attached" });
    await page.getByRole("navigation", { name: "Secțiunile site-ului" }).getByRole("link", { name: "Blog", exact: true }).click();
    await expect(page).toHaveURL(/\/ro\/blog$/);
    await waitForEvents("$pageview", "/ro/blog");
    expect(await eventsOn("$pageview", marker)).toHaveLength(1);

    // Only events were sent: not a request for PostHog's settings, flags or
    // scripts (afterEach checks none was refused).
    expect((await analyticsRequests()).map((r) => r.path)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^\/(e|i\/v0\/e)\/?$/)])
    );
  });

  test("keys and click identifiers never leave the browser", async ({ page }) => {
    const event = await seedEvent();
    const marker = unique("keys");
    const claim = "00000000-0000-4000-8000-000000000000";
    try {
      await page.goto(`/ro/events/${event.slug}?claim=${claim}&fbclid=IwAR-secret-click&utm_source=${marker}`);
      const [view] = await waitForEvents("$pageview", marker);
      expect(pageOf(view)).toContain("claim=redacted");
      expect(pageOf(view)).toContain("fbclid=redacted");
      const everything = JSON.stringify(await analyticsEvents());
      expect(everything).not.toContain(claim);
      expect(everything).not.toContain("IwAR-secret-click");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("pages behind a personal link are not counted", async ({ page }) => {
    const marker = unique("personal");
    for (const path of ["/ro/booking", "/ro/unsubscribe", "/ro/testimonials/write"]) {
      await page.goto(`${path}?token=not-a-real-token&utm_source=${marker}`);
      await page.waitForLoadState("load");
    }
    // A page that is counted, after them: by the time its view arrives,
    // theirs would have too.
    await page.goto(`/ro/blog?utm_source=${marker}`);
    await waitForEvents("$pageview", "/ro/blog");
    expect((await anythingOn(marker)).map((e) => `${e.event} ${pageOf(e)}`)).toEqual([
      expect.stringContaining("/ro/blog?utm_source="),
    ]);
  });

  test("a browser that asks not to be tracked is not counted", async ({ browser, baseURL }) => {
    const marker = unique("refused");
    const withGpc = await visitorPage(browser, baseURL);
    await withGpc.addInitScript(() =>
      Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true })
    );
    await withGpc.goto(`/ro?utm_source=${marker}-gpc`);
    const withDnt = await visitorPage(browser, baseURL);
    await withDnt.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { value: "1", configurable: true }));
    await withDnt.goto(`/ro?utm_source=${marker}-dnt`);

    const anyone = await visitorPage(browser, baseURL);
    await anyone.goto(`/ro?utm_source=${marker}-anyone`);
    await waitForEvents("$pageview", `${marker}-anyone`);
    await anyone.waitForTimeout(1000);
    expect(await anythingOn(`${marker}-gpc`)).toEqual([]);
    expect(await anythingOn(`${marker}-dnt`)).toEqual([]);
    await Promise.all([withGpc, withDnt, anyone].map((p) => p.context().close()));
  });

  test("the same site under another address is not counted", async ({ page, browser }) => {
    // The test server answers on 127.0.0.1 as well as localhost, and only
    // localhost is its public address (NEXT_PUBLIC_SITE_URL), as a preview
    // or a copy of the site is not production's.
    const marker = unique("address");
    const elsewhere = await visitorPage(browser);
    await elsewhere.goto(`http://127.0.0.1:3100/ro?utm_source=${marker}-elsewhere`);
    await page.goto(`/ro?utm_source=${marker}-here`);
    await waitForEvents("$pageview", `${marker}-here`);
    await page.waitForTimeout(1000);
    expect(await anythingOn(`${marker}-elsewhere`)).toEqual([]);
    await elsewhere.context().close();
  });
});

test.describe("what the site records", () => {
  test.beforeEach(async ({ context }) => {
    await asVisitor(context);
    await resetAnalytics();
  });
  test.afterEach(nothingRefused);

  async function fillDetails(page: Page, email: string) {
    // The CAPTCHA passing proves React has hydrated; a fill before that is lost.
    await expect(page.locator('[data-verified="true"]')).toBeAttached();
    await page.getByLabel("Nume complet").fill("Ana Analytics");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Telefon", { exact: true }).fill("0722333444");
  }

  test("an event's page, and a free booking from the button to the seat", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("stats")}@example.com`;
    try {
      await page.goto(`/ro/events/${event.slug}`);
      const [viewed] = await waitForEvents("event_viewed", event.slug);
      expect(viewed.properties).toMatchObject({ event_slug: event.slug, phase: "upcoming", paid: false, sold_out: false });

      await fillDetails(page, email);
      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();
      await expect(page.getByRole("heading", { name: "Înscriere reușită!" })).toBeVisible();

      const [clicked] = await waitForEvents("booking_clicked", event.slug);
      expect(clicked.properties).toMatchObject({ event_slug: event.slug, paid: false, waitlist: false });
      const [completed] = await waitForEvents("booking_completed", event.slug);
      expect(completed.properties).toMatchObject({ event_slug: event.slug, paid: false, via: "form" });

      // The page's view is recorded ahead of what happened on it.
      const onPage = (await analyticsEvents()).filter((e) => pageOf(e).includes(event.slug));
      const [view] = onPage.filter((e) => e.event === "$pageview");
      for (const e of onPage) expect(Date.parse(e.timestamp ?? "")).toBeGreaterThanOrEqual(Date.parse(view.timestamp ?? ""));
      // Nothing typed into the form was sent.
      const everything = JSON.stringify(await analyticsEvents());
      for (const typed of [email, "Ana Analytics", "0722333444", "722333444"]) expect(everything).not.toContain(typed);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a full event: the waiting list, and a refusal with its reason", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    const email = `${unique("waiting")}@example.com`;
    try {
      await registerDirectly(event.id);
      await page.goto(`/ro/events/${event.slug}`);
      const [viewed] = await waitForEvents("event_viewed", event.slug);
      expect(viewed.properties).toMatchObject({ sold_out: true });

      await page.getByRole("button", { name: "Intră pe lista de așteptare" }).click();
      await fillDetails(page, email);
      await page.getByRole("button", { name: "Înscrie-te pe lista de așteptare" }).click();
      await expect(page.getByRole("heading", { name: "Listă de așteptare" })).toBeVisible();
      const [clicked] = await waitForEvents("booking_clicked", event.slug);
      expect(clicked.properties).toMatchObject({ waitlist: true });
      await waitForEvents("waitlist_joined", event.slug);

      // The same address again: refused, and the reason is recorded.
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByRole("button", { name: "Intră pe lista de așteptare" }).click();
      await fillDetails(page, email);
      await page.getByRole("button", { name: "Înscrie-te pe lista de așteptare" }).click();
      await expect(page.getByText("Ești deja pe lista de așteptare pentru acest eveniment.")).toBeVisible();
      const [failed] = await waitForEvents("booking_failed", event.slug);
      expect(failed.properties).toMatchObject({ event_slug: event.slug, waitlist: true, reason: "already_waiting" });
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a paid booking: the button before Stripe, the seat when Stripe sends them back", async ({ page }) => {
    await resetStripe();
    const event = await seedEvent({ price: 300, max_participants: 5 });
    const email = `${unique("paid-stats")}@example.com`;
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await fillDetails(page, email);
      await page.getByRole("button", { name: "Continuă la plată" }).click();
      await page.waitForURL(/127\.0\.0\.1:12111\/pay\/cs_/);
      // Sent before the page left for Stripe.
      const [clicked] = await waitForEvents("booking_clicked", event.slug);
      expect(clicked.properties).toMatchObject({ paid: true, waitlist: false });

      await page.getByRole("button", { name: "Plătește" }).click();
      await expect(page.getByRole("heading", { name: "Plata a fost primită" })).toBeVisible();
      const [completed] = await waitForEvents("booking_completed", event.slug);
      expect(completed.properties).toMatchObject({ paid: true, via: "checkout" });

      // Stripe's return address carried the checkout's id; it was not sent.
      const returned = (await analyticsEvents()).filter((e) => pageOf(e).includes("checkout="));
      expect(returned.length).toBeGreaterThan(0);
      for (const e of returned) expect(pageOf(e)).toContain("checkout=redacted");
      // And taking it out of the address was not a second view.
      expect(await eventsOn("$pageview", event.slug)).toHaveLength(2);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a post read to its end, but not one only scrolled past", async ({ page }) => {
    const post = await seedPost();
    try {
      await page.clock.install();
      await page.goto(`/ro/blog/${post.slug}`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // Its view arrives a few seconds in: the end is in sight, but too soon to count.
      await waitForEvents("$pageview", post.slug);
      expect(await eventsOn("blog_post_read", post.slug)).toEqual([]);

      await page.clock.fastForward("01:00");
      const [read] = await waitForEvents("blog_post_read", post.slug);
      expect(read.properties).toMatchObject({ post_slug: post.slug });
      expect(read.properties).toHaveProperty("reading_minutes");
    } finally {
      await deletePostBySlug(post.slug);
    }
  });
});
