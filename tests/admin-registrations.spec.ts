import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import {
  bucharestDate,
  deleteEventBySlug,
  deleteParticipantsAsAdmin,
  emailsTo,
  participantRow,
  registrationById,
  seedEvent,
  seedManyRegistrations,
  seedRegistrationFor,
  seedWaitingRow,
  unique,
  waitingEntry,
} from "./helpers";

/**
 * /admin/registrations: bookings and the waiting list on one list, with
 * Active and Archive tabs, search, filters from the address, the participant
 * panel, the actions that change a booking, deleting from the archive, and
 * export. Phase 5 of docs/OVERHAUL.md.
 */

const slugs: string[] = [];
test.afterEach(async () => {
  while (slugs.length) await deleteEventBySlug(slugs.pop()!);
});

async function event(overrides: Record<string, unknown> = {}) {
  const e = await seedEvent(overrides);
  slugs.push(e.slug);
  return e;
}

const rows = (page: Page) => page.getByRole("list", { name: "Participanți" }).getByRole("listitem");
const panel = (page: Page) => page.getByRole("dialog");

/** Waits for the list to show, which also proves the admin's messages loaded. */
async function open(page: Page, address: string) {
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1, name: "Înscrieri" })).toBeVisible();
}

test.describe("the participants list", () => {
  test("holds bookings and the waiting list, found by name, email, phone or event", async ({ page }) => {
    const e = await event({ max_participants: 1 });
    const marker = unique("Țurcanu");
    const booked = await seedRegistrationFor(e.id, {
      full_name: `Ioana ${marker}`,
      phone: "+40 733 444 555",
      email: `${marker.toLowerCase()}@example.com`,
    });
    await seedWaitingRow(e.id, { full_name: `Mara ${marker}` });

    await open(page, `/admin/registrations?event=${e.id}`);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: `Ioana ${marker}` }).getByText("Gratuit")).toBeVisible();
    await expect(rows(page).filter({ hasText: `Mara ${marker}` }).getByText("Pe lista de așteptare")).toBeVisible();

    const search = page.getByPlaceholder("Caută după nume, email, telefon sau eveniment");
    // Without diacritics, as people type on a phone.
    await search.fill(`ioana ${marker.replace("Ț", "t").toLowerCase()}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(`Ioana ${marker}`);

    // A phone number as she would write it, with the national 0.
    await search.fill("0733 444");
    await expect(rows(page)).toHaveCount(1);

    await search.fill(`${marker.toLowerCase()}@exam`);
    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/q=/);

    // The event's title finds everyone on it.
    await search.fill(`Eveniment E2E ${e.slug}`);
    await expect(rows(page)).toHaveCount(2);
    expect(booked).toBeTruthy();
  });

  test("the address narrows the list to one event's group, as its number counts", async ({ page }) => {
    const e = await event({ price: 100 });
    const pending = `Plată restantă ${unique("p")}`;
    const paid = `Plătit ${unique("p")}`;
    await seedRegistrationFor(e.id, { payment_status: "pending", full_name: pending });
    await seedRegistrationFor(e.id, { payment_status: "completed", full_name: paid });

    await open(page, `/admin/registrations?event=${e.id}&status=pending`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText(pending);
    await expect(page.getByLabel("Stare")).toHaveValue("pending");

    await page.getByRole("link", { name: "Șterge filtrele" }).click();
    await expect(page).toHaveURL(/\/admin\/registrations$/);
    await expect(page.getByLabel("Stare")).toHaveValue("");
  });

  test("an ended event's people and cancelled bookings are in the archive, and only there can be deleted", async ({ page }) => {
    const past = await event({ date: bucharestDate(-3), time: "10:00" });
    const upcoming = await event();
    const ended = await seedRegistrationFor(past.id, { full_name: `Trecut ${unique("a")}` });
    const cancelled = await seedRegistrationFor(upcoming.id, {
      full_name: `Anulat ${unique("a")}`,
      removed_at: new Date().toISOString(),
      removal_reason: "Test",
    });
    const active = await seedRegistrationFor(upcoming.id, { full_name: `Activ ${unique("a")}` });

    expect((await participantRow(ended))?.archived).toBe(true);
    expect((await participantRow(cancelled))?.archived).toBe(true);
    expect((await participantRow(active))?.archived).toBe(false);

    // The database refuses to delete someone who is not archived, whatever it is sent.
    expect(await deleteParticipantsAsAdmin([active])).toBe(0);
    expect(await registrationById(active)).not.toBeNull();

    await open(page, `/admin/registrations?event=${past.id}`);
    await expect(rows(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Arhivă\s*1/ })).toBeVisible();
    // No deleting from the Active tab, even with a row ticked.
    await page.goto(`/admin/registrations?event=${upcoming.id}`);
    await rows(page).first().getByRole("checkbox").check();
    await expect(page.getByRole("toolbar").getByRole("button", { name: "Șterge definitiv" })).toHaveCount(0);

    await open(page, `/admin/registrations?event=${past.id}&tab=archive`);
    await rows(page).first().getByRole("checkbox").check();
    await page.getByRole("toolbar").getByRole("button", { name: "Șterge definitiv" }).click();
    await expect(page.getByRole("dialog")).toContainText("Ștergi definitiv o persoană?");
    await page.getByRole("dialog").getByRole("button", { name: "Șterge definitiv" }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Șterse definitiv: 1.");
    expect(await registrationById(ended)).toBeNull();
  });

  test("ticks everyone who matches, across pages", async ({ page }) => {
    const e = await event({ max_participants: 100 });
    await seedManyRegistrations(e.id, 51, `Mulți ${unique("m")}`);

    await open(page, `/admin/registrations?event=${e.id}`);
    await expect(rows(page)).toHaveCount(50);
    await page.getByLabel("Selectează toți de pe pagină").check();
    await expect(page.getByText("Toți cei 50 de pe această pagină sunt selectați.")).toBeVisible();
    await page.getByRole("button", { name: "Selectează toți cei 51" }).click();
    await expect(page.getByRole("toolbar")).toContainText("Selectați: 51");

    // Exported, the selection is all 51 and a header row.
    const download = page.waitForEvent("download");
    await page.getByRole("toolbar").getByRole("button", { name: "Exportă selecția" }).click();
    await page.getByRole("menuitem", { name: "CSV (.csv)" }).click();
    const csv = readFileSync(await (await download).path(), "utf8");
    expect(csv.trim().split("\r\n")).toHaveLength(52);

    // Changing the filter lets go of the selection.
    await page.getByLabel("Stare").selectOption("paid");
    await expect(page.getByRole("toolbar")).toHaveCount(0);
  });
});

test.describe("the participant panel", () => {
  test("shows their note with its consent, keeps her note, and lists their other events", async ({ page }) => {
    const e = await event();
    const other = await event({ date: bucharestDate(-20), title_ro: `Altul ${unique("x")}` });
    const email = `${unique("panel")}@example.com`;
    const id = await seedRegistrationFor(e.id, {
      full_name: "Elena Panou",
      email,
      locale: "en",
      participant_note: "Am o alergie la lavandă.",
      note_consent_at: new Date().toISOString(),
      marketing_consent_at: new Date().toISOString(),
    });
    await seedRegistrationFor(other.id, { full_name: "Elena Panou", email });

    await open(page, `/admin/registrations?event=${e.id}`);
    await rows(page).first().getByRole("link", { name: "Elena Panou" }).click();
    await expect(page).toHaveURL(new RegExp(`p=${id}`));
    await expect(panel(page).getByRole("heading", { name: "Elena Panou" })).toBeVisible();
    await expect(panel(page)).toContainText("pe site-ul în engleză");
    await expect(panel(page)).toContainText("Am o alergie la lavandă.");
    await expect(panel(page)).toContainText("Acord pentru păstrare dat pe");
    await expect(panel(page)).toContainText("Vrea să afle de evenimentele viitoare");
    await expect(panel(page).getByRole("link", { name: /Scrie-i pe WhatsApp/ })).toHaveAttribute(
      "href",
      "https://wa.me/40721112233"
    );
    await expect(panel(page)).toContainText("2 evenimente cu acest email");

    await panel(page).getByLabel("Nota ta").fill("A plătit cash la fața locului.");
    await expect(panel(page).getByText("Salvat")).toBeVisible();
    expect((await registrationById(id))?.admin_note).toBe("A plătit cash la fața locului.");

    // Escape closes it, and the address forgets it.
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page).not.toHaveURL(/p=/);
  });

  test("cancelling a booking asks why, emails them in their language, and offers the seat on", async ({ page }) => {
    const e = await event({ max_participants: 1 });
    const email = `${unique("cancel")}@example.com`;
    const waitingEmail = `${unique("next")}@example.com`;
    const id = await seedRegistrationFor(e.id, { full_name: "Radu Anulare", email, locale: "en" });
    const next = await seedWaitingRow(e.id, { full_name: "Primul la rând", email: waitingEmail });

    await open(page, `/admin/registrations?p=${id}`);
    await panel(page).getByRole("button", { name: "Anulează înscrierea" }).click();
    const dialog = page.getByRole("dialog", { name: "Anulezi înscrierea?" });
    await expect(dialog).toContainText("Radu Anulare");
    await dialog.getByLabel("Motivul (îl vezi doar tu)").fill("A cerut să se retragă.");
    await dialog.getByLabel("Trimite-i un email că înscrierea a fost anulată").check();
    await dialog.getByRole("button", { name: "Anulează înscrierea" }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Înscrierea a fost anulată.");

    const row = await registrationById(id);
    expect(row?.removed_at).not.toBeNull();
    expect(row?.removal_reason).toBe("A cerut să se retragă.");

    const [cancelled] = await emailsTo(email);
    expect(cancelled.Subject).toBe(`Booking cancelled - E2E Event ${e.slug}`);
    expect(cancelled.HTML).not.toContain("A cerut să se retragă.");

    // The freed seat went to the front of the waiting list.
    expect((await waitingEntry(next)).notified_at).not.toBeNull();
    const [offer] = await emailsTo(waitingEmail);
    expect(offer.Subject).toContain("S-a eliberat un loc");
  });

  test("marks a refund as asked for, and then as made", async ({ page }) => {
    const e = await event({ price: 150 });
    const id = await seedRegistrationFor(e.id, { full_name: "Plătitor Rambursare", payment_status: "completed" });

    await open(page, `/admin/registrations?p=${id}`);
    await panel(page).getByRole("button", { name: "Marchează rambursarea cerută" }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Cererea de rambursare e notată.");
    await expect(panel(page).getByText("Rambursare cerută", { exact: true })).toBeVisible();
    expect((await registrationById(id))?.refund_requested_at).not.toBeNull();

    await panel(page).getByRole("button", { name: "Marchează ca rambursat" }).click();
    await page.getByRole("dialog", { name: "Marchezi rambursarea ca făcută?" }).getByRole("button", { name: "Marchează ca rambursat" }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Marcat ca rambursat.");
    expect((await registrationById(id))?.payment_status).toBe("refunded");
  });
});

test.describe("exporting", () => {
  test("CSV opens in Excel with its letters and without live formulas; Excel gets a real workbook", async ({ page }) => {
    const e = await event();
    await seedRegistrationFor(e.id, { full_name: '=HYPERLINK("http://evil.example","Ștefan")' });
    await seedRegistrationFor(e.id, {
      full_name: "Ana Notă",
      participant_note: "Informație medicală.",
      note_consent_at: new Date().toISOString(),
    });

    await open(page, `/admin/registrations?event=${e.id}`);
    await expect(rows(page)).toHaveCount(2);

    const exportAs = async (item: string) => {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Exportă" }).first().click();
      await page.getByRole("menuitem", { name: item }).click();
      return download;
    };

    const csvFile = await exportAs("CSV (.csv)");
    expect(csvFile.suggestedFilename()).toMatch(/^participanti-eveniment-e2e-.*\.csv$/);
    const csv = readFileSync(await csvFile.path(), "utf8");
    expect(csv.charCodeAt(0), "a byte-order mark, so Excel reads UTF-8").toBe(0xfeff);
    expect(csv).toContain('"Nume";"Email";"Telefon"');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""Ștefan"")"`);
    expect(csv).not.toContain("Informație medicală.");

    const xlsxFile = await exportAs("Excel (.xlsx)");
    expect(xlsxFile.suggestedFilename()).toMatch(/\.xlsx$/);
    const files = unzipSync(new Uint8Array(readFileSync(await xlsxFile.path())));
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("=HYPERLINK(&quot;http://evil.example&quot;,&quot;Ștefan&quot;)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("Ana Notă");
    expect(sheet).not.toContain("Informație medicală.");
  });
});
