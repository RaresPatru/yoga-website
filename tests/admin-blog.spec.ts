import { test, expect } from "@playwright/test";
import { loginAsAdmin, deletePostBySlug, unique } from "./helpers";

test.describe("admin blog CRUD", () => {
  let slug = "";
  let title = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("creates, edits and deletes a blog post", async ({ page }) => {
    slug = unique("articol-admin");
    title = `Articol Admin ${slug}`;
    const titleEdited = `${title} (modificat)`;

    const cardRow = (headingText: string) =>
      page
        .getByRole("heading", { name: headingText })
        .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]");

    await loginAsAdmin(page);
    await page.goto("/admin/blog");

    await page.getByRole("button", { name: "Articol Nou" }).click();
    await expect(page.getByRole("heading", { name: "Articol Nou" })).toBeVisible();
    await expect(page.getByRole("button", { name: "→ EN" }).first()).toBeVisible();

    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Titlu (EN)").fill(`Admin Post ${slug}`);
    await page.getByLabel("Slug").fill(slug);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("Conținut articol de test E2E.");
    await page.getByText("Publicat", { exact: true }).click();
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page).toHaveURL(/\/admin\/blog$/);
    await expect(cardRow(title)).toBeVisible();
    await expect(cardRow(title).getByText("Publicat", { exact: true })).toBeVisible();

    await cardRow(title).getByRole("button").first().click();
    await page.getByLabel("Titlu (RO)").fill(titleEdited);
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(cardRow(titleEdited)).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await cardRow(titleEdited).getByRole("button").nth(1).click();
    await expect(cardRow(titleEdited)).toHaveCount(0);
  });
});
