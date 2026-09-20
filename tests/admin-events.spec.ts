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
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await page.getByLabel("Ora", { exact: true }).fill("10:00");
    await page.getByLabel("Ora de final").fill("11:30");
    await page.getByLabel("Locație").fill("Cluj-Napoca");
    await page.getByLabel("Preț (0 = gratuit)").fill("0");
    await page.getByLabel("Participanți maxim").fill("10");
    await page.getByText("Publicat", { exact: true }).click();
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page).toHaveURL(/\/admin\/events$/);
    await expect(cardRow(title)).toBeVisible();
    await expect(cardRow(title)).toContainText(slug);

    /*
     * By name rather than by position. These three buttons are icon-only, and
     * the waiting-list one only exists while somebody is on the list — so
     * "the first button" is the editor on some cards and the waiting list on
     * others. They carry the event's own title so a screen reader hears which
     * of a dozen identical rows it is on, and that is what these ask for.
     */
    await page.getByRole("button", { name: `Editează eveniment: ${title}` }).click();
    await page.getByLabel("Titlu (RO)").fill(titleEdited);
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(cardRow(titleEdited)).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: `Șterge: ${titleEdited}` }).click();
    await expect(cardRow(titleEdited)).toHaveCount(0);
  });

  /**
   * Only the start date is required. Everything else about when an event
   * happens may be left blank, because blank is a real answer: she books a
   * venue months ahead and does not yet know what time Friday begins.
   *
   * The duration field this replaces was required, and had to be — a duration
   * of nothing is not a fact about an event, it is a missing number. An end
   * date and an end time are facts that can genuinely be unknown, so they are
   * allowed to be.
   */
  test("an event saves with a date and nothing else about its timing", async ({ page }) => {
    slug = unique("eveniment-fara-ora");
    title = `Eveniment Fără Oră ${slug}`;

    await page.goto("/admin/events");
    await page.getByRole("button", { name: "Eveniment Nou" }).click();
    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await page.getByRole("button", { name: "Salvează" }).click();

    // The list entry, not the URL: the panel swaps form for list through React
    // state without navigating, so `toHaveURL` passes before the insert lands.
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    const [saved] = await eventsBySlug(slug);
    expect(saved.time, "blank is NULL, not an invented midnight").toBeNull();
    expect(saved.end_date).toBeNull();
    expect(saved.end_time).toBeNull();
  });

  /**
   * An end before its start is refused before it reaches the database, so she
   * is told which field is wrong rather than meeting a failed save.
   *
   * The constraint is the thing that actually holds — see
   * `events_end_not_before_start` — but a constraint violation surfaces as a
   * save that silently did not happen.
   */
  test("an end before the start is refused, and says so", async ({ page }) => {
    slug = unique("eveniment-final-gresit");
    title = `Eveniment Final Greșit ${slug}`;

    await page.goto("/admin/events");
    await page.getByRole("button", { name: "Eveniment Nou" }).click();

    // The message itself, not `getByRole("alert")`: Next mounts a
    // `next-route-announcer` containing a permanently present `role="alert"`
    // element, so the role matches one node on every page before this form has
    // complained about anything.
    const complaint = page.getByText("Finalul nu poate fi înaintea începutului.");
    const endDate = page.getByLabel("Data de final");

    // The form opens quiet — nothing is said until she asks for the save.
    await expect(endDate).toBeVisible();
    expect(await endDate.getAttribute("aria-invalid")).toBeNull();
    await expect(complaint).toHaveCount(0);

    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await endDate.fill("2099-01-10");
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(complaint).toBeVisible();
    await expect(endDate).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("heading", { name: "Eveniment Nou" })).toBeVisible();
    expect(await eventsBySlug(slug), "nothing was written").toHaveLength(0);

    // Correcting it clears the complaint rather than leaving it up while she
    // fixes the thing it complains about.
    await endDate.fill("2099-01-17");
    await expect(complaint).toHaveCount(0);

    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const [saved] = await eventsBySlug(slug);
    expect(saved.end_date).toBe("2099-01-17");
  });

  /**
   * Same day, end time earlier than the start: the other half of the rule, and
   * the half a date comparison alone would miss.
   */
  test("an end time before the start time on the same day is refused", async ({ page }) => {
    slug = unique("eveniment-ora-gresita");
    title = `Eveniment Oră Greșită ${slug}`;

    await page.goto("/admin/events");
    await page.getByRole("button", { name: "Eveniment Nou" }).click();
    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await page.getByLabel("Ora", { exact: true }).fill("18:00");
    await page.getByLabel("Data de final").fill("2099-01-15");
    await page.getByLabel("Ora de final").fill("17:00");
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(
      page.getByText("Finalul nu poate fi înaintea începutului.")
    ).toBeVisible();
    expect(await eventsBySlug(slug), "nothing was written").toHaveLength(0);
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
 * would reach Stripe as a negative charge, and a negative capacity is a typo
 * that would be read as sold out without ever looking like one in the form.
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

  test("a negative capacity is rejected by the database", async () => {
    const { error, slug } = await tryInsertEvent({ max_participants: -5 });
    try {
      expect(error?.message ?? "").toContain("events_capacity_non_negative");
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  /**
   * ZERO IS ALLOWED, AND USED TO BE THE THING THIS TEST FORBADE.
   *
   * It was rejected while NULL meant "unlimited", on the reasoning that a
   * capacity of zero was indistinguishable from a full event. That turned out
   * to be the wrong way round: "indistinguishable from a full event" is exactly
   * what she needs to be able to say. She fills an evening through Instagram
   * and still wants the date on the site, so somebody can take a place if one
   * frees up.
   *
   * See supabase/migrations/20260918000000_capacity_is_required.sql. What zero
   * then *does* — refuse every booking — is covered in tests/public-events.spec.ts,
   * at the API rather than here, because that is where it is enforced.
   */
  test("a capacity of zero is accepted, and means sold out", async () => {
    const { error, slug } = await tryInsertEvent({ max_participants: 0 });
    try {
      expect(error).toBeNull();
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  // NULL is still a legal value — it is what an event saved without a number
  // has. It no longer means "unlimited"; it means nothing is bookable yet.
  test("an event saved with no capacity is still accepted by the database", async () => {
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
