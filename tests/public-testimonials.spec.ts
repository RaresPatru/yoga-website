import { test, expect } from "@playwright/test";
import { seedTestimonial, deleteTestimonial } from "./helpers";

test.describe("testimonials", () => {
  test("list page shows only approved testimonials she has not hidden, and says how they are checked", async ({ page }) => {
    const approved = await seedTestimonial(true);
    const pending = await seedTestimonial(false);
    const hidden = await seedTestimonial(true, { hidden: true });
    try {
      await page.goto("/ro/testimonials");
      await expect(page.getByRole("heading", { name: "Testimoniale" })).toBeVisible();
      await expect(page.getByText(approved.content)).toBeVisible();
      await expect(page.getByText(pending.content)).toHaveCount(0);
      await expect(page.getByText(hidden.content)).toHaveCount(0);
      // The EU's Omnibus rules: a site showing reviews says how it checks them.
      await expect(page.getByText(/^Cum verificăm:/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Împărtășește-ți experiența" })).toHaveAttribute(
        "href",
        "/ro/testimonials/share"
      );
    } finally {
      await deleteTestimonial(approved);
      await deleteTestimonial(pending);
      await deleteTestimonial(hidden);
    }
  });

  test("an imported testimonial makes no claim to be verified", async ({ page }) => {
    const imported = await seedTestimonial(true);
    try {
      await page.goto("/ro/testimonials");
      const card = page.getByRole("article").filter({ hasText: imported.content });
      await expect(card).toBeVisible();
      await expect(card.getByText("Participare verificată")).toHaveCount(0);
    } finally {
      await deleteTestimonial(imported);
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

  test("a page past the end is missing, not empty", async ({ request }) => {
    const response = await request.get("/ro/testimonials?page=999");
    expect(response.status()).toBe(404);
  });
});
