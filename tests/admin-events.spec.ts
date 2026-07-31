import { test, expect } from "@playwright/test";
import { loginAsAdmin, deleteEventBySlug, seedWaitingEntry, seedEvent, unique } from "./helpers";

test.describe("admin events CRUD", () => {
  let slug = "";
  let title = "";

  test.afterEach(async () => {
    if (slug) await deleteEventBySlug(slug);
  });

  test("creates, edits and deletes an event", async ({ page }) => {
    slug = unique("eveniment-admin");
    title = `Eveniment Admin ${slug}`;
    const titleEdited = `${title} (modificat)`;

    const cardRow = (headingText: string) =>
      page
        .getByRole("heading", { name: headingText })
        .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]");

    await loginAsAdmin(page);
    await page.goto("/admin/events");

    await page.getByRole("button", { name: "Eveniment Nou" }).click();
    await expect(page.getByRole("heading", { name: "Eveniment Nou" })).toBeVisible();
    await expect(page.getByRole("button", { name: "→ EN" }).first()).toBeVisible();

    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Data").fill("2099-01-15");
    await page.getByLabel("Ora").fill("10:00");
    await page.getByLabel("Locație").fill("Cluj-Napoca");
    await page.getByLabel("Preț (0 = gratuit)").fill("0");
    await page.getByLabel("Participanți maxim").fill("10");
    await page.getByText("Publicat", { exact: true }).click();
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(cardRow(title)).toBeVisible();
    await expect(cardRow(title)).toContainText(slug);

    await cardRow(title).getByRole("button").first().click();
    await page.getByLabel("Titlu (RO)").fill(titleEdited);
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(cardRow(titleEdited)).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await cardRow(titleEdited).getByRole("button").nth(1).click();
    await expect(cardRow(titleEdited)).toHaveCount(0);
  });

  test("waiting list modal shows seeded entries and closes", async ({ page }) => {
    const event = await seedEvent({ published: false });
    slug = event.slug;
    title = `Eveniment E2E ${event.slug}`;
    await seedWaitingEntry(event.id);

    const cardRow = (headingText: string) =>
      page
        .getByRole("heading", { name: headingText })
        .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]");

    await loginAsAdmin(page);
    await page.goto("/admin/events");

    const row = cardRow(title);
    await expect(row).toBeVisible();
    await expect(row).toContainText("În așteptare: 1");

    await row.getByRole("button").first().click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Lista de așteptare" })).toBeVisible();
    await expect(dialog).toContainText("Așteptare E2E");

    await dialog.getByRole("button", { name: "Închide" }).click();
    await expect(dialog).not.toBeVisible();
  });
});
