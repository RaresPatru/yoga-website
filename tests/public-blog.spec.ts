import { test, expect } from "@playwright/test";
import { seedPost, deletePostBySlug } from "./helpers";

test.describe("blog", () => {
  test("list page renders posts and navigates to detail", async ({ page }) => {
    const post = await seedPost();
    const title = `Articol E2E ${post.slug}`;
    try {
      await page.goto("/ro/blog");
      await expect(page.getByRole("heading", { name: "Blog", exact: true })).toBeVisible();
      const card = page.getByRole("link", { name: title });
      await expect(card).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/ro/blog/${post.slug}`));
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("detail page shows content, back link and working share button", async ({ page }) => {
    const post = await seedPost();
    const title = `Articol E2E ${post.slug}`;
    try {
      await page.goto(`/ro/blog/${post.slug}`);

      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Conținut de test E2E.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Secțiune test" })).toBeVisible();

      await page.getByRole("link", { name: "Înapoi la blog" }).click();
      await expect(page).toHaveURL(/\/ro\/blog$/);
      await page.goto(`/ro/blog/${post.slug}`);

      /*
       * Found by what it says after the click, not by what it said before.
       *
       * The button used to carry `aria-label="Distribuie"`, which pinned its
       * accessible name while the visible text changed to "Link copiat!" — so
       * one locator matched throughout. That was also a WCAG 2.5.3 failure (the
       * accessible name has to contain the visible label) and it meant a screen
       * reader never heard the confirmation at all. The label is gone, the name
       * follows the text, and the confirmation is now its own locator.
       */
      await page.getByRole("button", { name: "Distribuie" }).click();
      await expect(page.getByRole("button", { name: "Link copiat!" })).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("English locale shows English title and back link", async ({ page }) => {
    const post = await seedPost();
    const titleEn = `E2E Post ${post.slug}`;
    try {
      await page.goto(`/en/blog/${post.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to blog" })).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });
});
