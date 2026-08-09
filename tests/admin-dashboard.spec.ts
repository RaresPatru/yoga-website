import { test, expect } from "@playwright/test";

test.describe("admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Signed in already via the saved storageState (see tests/auth.setup.ts).
    await page.goto("/admin");
  });

  test("shows the stat cards", async ({ page }) => {
    for (const label of ["Evenimente", "Înscrieri", "Articole", "Mesaje", "Testimoniale neaprobate"]) {
      await expect(page.locator("p.text-sm").getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.locator("h1.text-2xl").first()).toBeVisible();
  });

  test("stat cards link to their admin panels", async ({ page }) => {
    const links: Array<[string, RegExp]> = [
      ["Mesaje", /\/admin\/messages$/],
      ["Evenimente", /\/admin\/events$/],
      ["Înscrieri", /\/admin\/registrations$/],
      ["Articole", /\/admin\/blog$/],
      ["Testimoniale neaprobate", /\/admin\/testimonials$/],
    ];
    for (const [label, url] of links) {
      const card = page.locator("a.group", { hasText: label }).first();
      await expect(card).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(url);
      await page.goBack();
    }
  });

  test("sidebar navigates to every admin section", async ({ page }) => {
    const sections: Array<[string, RegExp, string]> = [
      ["Panou de Control", /\/admin$/, "Dashboard"],
      ["Articole", /\/admin\/blog/, "Articole Blog"],
      ["Evenimente", /\/admin\/events/, "Evenimente"],
      ["Înscrieri", /\/admin\/registrations/, "Înscrieri"],
      ["Testimoniale", /\/admin\/testimonials/, "Testimoniale"],
      ["Email-uri", /\/admin\/emails/, "Template-uri Email"],
      ["Mesaje", /\/admin\/messages/, "Mesaje"],
    ];
    for (const [label, url, heading] of sections) {
      await page.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("locale toggle switches the sidebar between RO and EN", async ({ page }) => {
    const sidebar = page.locator("nav");
    await page.getByRole("button", { name: "English" }).click();
    await expect(sidebar.getByRole("link", { name: "Blog Posts" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Registrations" })).toBeVisible();
    await page.getByRole("button", { name: "Română" }).click();
    await expect(sidebar.getByRole("link", { name: "Articole" })).toBeVisible();
  });
});
