import { test, expect } from "@playwright/test";
import {
  deleteEventBySlug,
  deleteWhatsappLink,
  eventsBySlug,
  seedWaitingEntry,
  seedEvent,
  tryInsertEvent,
  unique,
  anonStorageClient,
} from "./helpers";

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

/**
 * Money guards, asserted against the database rather than the form.
 *
 * The admin panel writes to Supabase straight from the browser, so `min="0"` on
 * an input is advice to the person typing and nothing more — anyone holding an
 * admin session can POST whatever they like to PostgREST. A negative price
 * would reach Stripe as a negative charge, and a capacity of zero or less makes
 * `taken >= max_participants` true for every event, marking the whole calendar
 * sold out.
 *
 * So these go through the same client the panel uses and assert the write is
 * refused. Testing the form's `min` attribute would prove only that the
 * attribute is spelled correctly.
 */
test.describe("event money and capacity constraints", () => {
  test("a negative price is rejected by the database", async () => {
    const { error, slug } = await tryInsertEvent({ price: -50 });
    try {
      expect(error?.message ?? "").toContain("events_price_non_negative");
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  test("a negative or zero capacity is rejected by the database", async () => {
    for (const capacity of [-5, 0]) {
      const { error, slug } = await tryInsertEvent({ max_participants: capacity });
      try {
        expect(
          error?.message ?? "",
          `max_participants=${capacity} should be refused`
        ).toContain("events_capacity_positive");
      } finally {
        await deleteEventBySlug(slug);
      }
    }
  });

  // NULL still means "no limit" — the constraint must not have taken that away.
  test("an unlimited event is still allowed", async () => {
    const { error, slug } = await tryInsertEvent({ max_participants: null });
    try {
      expect(error).toBeNull();
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  test("only the four supported currencies are accepted", async () => {
    const bad = await tryInsertEvent({ currency: "XYZ" });
    try {
      expect(bad.error?.message ?? "").toContain("events_currency_supported");
    } finally {
      await deleteEventBySlug(bad.slug);
    }

    for (const currency of ["RON", "EUR", "USD", "GBP"]) {
      const ok = await tryInsertEvent({ currency, price: 80 });
      try {
        expect(ok.error, `${currency} should be accepted`).toBeNull();
      } finally {
        await deleteEventBySlug(ok.slug);
      }
    }
  });

  // Existing rows predate the column, so the default is what keeps every event
  // that was created before this migration rendering a price at all.
  test("currency defaults to RON", async () => {
    const { slug } = await tryInsertEvent({ price: 100 });
    try {
      const rows = await eventsBySlug(slug);
      expect(rows[0]?.currency).toBe("RON");
    } finally {
      await deleteEventBySlug(slug);
    }
  });
});

/**
 * The saved WhatsApp link library.
 *
 * A WhatsApp invite URL is a capability — anyone holding it can join the group
 * — so unlike almost every other table on this site there is no public read
 * policy, and the check below is that an anonymous caller really is refused.
 */
test.describe("saved WhatsApp links", () => {
  test("an admin can save a link and use it on an event", async ({ page }) => {
    const label = unique("Grup");
    const url = `https://chat.whatsapp.com/${unique("invite")}`;

    await page.goto("/admin/events");
    await page.getByRole("button", { name: "Eveniment Nou" }).click();

    const linkField = page.getByLabel("Link WhatsApp");
    await linkField.fill(url);

    await page.getByRole("button", { name: "Gestionează linkurile salvate" }).click();
    const dialog = page.locator("dialog[open]");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Denumire").fill(label);
    await dialog.getByRole("button", { name: "Salvează linkul" }).click();
    await expect(dialog.getByText(label)).toBeVisible();

    // Clearing the field and picking the saved link must put it back.
    await dialog.getByRole("button", { name: "Închide" }).click();
    await linkField.fill("");
    await page.getByRole("button", { name: "Gestionează linkurile salvate" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Folosește" }).first().click();
    await expect(linkField).toHaveValue(url);

    await deleteWhatsappLink(label);
  });

  test("the link library is not readable anonymously", async () => {
    const client = await anonStorageClient();
    const { data, error } = await client.from("whatsapp_links").select("*");

    // A hard permission error, not an empty list. There is no GRANT for anon,
    // and Postgres refuses before RLS is even consulted — which is the failure
    // mode you want, because RLS on its own filters silently and an empty
    // result is indistinguishable from "there is nothing here".
    expect(error, "anon must be refused outright").not.toBeNull();
    expect(data).toBeNull();
  });
});
