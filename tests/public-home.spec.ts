import { test, expect } from "@playwright/test";
import { seedEvent, deleteEventBySlug, siteContentValue, setSiteContent } from "./helpers";

/**
 * Unsupplied content must render a visible placeholder rather than nothing.
 *
 * Placeholders are deliberately conspicuous rather than filled with plausible
 * copy, so a gap is obvious and gets closed — see docs/CONTENT-NEEDED.md.
 *
 * This used to assert that the home page had placeholders on it, which only
 * worked while the local database was empty. Once seed.sql started filling the
 * content in there were none, and the test failed for the best possible reason.
 * It now empties the two fields itself and puts them back, so it tests the rule
 * instead of the seed.
 *
 * Serial and single-project for the same reason the footer tests are: these are
 * global rows, and chromium and mobile running the file at once would each read
 * the other's writes.
 */
test.describe("content the instructor has not supplied yet", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => Boolean(isMobile), "mutates globally shared content");

  const KEYS = ["home.hero_image", "home.intro"] as const;
  let original: string[] = [];

  test.beforeAll(async () => {
    original = await Promise.all(KEYS.map(siteContentValue));
  });

  test.afterAll(async () => {
    await Promise.all(KEYS.map((key, i) => setSiteContent(key, original[i])));
  });

  test("is marked with a visible placeholder", async ({ page }) => {
    await Promise.all(KEYS.map((key) => setSiteContent(key, "")));

    // Re-navigates on every poll rather than asserting after a single load.
    //
    // This is belt and braces, not a workaround for a known cache: `next build`
    // reports every route here as server-rendered on demand, so a write made a
    // moment ago is visible on the very next request. The home page does export
    // `revalidate = 300`, which reads like it would make this test impossible —
    // it does not, because nothing in this app is statically rendered for that
    // setting to apply to. Polling costs one extra navigation in the worst case
    // and keeps the test honest if that ever changes.
    await expect
      .poll(
        async () => {
          await page.goto("/ro");
          return page.locator('[data-placeholder="true"]').count();
        },
        { message: "placeholders on a page with two empty fields", timeout: 20_000 }
      )
      .toBeGreaterThan(0);
  });
});

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

  // The button reports where you are, not where you would go. Both readings of
  // a single-language toggle are plausible to a visitor, so the visible text is
  // the current language and the accessible name is the action — which is also
  // what a screen reader announces.
  test("shows the current language and its flag", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 768, "the switcher is inside the mobile menu below md");

    await page.goto("/ro");
    const ro = page.getByRole("banner").getByRole("button", { name: "Switch to English" });
    await expect(ro).toHaveText("RO");
    await expect(ro.locator("img")).toHaveAttribute("src", "/flags/RO.svg");

    await page.goto("/en");
    const en = page.getByRole("banner").getByRole("button", { name: "Treci la română" });
    await expect(en).toHaveText("EN");
    await expect(en.locator("img")).toHaveAttribute("src", "/flags/GB.svg");
  });

  test("switching to English updates lang and content, and back", async ({ page }) => {
    await page.goto("/ro");

    await openSwitcher(page, "Switch to English");
    // Longer than the default 10s on purpose. The switcher calls router.replace
    // inside a React transition, so the URL does not change until the server
    // has sent the new page — noticeably slower than an ordinary link, and slow
    // enough to flake under load.
    await expect(page).toHaveURL(/\/en$/, { timeout: 25_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The hero call to action, not the headline. The headline comes from
    // `site_content`, which the instructor edits — asserting her copy here made
    // this test fail the moment the seed gave her a different English hero
    // title than the fallback in messages/en.json. "Explore" comes from the
    // message bundle, so it proves the locale switched without depending on
    // anything editable.
    await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    // (No nav-link assertion here: below `md` the links are display:none, and
    // getByRole deliberately ignores anything hidden from the accessibility
    // tree, so it cannot see them at all. The button and the lang attribute
    // above already prove the locale switched.)

    await openSwitcher(page, "Treci la română");
    // Same allowance as the outbound switch above — the return trip is the one
    // that actually kept timing out.
    await expect(page).toHaveURL(/\/ro$/, { timeout: 25_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "ro");
    await expect(page.getByRole("link", { name: "Explorează", exact: true })).toBeVisible();
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
// Skipped, not deleted: the bar is switched off in app/[locale]/page.tsx and
// these go green again the moment that line is uncommented.
test.describe.skip("home page sticky call to action", () => {
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

/**
 * The navigation drawer behind the hamburger.
 *
 * It is a scroll container rather than an animated panel — see the long comment
 * above `.nav-drawer` in app/globals.css — so these reach for the scroller and
 * the panel by class name. That coupling is the point: the swipe *is* the
 * scroll, and a test that only pressed buttons would not notice if the snap
 * stops stopped working.
 */
test.describe("home page navigation drawer", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const drawer = (page: import("@playwright/test").Page) => page.locator("#mobile-menu");
  const trigger = (page: import("@playwright/test").Page) =>
    page.locator('button[aria-controls="mobile-menu"]');

  /** How far the panel's right edge still is from the right of the screen. */
  const gapFromEdge = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const sheet = document.querySelector(".nav-drawer-sheet");
      if (!sheet) return -1;
      return Math.round(window.innerWidth - sheet.getBoundingClientRect().right);
    });

  // The panel slides, so "visible" arrives well before "arrived". Every test
  // here waits for it to be flush with the edge before touching anything.
  const openDrawer = async (page: import("@playwright/test").Page) => {
    // Proof that the client is running, before anything is pressed.
    //
    // WebKit hydrates noticeably later than Chromium, and a click that lands
    // first is swallowed without a trace: the hamburger is a bare <button> in
    // no form, so there is no native behaviour to fall back on, and the test
    // simply sees a menu that never opened. Caught as a one-in-a-run flake on
    // the mobile project, which is the engine most of this audience uses.
    //
    // <next-route-announcer> is what proves it. Next's client runtime appends
    // it on hydration and it appears nowhere in the server HTML, so it cannot
    // be there until the JavaScript has run.
    await page.locator("next-route-announcer").waitFor({ state: "attached" });
    await trigger(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect.poll(() => gapFromEdge(page)).toBe(0);
  };

  test("opens, marks the page you are on, navigates and closes behind you", async ({
    page,
  }) => {
    await page.goto("/ro");

    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect(drawer(page)).toBeHidden();

    await openDrawer(page);
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    // Scoped to the drawer: the hamburger is still a toggle, so while the menu
    // is open it carries this name too, and an unscoped locator matches both.
    await expect(drawer(page).getByRole("button", { name: "Închide meniul" })).toBeVisible();
    await expect(drawer(page)).toContainText("Evenimente");

    // The current page is announced, not merely tinted. This assertion is the
    // one that would have caught the original bug: the header compared a
    // pathname that next-intl had already stripped the locale from against one
    // that still had it, so nothing was ever marked on either language.
    await expect(drawer(page).locator('a[aria-current="page"]')).toHaveText("Acasă");

    await drawer(page).getByRole("link", { name: "Blog" }).click();
    await expect(page).toHaveURL(/\/ro\/blog/);
    await expect(drawer(page)).toBeHidden();
  });

  test("following a link does not drag focus back onto the menu button", async ({
    page,
  }) => {
    await page.goto("/ro");
    await openDrawer(page);

    await drawer(page).getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/ro\/contact/);
    await expect(drawer(page)).toBeHidden();

    // Closing by any other route hands focus back to the hamburger, which is
    // right for a menu you dismissed and wrong for one you navigated out of —
    // it would put a keyboard user on the menu button of the page they have
    // just left. The same distinction takes `inert` off the page immediately
    // rather than after the slide-out, because <next-route-announcer> is one
    // of the body children this marks inert, and an announcement made while
    // inert is not made.
    await expect(trigger(page)).not.toBeFocused();
    const stillInert = await page.evaluate(() =>
      [...document.body.children].filter((el) => el.hasAttribute("inert")).length
    );
    expect(stillInert, "the page behind must be live again after a navigation").toBe(0);
  });

  test("Escape closes it and hands the hamburger its focus back", async ({ page }) => {
    await page.goto("/ro");
    await openDrawer(page);

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    // Without this the next Tab starts from the top of the document, which for
    // a keyboard user reads as the menu having thrown them out of the page.
    await expect(trigger(page)).toBeFocused();
  });

  test("a tap on the dimmed page closes it", async ({ page }) => {
    await page.goto("/ro");
    await openDrawer(page);

    // Well inside the strip of page left showing beside the panel. Clicked with
    // the mouse rather than `touchscreen.tap` so this also runs on the desktop
    // project, which has no touch.
    await page.mouse.click(20, 320);
    await expect(drawer(page)).toBeHidden();
  });

  test("everything behind it is inert while it is open", async ({ page }) => {
    await page.goto("/ro");

    const inertSiblings = () =>
      page.evaluate(() => {
        const open = document.getElementById("mobile-menu");
        const others = [...document.body.children].filter((el) => el !== open);
        return {
          total: others.length,
          inert: others.filter((el) => el.hasAttribute("inert")).length,
        };
      });

    expect(await inertSiblings()).toMatchObject({ inert: 0 });

    await openDrawer(page);
    // Not a count: what matters is that nothing was missed. `inert` is what
    // keeps a keyboard and a screen reader out of the page behind the dim, and
    // it is also the whole focus trap — there is no key handling to go with it.
    const open = await inertSiblings();
    expect(open.total).toBeGreaterThan(0);
    expect(open.inert).toBe(open.total);

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    expect(await inertSiblings()).toMatchObject({ inert: 0 });
  });

  test("a drag that stops part way snaps shut instead of resting there", async ({
    page,
  }) => {
    await page.goto("/ro");
    await openDrawer(page);

    // Released a third of the way back towards closed. `scroll-snap-type: x
    // mandatory` is what promises the drawer can never be abandoned half open,
    // and the IntersectionObserver that watches the panel is what turns landing
    // on the closed stop into a closed drawer.
    await page.evaluate(() => {
      const scroller = document.querySelector(".nav-drawer-scroller")!;
      const travel = scroller.scrollWidth - scroller.clientWidth;
      scroller.scrollTo({ left: travel * 0.3, behavior: "instant" });
    });

    await expect(drawer(page)).toBeHidden();
  });
});
