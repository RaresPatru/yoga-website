import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("admin dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("shows the four stat cards", async ({ page }) => {
    for (const label of ["Evenimente", "Înscrieri", "Articole", "Testimoniale neaprobate"]) {
      await expect(page.locator("p.text-sm").getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.locator("h1.text-2xl").first()).toBeVisible();
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
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("link", { name: "Blog Posts" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrations" })).toBeVisible();
    await page.getByRole("button", { name: "Română" }).click();
    await expect(page.getByRole("link", { name: "Articole" })).toBeVisible();
  });
});
