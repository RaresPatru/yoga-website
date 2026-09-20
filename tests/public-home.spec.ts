import { test, expect } from "@playwright/test";
import {
  seedEvent,
  deleteEventBySlug,
  seedRegistrationFor,
  siteContentValue,
  setSiteContent,
} from "./helpers";

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

  // The horizontal nav is `hidden lg:flex`; below that breakpoint these links
  // live behind the hamburger, which the drawer tests cover instead. It was
  // `md` until the Romanian labels were measured at 840px and found not to fit
  // in 768.
  test("desktop nav links navigate to every section", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 1024, "desktop-only layout");
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
  // Below `lg` the switcher sits inside the drawer, so it has to be opened
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

    /* 1024, matching `lg`. This read 768 and only kept working by luck — both
       test projects sit clear of the gap, at 1280 and 390 — but anything run
       between 768 and 1024 would have taken the desktop path and hunted for a
       switcher that is inside the drawer at that width. */
    if (width >= 1024) {
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
  test("shows both languages, current one first, with its flag", async ({
    page,
    viewport,
  }) => {
    /* 1024, not 768. The switcher moved into the drawer at `lg` when the link
       row did — the Romanian labels need 840px to sit on one line and `md` was
       below that, so between 768 and 840 the bar grew a second row. */
    test.skip((viewport?.width ?? 0) < 1024, "the switcher is inside the drawer below lg");

    await page.goto("/ro");
    const ro = page.getByRole("banner").getByRole("button", { name: "Switch to English" });
    /* Both codes, the one you are reading first and beside the flag. Showing
       only the current language was unambiguous but said nothing about the
       alternative existing — a visitor who does not read Romanian had to hover
       for a tooltip to find out there was an English version. */
    await expect(ro).toHaveText("RO|EN");
    await expect(ro.locator("img")).toHaveAttribute("src", "/flags/RO.svg");

    await page.goto("/en");
    const en = page.getByRole("banner").getByRole("button", { name: "Treci la română" });
    /* The pair swaps rather than holding position, so "flag plus the code next
       to it" always names the page you are on. */
    await expect(en).toHaveText("EN|RO");
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

  /**
   * An actual finger on the actual panel.
   *
   * Every other test in this file moves the drawer with `scrollTo`, which
   * exercises the snap stops and the observer and steps straight over the two
   * things that decide whether a swipe is even received: which element the
   * touch lands on, and whether that element lets the gesture chain outwards.
   * Both were wrong — `overscroll-behavior: contain` on the panel meant a drag
   * starting anywhere on the menu itself did nothing at all, so the drawer
   * could only be swiped shut by the narrow strip of dimmed page beside it —
   * and the entire suite stayed green throughout.
   *
   * Chromium-only, because a synthetic drag needs CDP and Playwright's WebKit
   * can tap but not drag. That is the wrong engine for this audience and it is
   * still worth having: the bug was in a CSS rule, not in engine behaviour, and
   * this is the only test that would have caught it.
   */
  // `hasTouch` is scoped to this one test rather than the whole block on
  // purpose: Tailwind v4 compiles `hover:` inside `@media (hover: hover)`, so
  // turning touch on for a context switches every hover style in it off.
  test.describe(() => {
    test.use({ hasTouch: true });

    test("a swipe that starts on the panel drags the drawer with it", async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "a synthetic touch drag needs CDP");

      await page.goto("/ro");
      await openDrawer(page);

      const cdp = await page.context().newCDPSession(page);
      const swipeRight = async (fromX: number, y: number, distance: number) => {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: fromX, y }],
        });
        for (let i = 1; i <= 14; i++) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x: fromX + (distance * i) / 14, y }],
          });
          await page.waitForTimeout(16);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(400);
      };

      const scrollLeft = () =>
        page.evaluate(() =>
          Math.round(document.querySelector(".nav-drawer-scroller")!.scrollLeft)
        );

      // Open means scrolled to the far end; the swipe drags it back to zero.
      const opened = await scrollLeft();
      expect(
        opened,
        "the drawer should be at its open stop before the swipe"
      ).toBeGreaterThan(100);

      // Starting well inside the panel, not on the dimmed strip beside it.
      await swipeRight(250, 400, 220);

      // That the panel followed the finger, not that it finished closing. A
      // synthetic drag does not reliably produce the release velocity a snap
      // needs, and snapping is covered by the test above; what is asserted
      // here is the part that was broken — whether the gesture reaches the
      // scroller at all. Unfixed this reads 312 -> 312.
      expect(
        await scrollLeft(),
        "the panel must move with a swipe that starts on the panel"
      ).toBeLessThan(opened - 100);
    });
  });
});

