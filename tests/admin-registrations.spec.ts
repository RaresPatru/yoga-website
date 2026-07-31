import { test, expect } from "@playwright/test";
import { loginAsAdmin, seedRegistration, deleteEventBySlug } from "./helpers";

test.describe("admin registrations", () => {
  let eventSlug = "";

  test.afterEach(async () => {
    if (eventSlug) await deleteEventBySlug(eventSlug);
  });

  test("lists seeded registrations and filters by search", async ({ page }) => {
    const reg = await seedRegistration();
    eventSlug = reg.eventSlug;

    await loginAsAdmin(page);
    await page.goto("/admin/registrations");

    await expect(page.getByRole("heading", { name: "Înscrieri" })).toBeVisible();
    const search = page.getByPlaceholder("Caută după nume sau email...");
    await expect(search).toBeVisible();

    const card = page.getByText(reg.fullName);
    await expect(card).toBeVisible();

    await search.fill(reg.email.slice(0, 12));
    await expect(card).toBeVisible();

    await search.fill("zzz-nu-exista-xyz");
    await expect(card).toHaveCount(0);
  });
});
