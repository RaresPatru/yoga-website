import { test, expect } from "@playwright/test";
import { seedRegistration, seedRegistrationFor, seedEvent, deleteEventBySlug, unique } from "./helpers";

test.describe("admin registrations", () => {
  let eventSlug = "";

  test.afterEach(async () => {
    if (eventSlug) await deleteEventBySlug(eventSlug);
  });

  test("lists seeded registrations and filters by search", async ({ page }) => {
    const reg = await seedRegistration();
    eventSlug = reg.eventSlug;

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

  /**
   * Each number on an event opens this list narrowed to that event and group
   * (lib/admin/events.ts, participantsHref), counted the way the event's
   * number counts it.
   */
  test("the address narrows the list to one event's group, and clears", async ({ page }) => {
    const event = await seedEvent({ price: 100 });
    eventSlug = event.slug;
    const pending = `Plată restantă ${unique("p")}`;
    const paid = `Plătit ${unique("p")}`;
    await seedRegistrationFor(event.id, { payment_status: "pending", full_name: pending });
    await seedRegistrationFor(event.id, { payment_status: "completed", full_name: paid });

    await page.goto(`/admin/registrations?event=${event.id}&status=pending`);
    await expect(page.getByText(pending)).toBeVisible();
    await expect(page.getByText(paid)).toHaveCount(0);
    await expect(page.getByText(/^Eveniment: Eveniment E2E/)).toBeVisible();
    await expect(page.getByText("Plăți în așteptare", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Toate înscrierile" }).click();
    await expect(page).toHaveURL(/\/admin\/registrations$/);
    await expect(page.getByText(paid)).toBeVisible();
  });
});
