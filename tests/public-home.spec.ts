import { test, expect } from "@playwright/test";
import { seedEvent, deleteEventBySlug } from "./helpers";

test.describe("home page (RO)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ro");
  });

  test("skip link is first in tab order and targets main content", async ({ page }) => {
    const skip = page.getByRole("link", { name: "Sari la conținut" });
    await expect(skip).toBeVisible();
    await skip.focus();
    await skip.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("renders the hero and the sections in booking order", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Îți ghidez călătoria către echilibru" })
    ).toBeVisible();
    await expect(page.getByText("Yoga pentru corp, minte și suflet")).toBeVisible();

    // Both hero calls to action.
    await expect(page.getByRole("link", { name: "Explorează" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Despre mine" }).first()).toBeVisible();

    // Events come before the blog now. They are the only thing on this site
    // that earns money, and a link shared to an Instagram story is almost
    // always about a specific event — yet they used to sit third, below the
    // blog.
    const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
    const eventsAt = headings.findIndex((h) => /eveniment/i.test(h));
    const blogAt = headings.findIndex((h) => /blog/i.test(h));
    expect(eventsAt, "an events heading should exist").toBeGreaterThanOrEqual(0);
    if (blogAt >= 0) {
      expect(eventsAt, "events must appear before the blog").toBeLessThan(blogAt);
    }
  });

  // The old page displayed "10+ years · 500+ classes · 1000+ students". Nobody
  // supplied those numbers; the code generator invented them, and the previous
  // test asserted them as though they were true. Made-up credentials on a page
  // whose whole job is to establish trust are worse than an empty space, so
  // they are gone — and this test stops them coming back.
  test("states no invented credentials", async ({ page }) => {
    for (const invented of ["10+", "500+", "1000+"]) {
      await expect(page.getByText(invented, { exact: true })).toHaveCount(0);
    }
  });

  test("marks content the instructor has not supplied yet", async ({ page }) => {
    // Placeholders are deliberately visible rather than filled with plausible
    // filler, so a gap is obvious and gets closed. See docs/CONTENT-NEEDED.md.
    const placeholders = page.locator('[data-placeholder="true"]');
    expect(await placeholders.count()).toBeGreaterThan(0);
  });

  test("hero CTA links to events page", async ({ page }) => {
    await page.getByRole("link", { name: "Explorează" }).click();
    await expect(page).toHaveURL(/\/ro\/events/);
  });

  // The horizontal nav is `hidden md:flex`; below that breakpoint these links
  // live behind the hamburger, which the mobile menu test covers instead.
  test("desktop nav links navigate to every section", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 768, "desktop-only layout");
    const links: Array<[string, RegExp]> = [
      ["Acasă", /\/ro$/],
      ["Blog", /\/ro\/blog/],
      ["Evenimente", /\/ro\/events/],
      ["Testimoniale", /\/ro\/testimonials/],
      ["Contact", /\/ro\/contact/],
    ];
    for (const [name, url] of links) {
      await page.getByRole("link", { name, exact: true }).first().click();
      await expect(page).toHaveURL(url);
      await page.goto("/ro");
    }
  });

  test("blog and events sections link to their full pages", async ({ page }) => {
    const postsButton = page.getByRole("link", { name: /Vezi toate articolele/ });
    if (await postsButton.isVisible()) {
      await postsButton.click();
      await expect(page).toHaveURL(/\/ro\/blog/);
      await page.goto("/ro");
    }
    const eventsButton = page.getByRole("link", { name: /Vezi toate evenimentele/ });
    if (await eventsButton.isVisible()) {
      await eventsButton.click();
      await expect(page).toHaveURL(/\/ro\/events/);
    }
  });

  test("footer renders with copyright", async ({ page }) => {
    await expect(page.getByText("Toate drepturile rezervate.")).toBeVisible();
  });
});

