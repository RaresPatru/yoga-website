import { test, expect, type Page } from "@playwright/test";
import {
  bucharestDate,
  deleteEventBySlug,
  deleteEventsTitled,
  deletePostById,
  deleteWhatsappLink,
  eventById,
  eventDraft,
  eventsBySlug,
  eventsTitled,
  publishEventDraftAs,
  seedEvent,
  seedPost,
  seedRegistrationFor,
  seedWaitingEntry,
  tryInsertEvent,
  unique,
  anonStorageClient,
  waitingEntry,
} from "./helpers";

/**
 * The events list (/admin/events) and the event editor (/admin/events/new,
 * /admin/events/<id>): tabs, rows that open like a post's, and the numbers
 * that open their people; autosave
 * once an event has a title and a date; an end before its start refused on
 * its own; a live event's changes private until published, with new places
 * offered to the waiting list; an ended event's date, price and places
 * locked; Back, Delete and Preview.
 *
 * Events the editor creates are cleaned up by the marker in their title.
 */

const status = (page: Page) => page.locator("[data-save-status]");
const titleField = (page: Page) => page.getByLabel("Titlu (RO)", { exact: true });

/** Waits for the description's toolbar, which proves the client has loaded the event. */
async function openEditor(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Îngroșat" }).first()).toBeVisible();
}