/**
 * The navigation bar's two behaviours.
 *
 * COMPACTING closes the 12px gap that used to sit above the bar, which is what
 * severed the top of a heading scrolling past it. AUTO-HIDING takes the bar off
 * the screen entirely once the visitor is reading, and brings it back when they
 * scroll up to look for something.
 *
 * The two have separate thresholds on purpose and the tests below hold them
 * apart: 8px to compact, 80px before anything is allowed to leave.
 */
test.describe("home page navigation bar", () => {
  type Page = import("@playwright/test").Page;

  /** Client is running. See the note in the drawer block above. */
  const hydrated = (page: Page) =>
    page.locator("next-route-announcer").waitFor({ state: "attached" });

  const flags = (page: Page) =>
    page.evaluate(() => {
      const header = document.querySelector("header");
      return {
        compact: header?.hasAttribute("data-compact") ?? false,
        hidden: header?.hasAttribute("data-hidden") ?? false,
      };
    });

  const barBox = (page: Page) =>
    page.evaluate(() => {
      const bar = document.querySelector("header nav");
      if (!bar) return null;
      const rect = bar.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        width: Math.round(rect.width),
        radius: getComputedStyle(bar).borderTopLeftRadius,
      };
    });

  const scrollTo = (page: Page, y: number) =>
    page.evaluate((to) => window.scrollTo(0, to), y);

  /* The bar holds itself on screen for 1.6s the first time the page goes past
     the header. Tests that are about the ordinary hide have to get past that
     first, or they are testing the announcement instead. */
  const pastTheAnnouncement = async (page: Page) => {
    await scrollTo(page, 400);
    await expect.poll(async () => (await flags(page)).hidden).toBe(false);
    await page.waitForTimeout(1800);
  };

  test("is a floating card while the page is at rest", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);

    expect(await flags(page)).toEqual({ compact: false, hidden: false });
    const box = await barBox(page);
    expect(box?.top, "sits below the top edge rather than against it").toBe(12);
    expect(box?.radius, "keeps its rounded corners").not.toBe("0px");
  });

  test("compacts against the top edge as soon as the page moves", async ({
    page,
    viewport,
  }) => {
    await page.goto("/ro");
    await hydrated(page);
    const resting = await barBox(page);

    /* 40px: past the 8px that compacts and well short of the 80px that would
       let it leave. This is the window that used to show a severed heading —
       content already sliding under the bar while the bar was still a floating
       card with 12px of raw page above it. */
    await scrollTo(page, 40);
    await expect.poll(async () => (await flags(page)).compact).toBe(true);

    /*
     * POLL EVERY PROPERTY BEING ASSERTED, NOT ONE OF THEM AND THEN THE REST.
     *
     * `data-compact` lands in one frame; the geometry it drives is a 200ms
     * transition behind it, so polling the flag and reading the box catches the
     * bar mid-flight — that read 1px instead of 0 the first time, which looks
     * exactly like an off-by-one and is not one.
     *
     * Polling one measurement and then reading the others is the subtler version
     * of the same mistake, and it produced a genuinely flaky test: `top` comes
     * from a `padding` transition on the shell while `border-radius` comes from
     * a separate transition on the surface *inside* it. They are the same
     * duration but they do not start on the same frame, so `top` reaching 0
     * proves nothing about the corner — which was still at 0.086377px on the run
     * that failed. Each assertion waits for its own property.
     */
    await expect
      .poll(async () => (await barBox(page))?.top, {
        message: "flush with the viewport, so there is no gap to slice through",
      })
      .toBe(0);
    await expect
      .poll(async () => (await barBox(page))?.radius, { message: "sheds the rounding" })
      .toBe("0px");
    await expect
      .poll(async () => (await barBox(page))?.width, {
        message: "spans the whole viewport",
      })
      .toBe(viewport?.width);

    const box = await barBox(page);
    expect(box?.height, "is shorter than at rest").toBeLessThan(resting!.height);
    expect((await flags(page)).hidden, "but has not left").toBe(false);
  });

  test("does not leave while the page is still near the top", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);

    await scrollTo(page, 60);
    await expect.poll(async () => (await flags(page)).compact).toBe(true);
    await expect.poll(async () => (await barBox(page))?.top).toBe(0);
    expect((await flags(page)).hidden).toBe(false);
  });

  test("introduces itself the first time the page goes past the header", async ({
    page,
  }) => {
    await page.goto("/ro");
    await hydrated(page);

    /* One long scroll down and nothing else — the arrival of someone who
       followed an Instagram link and reads straight down. Plain auto-hide would
       take the bar away here and they would never learn it exists. */
    await scrollTo(page, 1200);
    await expect.poll(async () => (await flags(page)).hidden).toBe(false);
    await expect
      .poll(async () => (await barBox(page))?.top, { message: "on screen, not parked" })
      .toBe(0);

    // And then it does get out of the way, once it has been seen.
    await page.waitForTimeout(1800);
    await scrollTo(page, 2000);
    await expect.poll(async () => (await flags(page)).hidden).toBe(true);
  });

  test("gets out of the way on the way down and comes back on the way up", async ({
    page,
  }) => {
    await page.goto("/ro");
    await hydrated(page);
    await pastTheAnnouncement(page);

    await scrollTo(page, 1200);
    await expect.poll(async () => (await flags(page)).hidden).toBe(true);
    await expect.poll(async () => (await barBox(page))?.top).toBeLessThan(-40);

    await scrollTo(page, 1000);
    await expect.poll(async () => (await flags(page)).hidden).toBe(false);
    await expect.poll(async () => (await barBox(page))?.top).toBe(0);
  });

  test("a bar the keyboard is using does not leave", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await pastTheAnnouncement(page);

    await scrollTo(page, 1200);
    await expect.poll(async () => (await flags(page)).hidden).toBe(true);

    /*
     * Focus moved with .focus() and checked with :focus-visible rather than
     * pressed for with Tab — WebKit's Tab key does not walk links, so a tab loop
     * passes vacuously on the mobile project.
     *
     * The target is the wordmark BUTTON, deliberately not `header a`. This read
     * `header a` until the wordmark stopped being a link, at which point the
     * first anchor in the header became "Acasă" — which is `display: none` below
     * `lg`, so the focus silently did nothing and the check failed on the phone
     * project only. Verified in both engines: a button focused this way does
     * match :focus-visible, so the veto is real and it was the selector that was
     * wrong.
     */
    const focusVisible = await page.evaluate(() => {
      const wordmark = document.querySelector("header button") as HTMLElement | null;
      wordmark?.focus();
      return wordmark?.matches(":focus-visible") ?? false;
    });
    expect(focusVisible, "the wordmark should read as keyboard-focused").toBe(true);

    expect(
      (await flags(page)).hidden,
      "still flagged hidden — the veto is presentational"
    ).toBe(true);
    await expect
      .poll(async () => (await barBox(page))?.top, {
        message: "but it must be on screen, not focused off the top edge",
      })
      .toBe(0);
  });

  test("the compacted glass keeps enough body to read nav text over a photograph", async ({
    page,
  }) => {
    await page.goto("/ro");
    await hydrated(page);
    await scrollTo(page, 400);
    await expect.poll(async () => (await flags(page)).compact).toBe(true);

    const surfaceAlpha = () =>
      page.evaluate(() => {
        const bar = document.querySelector("header nav");
        if (!bar) return null;
        const colour = getComputedStyle(bar).backgroundColor;
        const alpha =
          colour.match(/\/\s*([\d.]+)\s*\)/) ??
          colour.match(/rgba\([^)]*,\s*([\d.]+)\s*\)/);
        return alpha ? Number(alpha[1]) : 1;
      });

    /*
     * Measured, not guessed. The bar crosses the event card photographs on the
     * home page, and the darkest backdrop any of them puts behind it leaves the
     * surface at #CCCCCC. Against that, charcoal-light nav links read 5.52:1
     * and the rose current-page pill 4.55:1 — both over AA's 4.5:1. At 0.7
     * those were 4.19:1 and 3.46:1, which is why this floor exists.
     */
    /* Polled, because the fill is a 200ms transition away from its resting 0.6
       and a straight read catches it partway. */
    await expect
      .poll(surfaceAlpha, {
        message: "thinner glass than this drops nav links below AA over a dark photo",
      })
      .toBeGreaterThanOrEqual(0.8);

    const backdrop = await page.evaluate(
      () => getComputedStyle(document.querySelector("header nav")!).backdropFilter || "none"
    );
    expect(backdrop, "and it is still glass").toContain("blur");
  });

  /* The hamburger only exists below `md`, and the bug this covers needs it. */
  test.describe(() => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("still gets out of the way after the menu has been opened and closed", async ({
      page,
    }) => {
      await page.goto("/ro");
      await hydrated(page);
      await pastTheAnnouncement(page);

      const drawer = page.locator("#mobile-menu");
      await page.locator('button[aria-controls="mobile-menu"]').click();
      await expect(drawer).toBeVisible();
      await drawer.getByRole("button", { name: "Închide meniul" }).click();
      await expect(drawer).toBeHidden();

      /*
       * THE BUG THIS EXISTS FOR
       *
       * Closing the drawer hands focus back to the hamburger, and the hamburger
       * lives inside <header>. The hide was vetoed by `:not(:focus-within)`, so
       * from that moment the bar simply stopped hiding — nothing about scrolling
       * blurs a button. It was reported as "the menu button stays visible", and
       * the tell was that widening the window past `md` fixed it: that makes the
       * hamburger `display: none`, which blurs it and released the veto.
       *
       * The veto is `:focus-visible` now, which a button focused after a tap
       * does not match.
       */
      await scrollTo(page, 1200);
      await expect
        .poll(async () => (await flags(page)).hidden, {
          message: "the bar must still hide once the menu has been used",
        })
        .toBe(true);
      await expect.poll(async () => (await barBox(page))?.top).toBeLessThan(-40);
    });
  });
});

