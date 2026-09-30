import { test, expect, type Page } from "@playwright/test";
import { deleteEventBySlug, deletePostBySlug, seedEvent, seedPost } from "./helpers";

/**
 * Moving between pages (phase 9 of docs/OVERHAUL.md): the veil over a slow
 * navigation, the page transitions, and the one thing none of it may cost,
 * a missing page's 404.
 *
 * Both projects run it: `chromium` on a desktop, `mobile` on the iPhone's
 * engine, where most visitors are.
 */

/** Client is running: the router announces pages once it has hydrated. */
const hydrated = (page: Page) => page.locator("next-route-announcer").waitFor({ state: "attached" });

/** A link that is on the page at every width: the footer's own index. */
const footerLink = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Secțiunile site-ului" }).getByRole("link", { name, exact: true });

/** Holds every request for a page's data for `ms`, so a navigation is slow. */
async function slowNavigations(page: Page, ms: number) {
  await page.route(
    (url) => url.searchParams.has("_rsc"),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await route.continue().catch(() => {});
    }
  );
}

type Seen = { pseudo: string; name: string; duration: number };

/**
 * Records every view-transition animation the page runs from now on.
 *
 * Read the moment each transition is ready (React calls
 * document.startViewTransition, wrapped here), when all of its animations
 * exist, and on every frame besides. The frames alone are not enough: on CI's
 * Linux WebKit a busy page can draw three in 0.7 s, fewer than one per
 * transition.
 */
async function recordTransitions(page: Page) {
  await page.evaluate(() => {
    const seen: { pseudo: string; name: string; duration: number }[] = [];
    (window as unknown as { __transitions: typeof seen }).__transitions = seen;
    const note = () => {
      for (const animation of document.getAnimations()) {
        const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement ?? "";
        if (!pseudo.startsWith("::view-transition")) continue;
        const name = (animation as CSSAnimation).animationName ?? "";
        const duration = Number(animation.effect?.getComputedTiming().duration ?? 0);
        if (!seen.some((s) => s.pseudo === pseudo && s.name === name)) seen.push({ pseudo, name, duration });
      }
    };
    const start = document.startViewTransition?.bind(document);
    if (start) {
      document.startViewTransition = ((update: Parameters<typeof start>[0]) => {
        const transition = start(update);
        transition.ready.then(note, () => {});
        return transition;
      }) as typeof document.startViewTransition;
    }
    const watch = () => {
      note();
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

const transitions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __transitions: Seen[] }).__transitions ?? []);

test.describe("a slow page is covered, not left looking stuck", () => {
  /**
   * THE RULE
   *
   * Every page is built on the server when it is asked for, so a tap waits for
   * it. From the moment a link is followed a clear layer covers the page;
   * after 150 ms it washes the page pale and takes taps, a little later a
   * turning lotus appears, and it is gone the moment the new page shows.
   *
   * The wait is checked at the instant the veil is switched on (a
   * MutationObserver runs before anything is drawn): still hidden, with 150 ms
   * to go. Timing it frame by frame was not reliable under a full run, where a
   * busy page can skip the frames the timing needs.
   */
  test("the veil comes after a moment, takes the taps, and leaves with the new page", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await slowNavigations(page, 1500);
    await page.evaluate(() => {
      const veil = document.querySelector(".nav-veil")!;
      const marks: { visibility?: string; delay?: string } = {};
      (window as unknown as { __veil: typeof marks }).__veil = marks;
      new MutationObserver(() => {
        if (!veil.hasAttribute("data-pending") || marks.visibility !== undefined) return;
        const style = getComputedStyle(veil);
        marks.visibility = style.visibility;
        marks.delay = style.animationDelay;
      }).observe(veil, { attributes: true, attributeFilter: ["data-pending"] });
    });

    await footerLink(page, "Evenimente").click();

    const status = page.getByRole("status").filter({ hasText: "Se încarcă pagina…" });
    await expect(status).toBeAttached();
    const marks = await page.evaluate(() => (window as unknown as { __veil: { visibility: string; delay: string } }).__veil);
    expect(marks, "switched on, the veil still waits before it shows").toEqual({ visibility: "hidden", delay: "0.15s" });
    await expect(page.locator(".nav-veil")).toBeVisible();

    // Taps land on the veil, not on the page under it.
    const hit = await page.evaluate(() => {
      const element = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return Boolean(element?.closest(".nav-veil"));
    });
    expect(hit, "a tap in the middle of the screen reaches the veil").toBe(true);
    // The lotus turns, unless the visitor asked for less motion.
    await expect(page.locator(".nav-veil .lotus")).toBeVisible();

    await expect(page).toHaveURL(/\/ro\/events$/);
    await expect(page.getByRole("heading", { level: 1, name: "Evenimente" })).toBeVisible();
    await expect(page.locator(".nav-veil")).toBeHidden();
    await expect(page.locator(".nav-veil")).not.toHaveAttribute("data-pending");
  });

  /** The page already showing, or another site in a new tab: nothing is on its way here. */
  test("a link that does not change this page leaves it alone", async ({ page, context }) => {
    // The consumer-protection site the footer links to, answered locally.
    await context.route(/reclamatiisal\.anpc\.ro/, (route) => route.fulfill({ body: "ANPC" }));
    await page.goto("/ro/contact");
    await hydrated(page);

    await footerLink(page, "Contact").click();
    await page.waitForTimeout(300);
    await expect(page.locator(".nav-veil")).not.toHaveAttribute("data-pending");

    const popup = context.waitForEvent("page");
    await page.getByRole("contentinfo").getByRole("link", { name: /ANPC/ }).click();
    await (await popup).close();
    await expect(page.locator(".nav-veil")).not.toHaveAttribute("data-pending");
  });
});

