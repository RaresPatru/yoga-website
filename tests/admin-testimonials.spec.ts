import { test, expect } from "@playwright/test";
import { loginAsAdmin, seedTestimonial, deleteTestimonial } from "./helpers";

test.describe("admin testimonials", () => {
  test("approves a pending testimonial and then deletes it", async ({ page }) => {
    const seeded = await seedTestimonial(false);
    try {
      await loginAsAdmin(page);
      await page.goto("/admin/testimonials");

      await expect(page.getByRole("heading", { name: "Testimoniale" })).toBeVisible();

      const card = page.getByText(seeded.content);
      await expect(card).toBeVisible();

      const cardRow = card.locator("xpath=ancestor::div[contains(@class,'flex items-start justify-between')]");
      await expect(cardRow.getByText("Neaprobat")).toBeVisible();

      await cardRow.getByRole("button").first().click();
      await expect(cardRow.getByText("Aprobat")).toBeVisible();
      await expect(cardRow.getByText("Neaprobat")).toHaveCount(0);

      page.on("dialog", (d) => d.accept());
      await cardRow.getByRole("button").first().click();
      await expect(card).toHaveCount(0);
    } finally {
      await deleteTestimonial(seeded);
    }
  });
});
