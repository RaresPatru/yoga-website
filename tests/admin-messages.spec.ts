import { test, expect } from "@playwright/test";

test.describe("admin contact messages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/messages");
  });

  test("renders the page with either messages or the empty state", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Mesaje" })).toBeVisible();
    const empty = page.getByText("Nu există mesaje.");
    const hasContent = page.locator(".space-y-3").first();
    await expect(empty.or(hasContent)).toBeVisible();
  });
});