test.describe("home page language switching", () => {
  // Below `md` the switcher sits inside the mobile menu, so it has to be opened
  // first. Running this on both viewports is worth the extra few lines: an
  // Instagram-driven audience means the phone path is the one that matters, and
  // it was previously untested.
  const openSwitcher = async (page: import("@playwright/test").Page, label: string) => {
    // Branch on viewport width, matching Tailwind's `md` breakpoint, rather
    // than probing whether the desktop switcher happens to be visible.
    //
    // `isVisible()` is an instantaneous check with no auto-waiting, so on a
    // slow first paint it returned false on a desktop viewport, the helper took
    // the mobile path, and then spent a minute trying to click a hamburger that
    // is `md:hidden`. Width is deterministic and is what the CSS keys off.
    const width = page.viewportSize()?.width ?? 1280;

    if (width >= 768) {
      await page.getByRole("banner").getByRole("button", { name: label }).click();
      return;
    }

    // Narrow viewport: the switcher lives inside the collapsed menu.
    //
    // The hamburger is located by aria-controls rather than by its label,
    // because the label is translated — "Deschide meniul" on the Romanian page,
    // "Open menu" on the English one — so a hard-coded name works on the way out
    // and hangs on the way back.
    //
    // The switcher is scoped to #mobile-menu because the header still holds a
    // second, display:none copy; an unscoped locator matches that one first and
    // then times out clicking something invisible.
    await page.locator('button[aria-controls="mobile-menu"]').click();
    await page.locator("#mobile-menu").getByRole("button", { name: label }).click();
  };

  test("switching to English updates lang and content, and back", async ({ page }) => {
    await page.goto("/ro");

    await openSwitcher(page, "Switch to English");
    // Longer than the default 10s on purpose. The switcher calls router.replace
    // inside a React transition, so the URL does not change until the server
    // has sent the new page — noticeably slower than an ordinary link, and slow
    // enough to flake under load.
    await expect(page).toHaveURL(/\/en$/, { timeout: 25_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { level: 1, name: "I guide your journey to balance" })
    ).toBeVisible();
    // (No nav-link assertion here: below `md` the links are display:none, and
    // getByRole deliberately ignores anything hidden from the accessibility
    // tree, so it cannot see them at all. The heading and the lang attribute
    // above already prove the locale switched.)

    await openSwitcher(page, "Treci la română");
    // Same allowance as the outbound switch above — the return trip is the one
    // that actually kept timing out.
    await expect(page).toHaveURL(/\/ro$/, { timeout: 25_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(
      page.getByRole("heading", { level: 1, name: "Îți ghidez călătoria către echilibru" })
    ).toBeVisible();
  });
});

/**
 * The floating "book now" bar, which only exists below `lg`.
 *
 * Three conditions gate it: an event with seats left, the hero's own call to
 * action scrolled out of view, and the page standing still. The last one is
 * what most of this covers — the bar sits over the bottom of the screen, which
 * is exactly where the content someone is scrolling towards keeps appearing.
 */
test.describe("home page sticky call to action", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const bar = (page: import("@playwright/test").Page) => page.locator("[data-visible]");

  test("stays hidden until the hero CTA is scrolled past, and while scrolling", async ({
    page,
  }) => {
    // Seeded so the bar has something to offer. It decides for itself by
    // querying Supabase from the browser, so it does not matter that the home
    // page itself is served from a 300-second cache.
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto("/ro");

      // Present in the DOM but hidden: the hero's own "Explorează" button is
      // still on screen, so a second copy floating over it is just clutter.
      await expect(bar(page)).toHaveAttribute("data-visible", "false");

      // Scrolled past the hero and left alone, it appears.
      await page.evaluate(() => window.scrollTo(0, 1600));
      await expect(bar(page)).toHaveAttribute("data-visible", "true", { timeout: 5_000 });
      await expect(page.getByRole("button", { name: "Înscrie-te acum" })).toBeVisible();

      // Now the part that matters: it gets out of the way again the moment the
      // page starts moving.
      //
      // Sampled every frame from inside the page while genuinely scrolling,
      // rather than scrolling and then asserting from the test after a sleep.
      // Wall-clock timing from outside is a coin toss — the first version of
      // this waited 120ms and read `true`, because by the time Playwright
      // actually queried the DOM the scroll had finished and the idle timer had
      // fired. Scrolling every frame keeps the timer permanently reset, so
      // "hidden throughout" is a fact about the whole window, not a snapshot.
      //
      // It bounces up and down a few pixels instead of scrolling one way so the
      // page cannot run out of content and stop firing scroll events.
      const samples = await page.evaluate(async () => {
        const el = document.querySelector("[data-visible]")!;
        const seen: { at: number; value: string | null }[] = [];
        const start = performance.now();
        let step = 0;
        while (performance.now() - start < 900) {
          window.scrollBy(0, step++ % 2 ? 6 : -6);
          await new Promise((resolve) => requestAnimationFrame(resolve));
          seen.push({ at: performance.now() - start, value: el.getAttribute("data-visible") });
        }
        return seen;
      });

      // Timestamped rather than counted, because frame rate varies a lot
      // between the projects — the emulated phone manages about a third of the
      // frames desktop Chromium does in the same window, so "skip the first
      // five frames" means two different durations.
      //
      // The opening frames are allowed to still read "true": the scroll handler
      // sets state and React needs a render to get that into the DOM. What must
      // not happen is the bar sitting there through a sustained scroll.
      const settled = samples.filter((s) => s.at > 250);
      expect(settled.length, "expected several frames of scrolling").toBeGreaterThan(3);
      expect(
        [...new Set(settled.map((s) => s.value))],
        "the bar must stay hidden for as long as the page keeps moving"
      ).toEqual(["false"]);

      // Still is again, so it comes back.
      await expect(bar(page)).toHaveAttribute("data-visible", "true", { timeout: 5_000 });

      // Back at the top the hero CTA is on screen again, so it goes away.
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(bar(page)).toHaveAttribute("data-visible", "false");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // A control that slides in and out must not be reachable while it is out of
  // frame. `inert` is what keeps it out of the tab order and the accessibility
  // tree; without it a keyboard user tabs into an invisible button and a screen
  // reader announces one that is not there.
  test("is inert while hidden and reachable once shown", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto("/ro");
      await expect(bar(page)).toHaveAttribute("data-visible", "false");
      expect(await bar(page).evaluate((el) => el.hasAttribute("inert"))).toBe(true);

      await page.evaluate(() => window.scrollTo({ top: 1600 }));
      await expect(bar(page)).toHaveAttribute("data-visible", "true", { timeout: 5_000 });
      expect(await bar(page).evaluate((el) => el.hasAttribute("inert"))).toBe(false);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("home page mobile menu", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("mobile menu opens, navigates and closes with correct aria state", async ({ page }) => {
    await page.goto("/ro");

    const toggle = page.getByRole("button", { name: "Deschide meniul" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#mobile-menu")).toBeHidden();

    await toggle.click();
    await expect(page.getByRole("button", { name: "Închide meniul" })).toBeVisible();
    await expect(page.locator("#mobile-menu")).toBeVisible();
    await expect(page.locator("#mobile-menu")).toContainText("Evenimente");

    await page.locator("#mobile-menu").getByRole("link", { name: "Blog" }).click();
    await expect(page).toHaveURL(/\/ro\/blog/);
  });
});
