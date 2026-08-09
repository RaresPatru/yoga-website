import { test, expect } from "@playwright/test";

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