test.describe("pages breathe from one to the next", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ro");
    const supported = await page.evaluate(() => "startViewTransition" in document);
    test.skip(!supported, "no View Transitions API here: the page simply changes, as before");
  });

  /**
   * The old page fades out and the new one fades in rising, the event's
   * photograph glides from its card to the top of its page, and the top bar
   * does not move at all.
   */
  test("opening an event glides its photograph and breathes the page in, under a still top bar", async ({ page }) => {
    const event = await seedEvent({ image_url: "/mock/event-2.webp" });
    try {
      await page.goto("/ro/events");
      await hydrated(page);
      await expect(page.locator("header nav").first()).toHaveCSS("view-transition-name", "site-header");
      await recordTransitions(page);

      await page.locator(`main a[href$="/events/${event.slug}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/ro/events/${event.slug}$`));

      await expect
        .poll(async () => (await transitions(page)).map((t) => `${t.pseudo} ${t.name}`).join("\n"))
        .toContain(`::view-transition-group(event-photo-${event.slug})`);
      const seen = await transitions(page);
      expect(seen.some((t) => t.name === "page-out" && t.duration > 0), "the old page fades out").toBe(true);
      expect(seen.some((t) => t.name === "page-in" && t.duration > 0), "the new page fades in").toBe(true);
      // Only the screen and what floats over it are pictured. A named page
      // is pictured whole, several screens tall, which cost WebKit seconds a
      // navigation (components/layout/view-transitions.tsx).
      const pictured = [...new Set(seen.map((t) => t.pseudo.replace(/^.*\((.+)\)$/, "$1")))];
      expect(
        pictured.filter((name) => !/^(root|site-header|nav-veil|(event|post)-photo-.+)$/.test(name) && name !== "::view-transition"),
        `pictured: ${pictured.join(", ")}`
      ).toEqual([]);
      expect(
        seen.filter((t) => t.pseudo.includes("(site-header)")),
        "the top bar is not animated"
      ).toEqual([]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a post's cover glides from its card into the article", async ({ page }) => {
    const post = await seedPost({ cover_url: "/mock/spare.webp" });
    try {
      await page.goto("/ro/blog");
      await hydrated(page);
      await recordTransitions(page);
      await page.locator(`main a[href$="/blog/${post.slug}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/ro/blog/${post.slug}$`));
      await expect
        .poll(async () => (await transitions(page)).map((t) => t.pseudo).join("\n"))
        .toContain(`::view-transition-group(post-photo-${post.slug})`);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  /**
   * Back and forward: the browser has already shown the other page (on an
   * iPhone, while the finger swipes), so a fade after it would replay the
   * page being left. They change in one frame.
   */
  test("back and forward change the page without a transition", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await footerLink(page, "Evenimente").click();
    await expect(page).toHaveURL(/\/ro\/events$/);
    await page.waitForTimeout(800);

    await recordTransitions(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/ro$/);
    await expect(page.locator("html")).toHaveAttribute("data-history-nav", "");
    await page.waitForTimeout(600);
    const moving = (await transitions(page)).filter((t) => t.duration > 0);
    expect(moving, "nothing animates on the way back").toEqual([]);
  });
});

test.describe("less motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the new page replaces the old one at once, with nothing moving", async ({ page }) => {
    await page.goto("/ro/events");
    const supported = await page.evaluate(() => "startViewTransition" in document);
    test.skip(!supported, "no View Transitions API here");
    await hydrated(page);
    await recordTransitions(page);
    await page.locator("main a[href*='/events/']").filter({ has: page.locator("img") }).first().click();
    await expect(page).toHaveURL(/\/ro\/events\/.+/);
    await page.waitForTimeout(800);
    const moving = (await transitions(page)).filter((t) => t.duration > 0);
    expect(moving).toEqual([]);
  });

  test("the lotus stops turning but still says it is working", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await slowNavigations(page, 1500);
    await footerLink(page, "Evenimente").click();
    const lotus = page.locator(".nav-veil .lotus");
    await expect(lotus).toBeVisible();
    await expect(lotus).toHaveCSS("animation-name", "none");
    await expect(page.locator(".nav-veil .lotus-petal").first()).toHaveCSS("animation-name", "lotus-wave");
    await expect(page).toHaveURL(/\/ro\/events$/);
  });
});

/**
 * None of the above may cost a missing page its 404.
 *
 * The veil and the transitions are drawn on the client, and every page
 * renders whole on the server before anything is sent. A loading screen
 * (`loading.tsx`) or a Suspense boundary around a page would send the page's
 * start before it could call notFound(), and these would answer 200 with a
 * "not found" body: CLAUDE.md, "A Suspense boundary high in the tree".
 */
test.describe("missing pages still answer 404", () => {
  for (const path of [
    "/ro/events/nu-exista",
    "/en/blog/does-not-exist",
    "/ro/events?page=999",
    "/ro/blog?page=999",
    "/ro/testimonials?page=999",
    "/ro/pagina-care-nu-exista",
  ]) {
    test(path, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(404);
    });
  }
});
