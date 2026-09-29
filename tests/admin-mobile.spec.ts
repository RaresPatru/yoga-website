import { test, expect } from "@playwright/test";
import { deleteMessages, seedMessage, unique } from "./helpers";

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

  test("site content picks its section from a dropdown, and fits the screen", async ({ page }) => {
    await page.goto("/admin/content/identity");
    await expect(page.getByRole("button", { name: "Salvează modificările" })).toBeVisible();
    await page.getByLabel("Secțiune").selectOption("home");
    await expect(page).toHaveURL(/\/admin\/content\/home$/);
    await expect(page.getByRole("heading", { level: 2, name: "Pagina de start" })).toBeVisible();
    await expect(page.getByText("Totul e salvat")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "nothing should scroll sideways").toBeLessThanOrEqual(0);
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

  test("a message opens over the whole screen, and the arrow goes back to the list", async ({ page }) => {
    const tag = unique("telefon");
    const id = await seedMessage({ name: `Andreea ${tag}`, message: "Primul rând\nAl doilea rând" });
    try {
      await page.goto(`/admin/messages?q=${tag}`);
      await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
      await page.getByRole("link", { name: new RegExp(`Andreea ${tag}`) }).click();

      const letter = page.getByRole("dialog", { name: `Andreea ${tag}` });
      await expect(letter).toBeVisible();
      const box = (await letter.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.width)).toBe(viewport.width);
      expect(Math.round(box.height)).toBe(viewport.height);
      // Reading starts at the letter, not with a ring round the back arrow.
      await expect(letter.getByRole("heading", { level: 2 })).toBeFocused();
      await expect(letter.getByRole("link", { name: "Răspunde prin email" })).toBeVisible();
      const overflow = await letter.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, "nothing in the letter should scroll sideways").toBeLessThanOrEqual(0);

      await letter.getByRole("button", { name: "Înapoi la mesaje" }).click();
      await expect(letter).toBeHidden();
      await expect(page).not.toHaveURL(/m=/);
      await expect(page.getByRole("link", { name: new RegExp(`Andreea ${tag}`) })).toBeVisible();
    } finally {
      await deleteMessages([id]);
    }
  });
});