test.describe("home page navigation bar identity and fit", () => {
  type Page = import("@playwright/test").Page;

  const hydrated = (page: Page) =>
    page.locator("next-route-announcer").waitFor({ state: "attached" });

  /**
   * The bar must never grow a second row.
   *
   * Reported from a desktop window being dragged narrower: somewhere above the
   * hamburger's breakpoint the Romanian labels ran out of room and wrapped, so
   * "Despre mine" and the wordmark each broke over two lines and the bar grew
   * to roughly double height instead of handing over to the menu.
   *
   * The cause was a breakpoint chosen without measuring. The link row needs
   * 840px in Romanian — walked down in 10px steps to find it — and it was set to
   * hand over at `md`, 768px. English fits in 770px, so the primary language was
   * the only one that ever showed it.
   */
  test("never grows a second row at any width", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "a device viewport cannot be resized through the breakpoint");

    await page.goto("/ro");
    await hydrated(page);
    const resting = await page.evaluate(() =>
      Math.round(document.querySelector("header nav")!.getBoundingClientRect().height)
    );

    for (let width = 1200; width >= 360; width -= 20) {
      await page.setViewportSize({ width, height: 800 });
      const state = await page.evaluate(() => {
        const bar = document.querySelector("header nav")!;
        const burger = document.querySelector('header button[aria-controls="mobile-menu"]');
        const firstLink = bar.querySelector("a[href]");
        return {
          height: Math.round(bar.getBoundingClientRect().height),
          burgerShown: !!burger && burger.getBoundingClientRect().width > 0,
          linksShown: !!firstLink && firstLink.getBoundingClientRect().width > 0,
        };
      });

      expect(
        state.height,
        `the bar wrapped to ${state.height}px at ${width}px wide`
      ).toBeLessThanOrEqual(resting);

      /* Exactly one of the two navigations is offered at any width. Both would
         be clutter; neither would be a site you cannot move around. */
      expect(
        state.burgerShown !== state.linksShown,
        `at ${width}px: hamburger ${state.burgerShown}, links ${state.linksShown}`
      ).toBe(true);
    }
  });

  /**
   * The wordmark takes you to the top of the page you are on.
   *
   * It linked to "/" until now, which is the usual convention and was also
   * redundant here — "Acasă" sits beside it and does that. Scrolling the current
   * page back to its own top is the job nothing else in the bar does, and it is
   * worth more now that the bar spends most of its time off-screen.
   */
  test("the wordmark returns the page to its top without leaving it", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(500);
    /* Up a little first, so the bar is on screen to be pressed. */
    await page.evaluate(() => window.scrollTo(0, 1140));
    await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY))).toBe(1140);

    const before = page.url();
    const wordmark = page.getByRole("banner").getByRole("button", { name: /Înapoi sus/ });
    await wordmark.click();

    await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    expect(page.url(), "it must not navigate anywhere").toBe(before);
  });

  /**
   * The business name is hers, and it has to reach every surface that shows it.
   *
   * "Yoga Flow" was a placeholder compiled into the source, which meant renaming
   * the business was a developer's job. It is a row in `site_content` now,
   * edited from "Conținut site" beside her Instagram address.
   *
   * This test exists because the failure mode for this kind of change is
   * partial: a field that updates the header and leaves the browser tab, the
   * share card and the structured data still saying the old name is worse than
   * no field at all — it looks like it worked. So the assertions here span the
   * header, the page title and the schema.org block deliberately.
   */
  test("the business name comes from the admin panel, everywhere it appears", async ({
    page,
  }) => {
    const previous = await siteContentValue("general.site_name");
    const chosen = "Respiră Yoga";

    try {
      await setSiteContent("general.site_name", chosen);
      await page.goto("/ro");
      await hydrated(page);

      await expect(
        page.getByRole("banner").getByRole("button", { name: new RegExp(chosen) })
      ).toContainText(chosen);
      await expect(page).toHaveTitle(new RegExp(chosen));

      const schema = await page.evaluate(
        () =>
          document.querySelector('script[type="application/ld+json"]')?.textContent ?? ""
      );
      expect(JSON.parse(schema).name, "structured data carries it too").toBe(chosen);

      /* And the footer, which is the other place a visitor reads it. */
      await expect(page.locator("footer")).toContainText(chosen);
    } finally {
      await setSiteContent("general.site_name", previous);
    }
  });

  /**
   * Empty means "she has not chosen yet", not empty.
   *
   * Every other key in this table treats a blank value that way and the public
   * pages render a placeholder rather than a gap. A site with no name in the
   * browser tab would be the one case where that convention produced something
   * broken instead of something unfinished.
   */
  test("falls back to the placeholder while the field is still blank", async ({ page }) => {
    const previous = await siteContentValue("general.site_name");

    try {
      await setSiteContent("general.site_name", "");
      await page.goto("/ro");
      await hydrated(page);

      await expect(page.getByRole("banner").getByRole("button").first()).toContainText(
        "Yoga Flow"
      );
      await expect(page).toHaveTitle(/Yoga Flow/);
    } finally {
      await setSiteContent("general.site_name", previous);
    }
  });
});

