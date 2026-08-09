import { test, expect } from "@playwright/test";
import { seedEvent, deleteEventBySlug } from "./helpers";

/**
 * Guards the things that decide whether anyone finds or clicks a link.
 *
 * These are invisible failures: a missing og:image or a duplicated <title>
 * breaks nothing on screen, so nobody notices until months of shares have gone
 * out as blank grey cards. That is exactly what had happened — every page in
 * the site returned `<title>Yoga Flow</title>` and no og: tags at all.
 *
 * Assertions are made against the raw HTML response rather than the rendered
 * page, because that is what a crawler sees. A social-media scraper does not
 * run JavaScript: if the content only appears after hydration, it does not
 * exist as far as the preview card is concerned.
 */
test.describe("SEO and social sharing", () => {
  test("an event page is fully server-rendered", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 12 });
    const title = `Eveniment E2E ${event.slug}`;

    try {
      const res = await request.get(`/ro/events/${event.slug}`);
      expect(res.status()).toBe(200);
      const html = await res.text();

      // The things someone needs before deciding to click: what it is, where,
      // and what it costs. None of these were in the HTML before.
      expect(html, "title must be in the HTML, not fetched later").toContain(title);
      expect(html).toContain("Cluj-Napoca");
      expect(html).toContain("150");

      // Unique per page, not the site name repeated everywhere.
      const pageTitle = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      expect(pageTitle).toContain(title);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an event page carries share tags and Event structured data", async ({ request }) => {
    const event = await seedEvent({ price: 0 });

    try {
      const html = await (await request.get(`/ro/events/${event.slug}`)).text();

      expect(html).toMatch(/property="og:title"/);
      expect(html).toMatch(/property="og:image"/);
      expect(html).toMatch(/property="og:description"/);
      expect(html).toMatch(/name="twitter:card"/);
      expect(html).toMatch(/rel="canonical"/);

      // hreflang tells Google the ro and en pages are translations of each
      // other rather than duplicates competing for the same result.
      expect(html).toMatch(/hrefLang="ro"/i);
      expect(html).toMatch(/hrefLang="en"/i);
      expect(html).toMatch(/hrefLang="x-default"/i);

      // schema.org Event is what makes it eligible for Google's event results.
      // [\s\S] rather than the /s (dotAll) flag: this project's TypeScript
      // target predates it, and the two are equivalent here.
      const jsonLd = html.match(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/g
      );
      expect(jsonLd, "expected JSON-LD blocks").toBeTruthy();

      const parsed = jsonLd!.map((block) =>
        JSON.parse(block.replace(/<script type="application\/ld\+json">/, "").replace(/<\/script>/, ""))
      );
      const eventSchema = parsed.find((s) => s["@type"] === "Event");
      expect(eventSchema, "an Event schema must be present").toBeTruthy();
      expect(eventSchema.offers.price).toBe(0);
      expect(eventSchema.offers.availability).toContain("InStock");
      expect(eventSchema.location.address.addressCountry).toBe("RO");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a sold-out event is marked SoldOut in structured data", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });

    try {
      const { seedRegistrationFor } = await import("./helpers");
      await seedRegistrationFor(event.id);

      const html = await (await request.get(`/ro/events/${event.slug}`)).text();
      expect(html).toContain("SoldOut");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("share images render for events and posts", async ({ request }) => {
    const event = await seedEvent({ price: 0 });

    try {
      for (const path of [
        `/api/og/event/${event.slug}`,
        `/api/og/event/${event.slug}/story`,
        "/api/og/default",
      ]) {
        const res = await request.get(path);
        expect(res.status(), `${path} should render`).toBe(200);
        expect(res.headers()["content-type"]).toContain("image/png");
        // A blank or failed render would be far smaller than this.
        expect((await res.body()).length).toBeGreaterThan(5000);
      }
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("share images do not leak unpublished events", async ({ request }) => {
    const event = await seedEvent({ published: false, title_ro: "Ciornă secretă" });

    try {
      const res = await request.get(`/api/og/event/${event.slug}`);
      // Still an image (a broken preview looks worse than a plain one), but it
      // must not contain the draft's details. The route uses an anonymous
      // client, so Row Level Security hides the row entirely.
      expect(res.status()).toBe(200);
      const size = (await res.body()).length;
      const branded = (await (await request.get("/api/og/default")).body()).length;
      // The fallback card is what gets rendered, so the two are comparable.
      expect(Math.abs(size - branded)).toBeLessThan(30000);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // Every og:image points at /api/og/*. A blanket "Disallow: /api/" also blocked
  // those, and Facebook, WhatsApp and the X card fetcher all honour robots.txt —
  // so shared links would still have expanded to a card with no image, quietly
  // undoing the whole point of generating them.
  test("robots.txt does not block the share images", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Allow: /api/og/");

    const html = await (await request.get("/ro")).text();
    const ogImage = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(ogImage, "the home page should declare an og:image").toContain("/api/og/");
  });

  // The document language is what screen readers pick a pronunciation from and
  // what search engines read. It used to be hardcoded to "ro" in the server
  // markup and corrected in the browser afterwards, so every English page
  // announced itself as Romanian to exactly the clients that never run the fix.
  test("declares the right document language per locale", async ({ request }) => {
    for (const [locale, expected] of [["ro", "ro"], ["en", "en"]]) {
      const html = await (await request.get(`/${locale}`)).text();
      expect(html, `/${locale} should declare lang="${expected}"`).toContain(
        `<html lang="${expected}"`
      );
    }
  });

  // A hardcoded "+03:00" is right for Romania in summer and an hour wrong all
  // winter, which would publish every winter event to Google an hour early.
  test("event structured data uses a correctly-offset start time", async ({ request }) => {
    const event = await seedEvent({ price: 0, date: "2026-12-15", time: "18:00" });

    try {
      const html = await (await request.get(`/ro/events/${event.slug}`)).text();
      const schema = html.match(/"startDate":"([^"]+)"/)?.[1];

      // 18:00 in Bucharest in December (EET, UTC+2) is 16:00 UTC.
      expect(schema).toBe("2026-12-15T16:00:00.000Z");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // Missing content must answer 404, not 200.
  //
  // A page that returns "200 OK" while displaying "not found" is a soft 404:
  // search engines treat the 200 as proof it is a real page and may index it,
  // so every deleted event accumulates as a thin duplicate result.
  //
  // The cause was subtle and worth guarding against. The analytics provider
  // calls useSearchParams(), which forced a Suspense boundary around the entire
  // app in the root layout. Next then flushed the document shell immediately
  // and streamed the rest — committing the status as 200 long before any page
  // could call notFound().
  test("missing events and articles return a real 404", async ({ request }) => {
    for (const path of [
      "/ro/events/does-not-exist",
      "/en/events/does-not-exist",
      "/ro/blog/does-not-exist",
      "/en/blog/does-not-exist",
    ]) {
      const res = await request.get(path);
      expect(res.status(), `${path} must be a hard 404, not a soft one`).toBe(404);
    }
  });

  test("a real page still returns 200", async ({ request }) => {
    const event = await seedEvent({ price: 0 });
    try {
      expect((await request.get(`/ro/events/${event.slug}`)).status()).toBe(200);
      expect((await request.get("/ro")).status()).toBe(200);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the 404 page is branded and offers a way back", async ({ page }) => {
    await page.goto("/ro/events/does-not-exist");
    // Previously this was Next's unstyled English fallback — a dead end for
    // someone following a stale link from an Instagram story.
    await expect(page.getByRole("heading", { name: /Pagina nu a fost găsită/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Vezi evenimentele/ })).toBeVisible();
  });

  test("sitemap lists published events and robots points at it", async ({ request }) => {
    const event = await seedEvent({ price: 0 });

    try {
      const sitemap = await (await request.get("/sitemap.xml")).text();
      expect(sitemap).toContain(`/events/${event.slug}`);
      expect(sitemap).toContain("hreflang");
      // The About page was missing from this list, despite being the page most
      // likely to convert a visitor who has never heard of her.
      expect(sitemap).toContain("/about");

      const robots = await (await request.get("/robots.txt")).text();
      expect(robots).toContain("Sitemap:");
      expect(robots).toContain("Disallow: /admin");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a draft event is not advertised in the sitemap", async ({ request }) => {
    const event = await seedEvent({ published: false });

    try {
      const sitemap = await (await request.get("/sitemap.xml")).text();
      expect(sitemap).not.toContain(event.slug);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
