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

  test("renders hero, mission and stats sections", async ({ page }) => {
    await expect(
      page.getByRole("heading", { level: 1, name: "Îți ghidez călătoria către echilibru" })
    ).toBeVisible();
    await expect(page.getByText("Yoga pentru corp, minte și suflet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Misiunea mea" })).toBeVisible();
    for (const stat of ["10+", "500+", "1000+"]) {
      await expect(page.getByText(stat, { exact: true })).toBeVisible();
    }
  });

  test("hero CTA links to events page", async ({ page }) => {
    await page.getByRole("link", { name: "Explorează" }).click();
    await expect(page).toHaveURL(/\/ro\/events/);
  });

  test("desktop nav links navigate to every section", async ({ page }) => {
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
  test("switching to English updates lang and content, and back", async ({ page }) => {
    await page.goto("/ro");

    await page.getByRole("button", { name: "Switch to English" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("heading", { level: 1, name: "I guide your journey to balance" })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Blog", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Treci la română" }).click();
    await expect(page).toHaveURL(/\/ro$/);
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
