import { test, expect, type Page } from "@playwright/test";
import { siteContentValue } from "./helpers";

/**
 * The admin frame on a computer (components/admin/shell/admin-shell.tsx): the
 * sticky sidebar, pinning it narrow, widening it on hover and focus, the top
 * bar, and every page's heading and tab title. The phone drawer is in
 * admin-mobile.spec.ts, which runs on iPhone WebKit.
 */

const SECTIONS: Array<{ label: string; path: string; title?: string }> = [
  { label: "Panou de control", path: "/admin" },
  { label: "Evenimente", path: "/admin/events" },
  { label: "Înscrieri", path: "/admin/registrations" },
  { label: "Mesaje", path: "/admin/messages" },
  { label: "Testimoniale", path: "/admin/testimonials" },
  { label: "Articole", path: "/admin/blog" },
  { label: "Email-uri", path: "/admin/emails" },
  // "Conținut site" opens on its first section, and the tab names the section too.
  { label: "Conținut site", path: "/admin/content/identity", title: "Identitate · Conținut site" },
];

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Secțiuni admin" });
const toggle = (page: Page) => page.getByRole("button", { name: "Bară laterală îngustă" });
const panelWidth = (page: Page) =>
  page.locator(".admin-rail-panel").evaluate((el) => el.getBoundingClientRect().width);

/** Pins the sidebar narrow, for the tests about the narrow rail. */
async function pinNarrow(page: Page) {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => panelWidth(page)).toBe(72);
}

test.describe("the admin sidebar", () => {
  test.beforeEach(async ({ page, context }) => {
    // Every test starts wide, whatever an earlier one pinned.
    await context.clearCookies({ name: "admin-nav" });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Panou de control" })).toBeVisible();
  });

  test("stays in view at the bottom of a long page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/admin/content/home");
    await expect(page.getByRole("heading", { level: 1, name: "Conținut site" })).toBeVisible();
    // The section's fields load after the page, and only then is it long.
    await expect(page.getByText("Totul e salvat")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

    const link = sidebar(page).getByRole("link", { name: "Evenimente" });
    await expect(link).toBeInViewport();
    await expect(page.getByRole("button", { name: "Deconectare" })).toBeInViewport();
    // The top bar sticks too.
    await expect(page.getByRole("link", { name: /Admin$/ }).first()).toBeInViewport();
  });

  test("pinned narrow, it stays narrow after a reload and keeps its link names", async ({ page }) => {
    await pinNarrow(page);
    await page.mouse.move(900, 400);

    await page.reload();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    // Narrow from the first paint: the server read the cookie.
    expect(await panelWidth(page)).toBe(72);
    const label = sidebar(page).getByText("Evenimente", { exact: true });
    await expect(label).toHaveCSS("opacity", "0");
    // Faded, not removed: the link keeps its name for a screen reader.
    await expect(sidebar(page).getByRole("link", { name: "Evenimente" })).toBeAttached();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect.poll(() => panelWidth(page)).toBe(240);
  });

  test("resting the pointer on the narrow rail widens it over the page", async ({ page }) => {
    await pinNarrow(page);
    await page.mouse.move(900, 400);
    const mainBefore = await page.locator("#admin-main").boundingBox();

    await page.locator(".admin-rail-panel").hover({ position: { x: 30, y: 300 } });
    await expect.poll(() => panelWidth(page)).toBe(240);
    await expect(sidebar(page).getByText("Evenimente", { exact: true })).toHaveCSS("opacity", "1");
    // Over the page, not pushing it: the page has not moved.
    expect((await page.locator("#admin-main").boundingBox())?.x).toBe(mainBefore?.x);

    await page.mouse.move(900, 400);
    await expect.poll(() => panelWidth(page)).toBe(72);
    // Still pinned narrow: hovering never changes the pin.
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  });

  test("keyboard focus widens the narrow rail, and leaving it narrows it", async ({ page }) => {
    await pinNarrow(page);
    await page.mouse.move(900, 400);

    await sidebar(page).getByRole("link", { name: "Mesaje" }).focus();
    await expect.poll(() => panelWidth(page)).toBe(240);

    await page.locator("#admin-main").focus();
    await expect.poll(() => panelWidth(page)).toBe(72);
  });

  test("marks the page you are on", async ({ page }) => {
    await page.goto("/admin/events");
    await expect(sidebar(page).getByRole("link", { name: "Evenimente" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(sidebar(page).locator("[aria-current]")).toHaveCount(1);
  });

  test("every section has its own heading and tab title", async ({ page }) => {
    const siteName = await siteContentValue("general.site_name");
    for (const { label, path, title } of SECTIONS) {
      await sidebar(page).getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
      await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
      await expect(page).toHaveTitle(`${title ?? label} · ${siteName} Admin`);
    }
  });

  test("a page opened from the address bar keeps its own tab title", async ({ page }) => {
    // On a full load Next.js writes the layout's title in after the page has
    // set its own; the page has to win.
    const siteName = await siteContentValue("general.site_name");
    await page.goto("/admin/messages");
    await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
    await expect(page).toHaveTitle(`Mesaje · ${siteName} Admin`);
    await page.waitForTimeout(1_000);
    await expect(page).toHaveTitle(`Mesaje · ${siteName} Admin`);
  });
});

test.describe("the admin top bar", () => {
  test("names her site and opens the public site in a new tab", async ({ page }) => {
    const siteName = await siteContentValue("general.site_name");
    await page.goto("/admin/events");
    await expect(page.getByRole("banner").getByRole("link", { name: `${siteName} Admin` })).toHaveAttribute(
      "href",
      "/admin"
    );
    const viewSite = page.getByRole("link", { name: /Vezi site-ul/ });
    await expect(viewSite).toHaveAttribute("href", "/ro");
    await expect(viewSite).toHaveAttribute("target", "_blank");
  });

  test("the skip link takes the keyboard past the navigation", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Panou de control" })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Sari la conținut" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#admin-main")).toBeFocused();
  });
});
