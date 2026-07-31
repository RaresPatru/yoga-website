import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("admin email templates", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/emails");
  });

  test("lists the three templates and can open the editor", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Template-uri Email" })).toBeVisible();

    for (const template of ["Confirmare înscriere", "Confirmare plată", "Cerere testimonial"]) {
      const card = page.getByText(template, { exact: true });
      await expect(card).toBeVisible();
      await card
        .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]")
        .getByRole("button", { name: "Editează" })
        .click();
      await expect(page.getByLabel("Subiect (RO)")).toBeVisible();
      await page.getByRole("button", { name: "Anulează" }).click();
      await expect(page.getByLabel("Subiect (RO)")).toHaveCount(0);
    }
  });
});