test.describe("the event editor", () => {
  const marker = unique("ev-editor");
  test.afterEach(async () => deleteEventsTitled(marker));

  test("a new event saves once it has a title and a date, then publishes and stays in the editor", async ({ page }) => {
    await openEditor(page, "/admin/events/new");
    await expect(status(page)).toHaveText("Se salvează singur când are titlu și dată");

    await titleField(page).fill(`${marker} Yoga la lac`);
    // Longer than autosave's pause, and still nothing: it has no date yet, and
    // a date is not something to invent.
    await page.waitForTimeout(2500);
    expect(await eventsTitled(marker)).toHaveLength(0);

    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await expect(status(page)).toHaveText("Salvat");
    await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);
    const [created] = await eventsTitled(marker);
    expect(created.slug).toBe(`${marker}-yoga-la-lac`);
    expect(created.published).toBe(false);
    // Blank is NULL, not an invented midnight or a guessed end.
    expect(created.time).toBeNull();
    expect(created.end_date).toBeNull();
    expect(created.end_time).toBeNull();

    await page.getByLabel("Ora", { exact: true }).fill("10:00");
    await page.getByLabel("Locație").fill("Cluj-Napoca");
    await page.getByLabel("Participanți maxim").fill("10");
    await page.getByRole("button", { name: "Publică", exact: true }).click();

    const toasts = page.getByRole("region", { name: "Notificări" });
    await expect(toasts).toContainText("Eveniment publicat");
    await expect(page.getByRole("button", { name: "Publicat" })).toBeDisabled();
    await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]{36}$/);

    const [published] = await eventsTitled(marker);
    expect(published.published).toBe(true);
    expect(published.max_participants).toBe(10);
    await page.goto(`/ro/events/${published.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: `${marker} Yoga la lac` })).toBeVisible();
  });

  /**
   * An end before its start is refused on its own: the field says so, and
   * everything else keeps saving. The database refuses it too
   * (`events_ends_after_start`), but a refused save says nothing about which
   * of four fields is wrong.
   */
  test("an end before the start is refused and says so, and the rest still saves", async ({ page }) => {
    await openEditor(page, "/admin/events/new");
    const complaint = page.getByText("Finalul nu poate fi înaintea începutului.");
    const endDate = page.getByLabel("Data de final");

    // The form opens quiet.
    await expect(endDate).toBeVisible();
    expect(await endDate.getAttribute("aria-invalid")).toBeNull();
    await expect(complaint).toHaveCount(0);

    await titleField(page).fill(`${marker} Final greșit`);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await endDate.fill("2099-01-10");
    await expect(complaint).toBeVisible();
    await expect(endDate).toHaveAttribute("aria-invalid", "true");
    await expect(status(page)).toHaveText("Salvat");
    let [saved] = await eventsTitled(marker);
    expect(saved.end_date, "the impossible end was not written").toBeNull();

    // Correcting it clears the complaint and saves the end.
    await endDate.fill("2099-01-17");
    await expect(complaint).toHaveCount(0);
    await expect(status(page)).toHaveText("Salvat");
    await expect.poll(async () => (await eventsTitled(marker))[0]?.end_date).toBe("2099-01-17");
    [saved] = await eventsTitled(marker);
    expect(saved.date).toBe("2099-01-15");
  });

  test("an end time before the start time is refused when the end date is blank", async ({ page }) => {
    await openEditor(page, "/admin/events/new");
    await titleField(page).fill(`${marker} Oră greșită`);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await page.getByLabel("Ora", { exact: true }).fill("18:00");
    await page.getByLabel("Ora de final").fill("10:00");

    await expect(page.getByText("Finalul nu poate fi înaintea începutului.")).toBeVisible();
    await expect(status(page)).toHaveText("Salvat");
    const [saved] = await eventsTitled(marker);
    expect(saved.end_time).toBeNull();
    expect(saved.time).toBeNull();
  });

  test("Back with nothing written leaves nothing behind", async ({ page }) => {
    await openEditor(page, "/admin/events/new");
    await titleField(page).fill(`${marker} De șters`);
    await page.getByLabel("Data", { exact: true }).fill("2099-01-15");
    await expect(status(page)).toHaveText("Salvat");
    const id = page.url().split("/").pop()!;
    expect(await eventById(id)).not.toBeNull();

    await titleField(page).fill("");
    // The editor's own Back, in its bar; the sidebar has an "Evenimente" too.
    await page.getByRole("main").getByRole("link", { name: "Evenimente", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    expect(await eventById(id)).toBeNull();
  });

  test("Delete, from the menu, asks first", async ({ page }) => {
    const event = await seedEvent({ title_ro: `${marker} Ciornă de șters`, published: false });
    await openEditor(page, `/admin/events/${event.id}`);
    await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
    await page.getByRole("menuitem", { name: "Șterge evenimentul" }).click();
    await page
      .getByRole("dialog", { name: "Sigur dorești să ștergi acest eveniment?" })
      .getByRole("button", { name: "Șterge" })
      .click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    expect(await eventById(event.id)).toBeNull();
  });
});

test.describe("a published event", () => {
  const marker = unique("ev-live");
  test.afterEach(async () => deleteEventsTitled(marker));

  test("changes stay private until published, and new places go to the waiting list", async ({ page, browser }) => {
    const original = `${marker} Seară plină`;
    const changed = `${original} (schimbat)`;
    const event = await seedEvent({ title_ro: original, max_participants: 0, price: 0 });
    const waiting = await seedWaitingEntry(event.id, "none");

    await openEditor(page, `/admin/events/${event.id}`);
    await expect(page.getByRole("button", { name: "Publicat" })).toBeDisabled();
    await titleField(page).fill(changed);
    await page.getByLabel("Participanți maxim").fill("1");
    await expect(status(page)).toHaveText("Salvat");

    // Saved, and private: the draft has it, the event and its page do not.
    expect((await eventDraft(event.id))?.title_ro).toBe(changed);
    expect((await eventById(event.id))?.title_ro).toBe(original);
    const visitor = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    await visitor.goto(`/ro/events/${event.slug}`);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(original);
    expect((await waitingEntry(waiting)).notified_at, "nobody is offered a seat that is not published").toBeNull();

    await page.getByRole("button", { name: "Publică modificările" }).click();
    const toasts = page.getByRole("region", { name: "Notificări" });
    await expect(toasts).toContainText("Modificări publicate");
    // The new place went to the front of the queue, and she is told.
    await expect(toasts).toContainText("Linkuri de rezervare trimise către lista de așteptare: 1.");
    expect((await waitingEntry(waiting)).notified_at).not.toBeNull();
    expect(await eventDraft(event.id)).toBeNull();

    await visitor.reload();
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(changed);
    await visitor.close();
  });

  test("Preview shows the unpublished version, and books nobody", async ({ page }) => {
    const event = await seedEvent({ title_ro: `${marker} Previzualizat` });
    const changed = `${marker} Previzualizat (nou)`;
    await openEditor(page, `/admin/events/${event.id}`);
    await titleField(page).fill(changed);

    await page.getByRole("button", { name: "Previzualizare" }).click();
    const frame = page.getByRole("dialog", { name: "Previzualizare" }).frameLocator("iframe");
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(changed);
    await expect(frame.getByText("Previzualizare. Vizitatorii nu văd încă versiunea aceasta.")).toBeVisible();
    // The booking panel is drawn as visitors see it, and inert.
    await expect(frame.locator("[inert]")).toHaveCount(1);
  });

  test("once it has ended, its date, price and places are locked, here and in the database", async ({ page }) => {
    const event = await seedEvent({ title_ro: `${marker} Încheiat`, date: bucharestDate(-3), price: 50 });
    await openEditor(page, `/admin/events/${event.id}`);
    await expect(page.getByText(/Evenimentul s-a încheiat\. Data, orele, prețul și locurile/)).toBeVisible();
    await expect(page.getByLabel("Data", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Participanți maxim")).toBeDisabled();
    await expect(page.getByLabel("Preț (0 = gratuit)")).toBeDisabled();
    // What she can still fix, she can.
    await expect(titleField(page)).toBeEnabled();

    // And the rule itself: publishing changes leaves them alone.
    await publishEventDraftAs(event.id, { date: "2099-01-01", price: 999, title_ro: `${marker} Încheiat, redenumit` });
    const after = await eventById(event.id);
    expect(after?.date).toBe(bucharestDate(-3));
    expect(after?.price).toBe(50);
    expect(after?.title_ro).toBe(`${marker} Încheiat, redenumit`);
  });
});

test.describe("the events list", () => {
  const marker = unique("ev-lista");
  const slugs: string[] = [];
  test.afterAll(async () => {
    for (const slug of slugs) await deleteEventBySlug(slug);
  });

  test("tabs sort events by their state, and each number opens its people", async ({ page }) => {
    const upcoming = await seedEvent({ title_ro: `${marker} Urmează`, price: 100 });
    const draft = await seedEvent({ title_ro: `${marker} Ciornă`, published: false });
    const archived = await seedEvent({ title_ro: `${marker} Arhivat`, date: bucharestDate(-5) });
    const pending = await seedEvent({ title_ro: `${marker} Plată restantă`, date: bucharestDate(-5), price: 100 });
    slugs.push(upcoming.slug, draft.slug, archived.slug, pending.slug);
    await seedWaitingEntry(upcoming.id, "none");
    await seedRegistrationFor(upcoming.id, { payment_status: "pending" });
    // A checkout still inside its hour, on an event that is over.
    await seedRegistrationFor(pending.id, { payment_status: "pending" });

    const rows = page.locator("main li").filter({ has: page.locator("a[href^='/admin/events/']") });
    await page.goto(`/admin/events?q=${encodeURIComponent(marker)}`);
    // Upcoming holds what can still need her: the event to come, and the one
    // that is over with a payment pending.
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Plată restantă" })).toContainText("Încheiat, ceva în așteptare");
    await expect(rows.filter({ hasText: "Plată restantă" })).toContainText("1 plată în așteptare");
    // Once it is over, its waiting list is not news.
    await expect(rows.filter({ hasText: "Plată restantă" }).getByText(/pe lista de așteptare/)).toHaveCount(0);

    const tabs = page.getByRole("navigation", { name: "Evenimente după stare" });
    await tabs.getByRole("link", { name: /^Ciorne/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Ciornă");
    await tabs.getByRole("link", { name: /^Trecute/ }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Arhivat");

    // The waiting list, from the upcoming event's row, to its people.
    await tabs.getByRole("link", { name: /^Următoare/ }).click();
    const waitlist = rows.filter({ hasText: `${marker} Urmează` }).getByRole("link", { name: "1 pe lista de așteptare" });
    await expect(waitlist).toHaveAttribute("href", `/admin/registrations?event=${upcoming.id}&status=waitlist`);
    await waitlist.click();
    await expect(page.getByText("Eveniment: " + `${marker} Urmează`)).toBeVisible();
    await expect(page.getByText(/^Așteptare E2E/)).toHaveCount(1);
  });

  /**
   * The order menu opens as a list the page draws, with the panel's rounded
   * corners, wherever the browser allows it (Chromium, with a mouse). A list
   * drawn that way sizes the closed control to the chosen order, so the page
   * fixes its width: otherwise a shorter order would shrink it and pull the
   * search box sideways.
   */
  test("the order menu names each direction, keeps its width, and opens a rounded list", async ({ page }) => {
    await page.goto("/admin/events");
    const order = page.getByLabel("Ordine");
    const widths = new Set<number>();
    for (const label of [
      "Data evenimentului, crescător",
      "Data evenimentului, descrescător",
      "Editate recent",
      "Titlu, de la A la Z",
    ]) {
      await order.selectOption({ label });
      await expect(order.locator("option:checked")).toHaveText(label);
      widths.add(Math.round((await order.boundingBox())!.width));
    }
    expect(widths.size).toBe(1);

    const corners = await order.evaluate((el) =>
      CSS.supports("appearance", "base-select") ? getComputedStyle(el, "::picker(select)").borderRadius : null
    );
    if (corners !== null) expect(corners).toBe("16px");
  });

  /**
   * An event's row cannot be one link, as a post's is, because its numbers
   * are links of their own; the title's link is stretched over the row
   * instead. This holds it to the post list's behaviour: the same colour
   * under the pointer, anywhere on the row opens the event, and over a
   * number it is the number that answers.
   */
  test("the whole row opens the event and lights up as a post's row does", async ({ page }) => {
    const event = await seedEvent({ title_ro: `${marker} Rând întreg` });
    slugs.push(event.slug);
    await seedWaitingEntry(event.id, "none");
    const post = await seedPost({ title_ro: `${marker} Rând de articol` });

    try {
      await page.goto(`/admin/blog?q=${encodeURIComponent(marker)}`);
      const postRow = page.locator("main li a[href^='/admin/blog/']");
      await postRow.hover();
      await page.waitForTimeout(300); // past its 150ms colour transition
      const lit = await postRow.evaluate((el) => getComputedStyle(el).backgroundColor);

      await page.goto(`/admin/events?q=${encodeURIComponent(`${marker} Rând întreg`)}`);
      const row = page.locator("main li").filter({ has: page.locator("a[href^='/admin/events/']") });
      await expect(row).toHaveCount(1);
      const background = () => row.evaluate((el) => getComputedStyle(el).backgroundColor);
      const resting = await background();
      expect(resting).not.toBe(lit);

      // A point on the right, over the status: outside the title's link, but
      // on the layer it stretches over the row.
      const box = (await row.boundingBox())!;
      const right = { x: box.width - 40, y: 20 };
      await row.hover({ position: right });
      await expect.poll(background).toBe(lit);

      await row.getByRole("link", { name: "1 pe lista de așteptare" }).hover();
      await expect.poll(background).toBe(resting);

      // From the keyboard, the ring goes round the whole row.
      await page.getByPlaceholder("Caută după titlu, loc sau adresă").focus();
      await page.keyboard.press("Tab"); // the order
      await page.keyboard.press("Tab"); // the row
      await expect(row.locator("[data-row-link]")).toBeFocused();
      expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");

      await row.click({ position: right });
      await expect(page).toHaveURL(new RegExp(`/admin/events/${event.id}$`));
    } finally {
      await deletePostById(post.id);
    }
  });
});

test.describe("when an event starts and ends", () => {
  test("they are instants in Bucharest time, daylight saving included", async () => {
    const summer = await seedEvent({ date: "2099-07-01", time: "10:00", end_time: "12:30", published: false });
    const winter = await seedEvent({ date: "2099-01-15", time: "10:00", end_time: null, published: false });
    try {
      const [s] = await eventsBySlug(summer.slug);
      expect(new Date(s.starts_at).toISOString()).toBe("2099-07-01T07:00:00.000Z");
      expect(new Date(s.ends_at).toISOString()).toBe("2099-07-01T09:30:00.000Z");

      const [w] = await eventsBySlug(winter.slug);
      expect(new Date(w.starts_at).toISOString()).toBe("2099-01-15T08:00:00.000Z");
      // No end time: it runs to midnight after its last day.
      expect(new Date(w.ends_at).toISOString()).toBe("2099-01-15T22:00:00.000Z");
    } finally {
      await deleteEventBySlug(summer.slug);
      await deleteEventBySlug(winter.slug);
    }
  });

  test("nothing can write them directly", async () => {
    const { error, slug } = await tryInsertEvent({ ends_at: "2099-01-01T00:00:00Z" });
    try {
      expect(error?.message ?? "").toContain("ends_at");
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  test("the database refuses an event that ends before it starts", async () => {
    // One day, no end date, and an end time before the start time.
    const { error, slug } = await tryInsertEvent({ time: "18:00", end_time: "10:00" });
    try {
      expect(error?.message ?? "").toContain("events_ends_after_start");
    } finally {
      await deleteEventBySlug(slug);
    }
  });
});

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

    await openEditor(page, "/admin/events/new");

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
