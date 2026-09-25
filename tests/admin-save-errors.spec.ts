import { test, expect } from "@playwright/test";
import { deleteEventBySlug, deletePostBySlug, deletePostsTitled, seedEvent, seedPost, unique } from "./helpers";

/**
 * Supabase returns errors instead of throwing, so a save that nobody checks
 * looks exactly like a save that worked. The admin editors used to close
 * anyway, and whatever she had typed was gone (audit B5).
 *
 * A slug that is already taken is the easiest real failure to cause, and the
 * one she is most likely to meet: the column is unique.
 */
test.describe("a failed save keeps her work", () => {
  test("a blog post with a taken address keeps her text, saves it, and says why", async ({ page }) => {
    const existing = await seedPost();
    const title = `Articol duplicat ${unique("b5")}`;
    try {
      await page.goto("/admin/blog/new");
      await expect(page.getByRole("button", { name: "Îngroșat" }).first()).toBeVisible();
      await page.getByLabel("Titlu (RO)", { exact: true }).fill(title);
      await page.getByRole("textbox", { name: "Adresa articolului" }).fill(existing.slug);
      const body = page.getByRole("textbox", { name: "Conținut (RO)", exact: true });
      await body.click();
      await page.keyboard.type("Un text care nu trebuie pierdut.");

      await expect(
        page.getByRole("alert").filter({ hasText: "Alt articol folosește deja adresa asta" })
      ).toBeVisible();
      await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue(title);
      await expect(page.getByRole("textbox", { name: "Adresa articolului" })).toHaveValue(existing.slug);
      await expect(body).toContainText("Un text care nu trebuie pierdut.");
      // Everything but the address reached the database.
      await expect(page.locator("[data-save-status]")).toHaveText("Salvat");
      await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/);
    } finally {
      await deletePostBySlug(existing.slug);
      await deletePostsTitled(title);
    }
  });

  test("an event with a taken slug stays open, details intact, and says why", async ({ page }) => {
    const existing = await seedEvent();
    const title = `Eveniment duplicat ${unique("b5")}`;
    try {
      await page.goto("/admin/events");
      await page.getByRole("button", { name: "Eveniment Nou" }).click();
      await page.getByLabel("Titlu (RO)", { exact: true }).fill(title);
      await page.getByLabel("Slug").fill(existing.slug);
      await page.getByLabel("Data", { exact: true }).fill("2099-02-01");
      await page.getByRole("button", { name: "Salvează" }).click();

      await expect(page.getByRole("region", { name: "Notificări" })).toContainText(
        "Adresa (slug-ul) e folosită deja"
      );
      await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue(title);
    } finally {
      await deleteEventBySlug(existing.slug);
    }
  });
});