/**
 * The footer index, and the regression it exists for.
 *
 * On a phone the top bar renders none of the site's sections: the link row is
 * `hidden lg:flex` and the drawer is `display: none` until it is opened. An
 * audit of a rendered phone page found twenty anchors, of which eight had a box,
 * and all eight were blog posts — twelve links to the site's own sections were
 * in the markup and none of them was drawn. Once the wordmark stopped being a
 * link there was no rendered route to the home page at all.
 *
 * That is ordinary for a hamburger menu and mostly fine for people. It is less
 * fine for a search engine that indexes the rendered mobile page. These run at
 * each project's own viewport deliberately, so the phone project is the one
 * asserting the phone case.
 */
test.describe("footer navigation", () => {
  const SECTIONS = [
    "/ro",
    "/ro/about",
    "/ro/blog",
    "/ro/events",
    "/ro/testimonials",
    "/ro/contact",
  ];

  test("renders every section as a real link, at any viewport", async ({ page }) => {
    await page.goto("/ro/blog");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });

    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll("footer a[href]")]
        .filter((a) => {
          const box = a.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((a) => a.getAttribute("href"))
    );

    for (const href of SECTIONS) {
      expect(drawn, `the footer must render a link to ${href}`).toContain(href);
    }
  });

  test("is a list, so it can be counted and skipped", async ({ page }) => {
    await page.goto("/ro");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });

    /* A real <ul> hands assistive technology the number of items before the
       first one and one gesture to skip the group; a run of loose anchors does
       neither. Safari drops list semantics from a flex list with no markers, but
       only outside a <nav> — this is inside one, which is why no `role="list"`
       patch is needed here. */
    const shape = await page.evaluate(() => {
      const list = document.querySelector("footer nav ul");
      return {
        isList: list?.tagName ?? null,
        items: list ? list.querySelectorAll(":scope > li").length : 0,
      };
    });
    expect(shape.isList).toBe("UL");
    expect(shape.items).toBe(6);
  });

  test("the two navigation landmarks are told apart", async ({ page }) => {
    await page.goto("/ro");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });

    const exposed = await page.evaluate(() =>
      [...document.querySelectorAll("nav")]
        .filter((n) => n.getBoundingClientRect().width > 0)
        .map((n) => n.getAttribute("aria-label"))
    );

    expect(exposed.length, "the bar and the footer").toBeGreaterThanOrEqual(2);
    expect(exposed.every(Boolean), `every visible nav needs a name: ${JSON.stringify(exposed)}`).toBe(true);
    expect(new Set(exposed).size, "and the names must differ").toBe(exposed.length);
    /* A <nav> is announced as a navigation already; naming it one reads back as
       "navigation navigation". */
    for (const name of exposed) {
      expect(name).not.toMatch(/naviga/i);
    }
  });

  test("a footer link actually navigates", async ({ page }) => {
    await page.goto("/ro/blog");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });
    await page.locator("footer nav a").filter({ hasText: "Evenimente" }).first().click();
    await expect(page).toHaveURL(/\/ro\/events/);
  });

  test("does not push the page sideways", async ({ page }) => {
    await page.goto("/ro");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.doc, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
  });
});

