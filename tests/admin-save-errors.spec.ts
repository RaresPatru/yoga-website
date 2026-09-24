import { test, expect } from "@playwright/test";
import { deleteEventBySlug, deletePostBySlug, seedEvent, seedPost, unique } from "./helpers";

/**
 * Supabase returns errors instead of throwing, so a save that nobody checks
 * looks exactly like a save that worked. The admin editors used to close
 * anyway, and whatever she had typed was gone (audit B5).
 *
 * A slug that is already taken is the easiest real failure to cause, and the
 * one she is most likely to meet: the column is unique.
 */
test.describe("a failed save keeps her work", () => {
  test("a blog post with a taken slug stays open, text intact, and says why", async ({ page }) => {
    const existing = await seedPost();
    const title = `Articol duplicat ${unique("b5")}`;
    try {
      await page.goto("/admin/blog");
      await page.getByRole("button", { name: "Articol Nou" }).click();
      await page.getByLabel("Titlu (RO)").fill(title);
      await page.getByLabel("Slug").fill(existing.slug);
      const body = page.getByRole("textbox", { name: "Conținut (RO)", exact: true });
      await body.click();
      await page.keyboard.type("Un text care nu trebuie pierdut.");
      await page.getByRole("button", { name: "Salvează" }).click();

      await expect(page.getByRole("region", { name: "Notificări" })).toContainText(
        "Adresa (slug-ul) e folosită deja"
      );
      await expect(page.getByRole("heading", { name: "Articol Nou" })).toBeVisible();
      await expect(page.getByLabel("Titlu (RO)")).toHaveValue(title);
      await expect(body).toContainText("Un text care nu trebuie pierdut.");
    } finally {
      await deletePostBySlug(existing.slug);
    }
  });

  test("an event with a taken slug stays open, details intact, and says why", async ({ page }) => {
    const existing = await seedEvent();
    const title = `Eveniment duplicat ${unique("b5")}`;
    try {
      await page.goto("/admin/events");
      await page.getByRole("button", { name: "Eveniment Nou" }).click();
      await page.getByLabel("Titlu (RO)").fill(title);
      await page.getByLabel("Slug").fill(existing.slug);
      await page.getByLabel("Data", { exact: true }).fill("2099-02-01");
      await page.getByRole("button", { name: "Salvează" }).click();

      await expect(page.getByRole("region", { name: "Notificări" })).toContainText(
        "Adresa (slug-ul) e folosită deja"
      );
      await expect(page.getByLabel("Titlu (RO)")).toHaveValue(title);
    } finally {
      await deleteEventBySlug(existing.slug);
    }
  });
});
