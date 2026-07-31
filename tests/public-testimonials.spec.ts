import { test, expect } from "@playwright/test";
import { seedTestimonial, deleteTestimonial } from "./helpers";

test.describe("testimonials", () => {
  test("list page shows only approved testimonials", async ({ page }) => {
    const approved = await seedTestimonial(true);
    const pending = await seedTestimonial(false);
    try {
      await page.goto("/ro/testimonials");
      await expect(page.getByRole("heading", { name: "Testimoniale" })).toBeVisible();
      await expect(page.getByText(approved.content)).toBeVisible();
      await expect(page.getByText(pending.content)).toHaveCount(0);
    } finally {
      await deleteTestimonial(approved);
      await deleteTestimonial(pending);
    }
  });

  test("English locale renders the page", async ({ page }) => {
    const approved = await seedTestimonial(true);
    try {
      await page.goto("/en/testimonials");
      await expect(page.getByRole("heading", { name: "Testimonials" })).toBeVisible();
      await expect(page.getByText(approved.content)).toBeVisible();
    } finally {
      await deleteTestimonial(approved);
    }
  });
});