/**
 * The home page shows one event at a time and cycles through the rest.
 *
 * WHAT IS WORTH PINNING HERE
 *
 * The scrolling is the browser's — `.event-carousel-track` is a scroll-snap
 * container — so these do not test that scrolling works. They test the three
 * things that are ours and that a refactor could quietly break: the order the
 * cards are in, the fact that exactly one of them is on screen, and the fact
 * that the sequence has a beginning it will not wrap past.
 *
 * `overscroll-behavior-x: contain` is deliberately not asserted. CLAUDE.md
 * records that Playwright's WebKit does not implement the property at all —
 * `CSS.supports` says no and it is missing from computed style — while Safari
 * has shipped it since 16. Measured again here: Chromium computes `contain`,
 * Playwright's WebKit returns nothing. A test on it would fail against an
 * engine no visitor runs.
 */
test.describe("home page events carousel", () => {
  const inDays = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const track = (page: import("@playwright/test").Page) =>
    page.locator(".event-carousel-track");
  const slides = (page: import("@playwright/test").Page) =>
    page.locator(".event-carousel-track > li");

  /**
   * Everything about where the carousel is, read in one go.
   *
   * One call, not three, because these are read while a scroll is gliding and
   * they disagree during it: `index` rounds to the destination as soon as the
   * scroll passes halfway, while `inside` still sees two cards and `aligned`
   * is still false. Polling one of them and then reading the others is how a
   * test ends up asserting against a frame in the middle of the animation —
   * which is exactly how this one failed the first time it was written.
   */
  const position = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".event-carousel-track")!;
      const first = el.children[0] as HTMLElement;
      const second = el.children[1] as HTMLElement | undefined;
      const step = second
        ? second.offsetLeft - first.offsetLeft
        : first.getBoundingClientRect().width;
      const index = Math.round(el.scrollLeft / step);
      const port = el.getBoundingClientRect();
      return {
        index,
        // How many slides have any part of themselves in the scrollport.
        inside: [...el.children].filter((slide) => {
          const r = slide.getBoundingClientRect();
          return r.right > port.left + 1 && r.left < port.right - 1;
        }).length,
        aligned: Math.abs(el.scrollLeft - index * step) < 1,
      };
    });

  /** Settled on card `n`, whole, with nothing else on screen. */
  const at = (n: number) => ({ index: n, inside: 1, aligned: true });

  /**
   * THE ORDERING RULE, WHICH IS THE WHOLE POINT OF THE SECTION
   *
   * The card standing there when the page opens is the nearest date somebody
   * can still book — not simply the nearest date. A sold-out event is not
   * hidden; it drops behind every bookable one, because leading with it is an
   * advert for disappointment.
   *
   * Seeded rather than read off the existing rows: this asserts the rule, not
   * whatever seed.sql happens to contain this month.
   */
  test("it leads with the soonest event that can still be booked", async ({ page }) => {
    const sooner = await seedEvent({ date: inDays(1), max_participants: 1 });
    const bookable = await seedEvent({ date: inDays(2), max_participants: 10 });
    try {
      await seedRegistrationFor(sooner.id); // and now it is full
      await page.goto("/ro");

      await expect(slides(page).first().locator("a")).toHaveAttribute(
        "href",
        `/ro/events/${bookable.slug}`
      );

      /*
       * And the rest of the order, as an invariant rather than a fixed list:
       * once a sold-out card has appeared, every card after it is sold out too.
       * Written this way it keeps holding however many events exist.
       */
      const soldOut = await slides(page).evaluateAll((els) =>
        els.map((el) => (el.textContent ?? "").includes("Locuri epuizate"))
      );
      expect(soldOut.length, "the carousel rendered no cards").toBeGreaterThan(1);
      expect(
        soldOut.filter(Boolean).length,
        "no sold-out event on the page, so this proves nothing"
      ).toBeGreaterThan(0);
      expect(soldOut, "a bookable event appeared behind a sold-out one").toEqual(
        [...soldOut].sort((a, b) => Number(a) - Number(b))
      );
    } finally {
      await deleteEventBySlug(sooner.slug);
      await deleteEventBySlug(bookable.slug);
    }
  });

  /**
   * One card, not three.
   *
   * The section used to show a large card and two small ones. The neighbouring
   * slides are still in the document — that is what makes them crawlable and
   * swipeable — so "one card" has to be measured against the scrollport rather
   * than counted in the DOM.
   */
  test("exactly one card is on screen, with the others still in the markup", async ({
    page,
  }) => {
    await page.goto("/ro");
    const count = await slides(page).count();
    expect(count, "needs at least two upcoming events to be a carousel").toBeGreaterThan(1);
    await expect.poll(() => position(page)).toEqual(at(0));

    // Every one of them is a real link in the HTML, which is what a crawler and
    // a visitor whose JavaScript has not arrived both get.
    for (let i = 0; i < count; i++) {
      await expect(slides(page).nth(i).locator("a")).toHaveAttribute(
        "href",
        /^\/ro\/events\/.+/
      );
    }
  });

  /**
   * There is a beginning. Cycling runs one way from the lead card, and the only
   * thing a leftward move does is walk back towards it — never round to the end.
   */
  test("it does not wrap backwards past the lead card", async ({ page }) => {
    await page.goto("/ro");
    await expect(slides(page).first()).toBeVisible();

    const lead = await slides(page).first().locator("h3").innerText();

    // A hard rightward swipe at the first card.
    await track(page).evaluate((el) => {
      el.scrollLeft = -800;
    });
    await page.waitForTimeout(400);

    await expect.poll(() => position(page)).toEqual(at(0));
    expect(await slides(page).first().locator("h3").innerText()).toBe(lead);
  });

  test("the arrow keys move it, and stop at the lead card", async ({ page }) => {
    await page.goto("/ro");
    await expect(slides(page).first()).toBeVisible();

    // `.focus()` rather than Tab: WebKit does not walk links with Tab, so a
    // tab-driven version of this passes vacuously on the mobile project.
    await slides(page).first().locator("a").focus();

    await page.keyboard.press("ArrowRight");
    await expect.poll(() => position(page)).toEqual(at(1));

    await page.keyboard.press("ArrowLeft");
    await expect.poll(() => position(page)).toEqual(at(0));

    // And again, from the start. Nothing to go back to.
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(500);
    expect(await position(page)).toEqual(at(0));
  });

  test("the arrows step one card and disable themselves at each end", async ({ page }) => {
    // Runs at every viewport now. The arrows used to be `hidden sm:inline-flex`
    // and this skipped below 640px; they are drawn on a phone too, so the
    // behaviour is worth checking there as well — that is where somebody with
    // no pointer is relying on them.

    await page.goto("/ro");
    const section = page.locator("section#events");
    const back = section.getByRole("button", { name: "Evenimentul anterior" });
    const forward = section.getByRole("button", { name: "Evenimentul următor" });

    await expect(back).toBeDisabled();
    await expect(forward).toBeEnabled();

    await forward.click();
    await expect.poll(() => position(page)).toEqual(at(1));
    await expect(back).toBeEnabled();

    await back.click();
    await expect.poll(() => position(page)).toEqual(at(0));
    await expect(back).toBeDisabled();

    /*
     * All the way to the other end, without pausing between clicks — which is
     * the case that caught a real one. Each click has to count from the card
     * the last click asked for, not from wherever the glide has got to, or
     * somebody skimming for a date that suits them loses half their taps.
     */
    const last = (await slides(page).count()) - 1;
    for (let i = 0; i < last; i++) await forward.click();
    await expect.poll(() => position(page)).toEqual(at(last));
    await expect(forward).toBeDisabled();

    // Focus must not be left on the button that just disabled itself, or the
    // next Tab restarts from the top of the page.
    expect(
      await page.evaluate(() => document.activeElement?.tagName),
      "focus was dropped when the forward arrow disabled itself"
    ).not.toBe("BODY");
  });

  /**
   * A phone gets the arrows too, and they are a real target.
   *
   * They used to be `hidden sm:inline-flex`, on the reasoning that a finger
   * swipes and does not need a button. The swipe is still the nicer gesture and
   * still works — but it was the *only* one below 640px, and a swipe is
   * invisible: nothing on a still page says the card moves. Somebody who does
   * not think to try it had no way through the list at all.
   */
  test("the arrows and the dots are both drawn on a phone", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 640, "phone-only layout");
    await page.goto("/ro");
    const section = page.locator("section#events");

    const back = section.getByRole("button", { name: "Evenimentul anterior" });
    await expect(back).toBeVisible();

    // WCAG 2.5.5 asks for 44px, and on a phone these are now a primary control
    // rather than a convenience beside a swipe.
    const box = await back.boundingBox();
    expect(box!.width, "tap target width").toBeGreaterThanOrEqual(44);
    expect(box!.height, "tap target height").toBeGreaterThanOrEqual(44);

    await expect(
      section.locator('span[aria-hidden="true"] > span.rounded-full')
    ).toHaveCount(await slides(page).count());
  });

  /**
   * Her descriptions have no length limit — she writes them in a plain
   * textarea — and in a carousel every slide is as tall as the tallest, so one
   * rambling paragraph would add white space to every other event.
   */
  test("a long description stops after three lines", async ({ page }) => {
    const wordy = await seedEvent({
      date: inDays(1),
      description_ro: "Propoziție lungă despre respirație, mișcare și liniște. ".repeat(20),
    });
    try {
      await page.goto("/ro");
      const paragraph = slides(page).first().locator("p.line-clamp-3");
      await expect(paragraph).toBeVisible();

      const box = await paragraph.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          clamp: cs.webkitLineClamp,
          lineHeight: parseFloat(cs.lineHeight),
          drawn: el.clientHeight,
          wanted: el.scrollHeight,
        };
      });
      expect(box.clamp, "the line clamp is gone").toBe("3");
      expect(box.wanted, "this description was short enough to fit anyway").toBeGreaterThan(
        box.drawn
      );
      expect(box.drawn).toBeLessThanOrEqual(box.lineHeight * 3 + 2);
    } finally {
      await deleteEventBySlug(wordy.slug);
    }
  });

  /**
   * The "see all events" link is an anchor styled as a button, and it was the
   * one section CTA on this page that was not centred — along with the heading
   * above it.
   */
  test("the heading, the controls and the button all sit on the page's centre line", async ({
    page,
  }) => {
    await page.goto("/ro");
    const offsets = await page.evaluate(() => {
      const section = document.querySelector<HTMLElement>("section#events")!;
      const container = section.querySelector<HTMLElement>("div")!;
      const middle = (el: Element) => {
        const r = el.getBoundingClientRect();
        const c = container.getBoundingClientRect();
        return Math.round((r.left + r.right) / 2 - (c.left + c.right) / 2);
      };
      return {
        heading: middle(section.querySelector("h2")!),
        viewAll: middle(section.querySelector('a[href="/ro/events"]')!),
      };
    });
    expect(Math.abs(offsets.heading), "the heading is off-centre").toBeLessThanOrEqual(1);
    expect(Math.abs(offsets.viewAll), "the button is off-centre").toBeLessThanOrEqual(1);
  });

  /**
   * A horizontal scroller one viewport wide is the kind of thing that pushes
   * the whole document sideways if a width is off by a few pixels, and on a
   * phone that is the bug people actually report.
   */
  /**
   * Dragging a window narrow and back must leave the card as it found it.
   *
   * The track's height is set from JavaScript so a stacked card can be as tall
   * as its own contents. Above `md` the slides take their height *from* the
   * track instead, which makes that circular: whatever number went in, the
   * slide grew to it and the observer measured the same number straight back.
   * A round trip through the breakpoint left the wide layout wearing the narrow
   * layout's height — a card twice as tall as its contents with everything
   * floating in the middle — and only a reload cleared it.
   *
   * Asserting against the same page before the resize rather than a literal,
   * because the height is whatever the content comes to.
   */
  test("a resize through the breakpoint and back leaves the card alone", async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, "a device viewport cannot be resized through the breakpoint");

    await page.goto("/ro");
    const card = page.locator("section#events a[href*='/events/']").first();
    await expect(card).toBeVisible();

    const wide = (await card.boundingBox())!.height;

    await page.setViewportSize({ width: 430, height: 950 });
    await expect
      .poll(async () => (await card.boundingBox())!.height, { timeout: 5000 })
      .not.toBe(wide);

    await page.setViewportSize({ width: 1400, height: 950 });
    await expect
      .poll(async () => (await card.boundingBox())!.height, { timeout: 5000 })
      .toBe(wide);

    // The inline height belongs to the stacked layout only; left behind, it is
    // what makes the slide stretch to the wrong size.
    const inline = await page
      .locator(".event-carousel-track")
      .evaluate((el) => (el as HTMLElement).style.height);
    expect(inline, "no inline height survives into the wide layout").toBe("");
  });

  test("it does not make the page scroll sideways", async ({ page }) => {
    await page.goto("/ro");
    await expect(slides(page).first()).toBeVisible();
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflows).toBe(false);
  });
});
