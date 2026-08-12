import { test, expect } from "@playwright/test";

test.describe("admin email templates", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/emails");
  });

  test("lists every template and can open the editor", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Template-uri Email" })).toBeVisible();

    // One per row in email_templates. The list is driven by the database, so a
    // type added there with no entry in the page's label map used to take the
    // whole screen down — `t()` was handed `undefined` and called `.split()` on
    // it. Asserting on all four is what catches that, since three of them
    // rendering fine is exactly what the broken version did not manage.
    for (const template of [
      "Confirmare înscriere",
      "Confirmare plată",
      "Cerere testimonial",
      "Loc disponibil (listă de așteptare)",
    ]) {
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
