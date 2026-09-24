import { test, expect } from "@playwright/test";

/**
 * The admin panel on a phone: the `admin-mobile` project runs this on iPhone
 * WebKit, the engine she has in her pocket.
 *
 * Below 1024px the sidebar gives way to a menu button that opens the same
 * links in a drawer, a modal <dialog> (components/admin/shell/admin-shell.tsx).
 */

test.describe("the admin panel on a phone", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin");
    // The translated heading proves the client has hydrated, which WebKit does
    // later than Chromium; tapping before then would do nothing.
    await expect(page.getByRole("heading", { level: 1, name: "Panou de control" })).toBeVisible();
  });

  test("has no sidebar, and the dashboard fits the screen", async ({ page }) => {
    await expect(page.locator(".admin-rail")).toBeHidden();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "nothing should scroll sideways").toBeLessThanOrEqual(0);
  });

  test("the menu opens every section, and following a link closes it", async ({ page }) => {
    await page.getByRole("button", { name: "Deschide meniul" }).click();
    const drawer = page.getByRole("dialog", { name: "Meniu" });
    await expect(drawer).toBeVisible();
    for (const label of ["Panou de control", "Evenimente", "Înscrieri", "Mesaje", "Testimoniale", "Articole", "Email-uri", "Conținut site"]) {
      await expect(drawer.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(drawer.getByRole("button", { name: "Deconectare" })).toBeVisible();

    await drawer.getByRole("link", { name: "Mesaje", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/messages$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
    await expect(drawer).toBeHidden();
  });

  test("the close button, Escape and a tap outside all close the drawer", async ({ page }) => {
    const open = page.getByRole("button", { name: "Deschide meniul" });
    const drawer = page.getByRole("dialog", { name: "Meniu" });

    await open.click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: "Închide meniul" }).click();
    await expect(drawer).toBeHidden();

    await open.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // The strip of dimmed page to the right of the drawer.
    await open.click();
    await expect(drawer).toBeVisible();
    const viewport = page.viewportSize()!;
    await page.mouse.click(viewport.width - 12, viewport.height / 2);
    await expect(drawer).toBeHidden();
    // The tap closed the drawer and did nothing to the page underneath.
    await expect(page).toHaveURL(/\/admin$/);
  });
});
