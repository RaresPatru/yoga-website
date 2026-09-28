import { test, expect, type Page } from "@playwright/test";
import {
  adminCreds,
  announcementById,
  clearMailbox,
  contentSnapshot,
  deleteAnnouncementsTitled,
  deleteEventBySlug,
  deleteSuppression,
  emailsTo,
  restoreContent,
  restoreTemplate,
  seedEvent,
  seedRegistrationFor,
  setMarketingConsent,
  suppressionFor,
  templateTexts,
  unique,
} from "./helpers";

/**
 * /admin/emails: the automatic emails in the order a booking lives through
 * them, the editor for each (placeholders at the caret, a live preview of the
 * real email, a test to herself), announcements from the Registrations page
 * to a report, and where replies go. Phase 7 of docs/OVERHAUL.md.
 */

const toasts = (page: Page) => page.getByRole("region", { name: "Notificări" });
const preview = (page: Page) => page.frameLocator('iframe[title="Emailul, așa cum ajunge"]');
/** A paragraph of the email in the preview (its hidden inbox line repeats the first words). */
const previewText = (page: Page, text: string | RegExp) => preview(page).locator("p", { hasText: text });
const subjectBox = (page: Page) => page.getByRole("textbox", { name: "Subiect", exact: true });
const bodyBox = (page: Page) => page.getByRole("textbox", { name: "Textul emailului" });

async function openEditor(page: Page, type: string, heading: string) {
  await page.goto(`/admin/emails/${type}`);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  // The editors are drawn once the client has run.
  await expect(subjectBox(page)).toBeVisible();
  await expect(bodyBox(page)).toBeVisible();
}

test.describe("the automatic emails", () => {
  test("are listed in the order a booking lives through them, each with when it goes", async ({ page }) => {
    await page.goto("/admin/emails");
    await expect(page.getByRole("heading", { level: 1, name: "Email-uri" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Automate" })).toHaveAttribute("aria-current", "page");

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Înscrierea",
      "Lista de așteptare",
      "Anularea",
      "După eveniment",
    ]);
    for (const [label, type] of [
      ["Confirmare înscriere", "registration_confirmation"],
      ["Confirmare plată", "payment_confirmation"],
      ["Pe lista de așteptare", "waitlist_joined"],
      ["Loc eliberat", "spot_available"],
      ["Scos de pe lista de așteptare", "waitlist_removed"],
      ["Înscriere anulată", "booking_cancelled"],
      ["Invitație la testimonial", "testimonial_request"],
      ["Testimonial: prea devreme", "review_too_early"],
    ]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", `/admin/emails/${type}`);
    }
    await expect(page.getByText("Când cineva intră pe lista de așteptare a unui eveniment complet.")).toBeVisible();
    // Where replies go is set in Conținut site, and the page links there.
    await expect(page.getByRole("link", { name: /adresa/ })).toHaveAttribute("href", "/admin/content/emails");
  });

  test("an email is edited with placeholders at the caret, and saved", async ({ page }) => {
    const before = await templateTexts("waitlist_removed");
    try {
      await openEditor(page, "waitlist_removed", "Scos de pe lista de așteptare");
      // A placeholder shows as its name, not as {{event_name}}.
      await expect(subjectBox(page)).toContainText("Eveniment");
      await expect(subjectBox(page)).not.toContainText("{{");

      await subjectBox(page).click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Nu mai ești pe listă pentru ");
      await page.getByRole("group", { name: "Inserează în subiect" }).getByRole("button", { name: "Eveniment" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Modificări nesalvate" })).toBeVisible();

      // The preview follows, filled in with a real event's name.
      await expect(page.getByText(/^Subiect: Nu mai ești pe listă pentru \S/)).toBeVisible();

      await page.getByRole("button", { name: "Salvează modificările" }).click();
      await expect(toasts(page)).toContainText("Salvat");
      expect((await templateTexts("waitlist_removed")).subject_ro).toBe("Nu mai ești pe listă pentru {{event_name}}");

      await page.reload();
      await expect(subjectBox(page)).toContainText("Nu mai ești pe listă pentru Eveniment");
    } finally {
      await restoreTemplate("waitlist_removed", before);
    }
  });

  test("the preview is the email, and a test of the text on screen goes to her", async ({ page }) => {
    const admin = adminCreds().email;
    await clearMailbox(admin);
    await openEditor(page, "booking_cancelled", "Înscriere anulată");

    await bodyBox(page).click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Ne vedem la ");
    await page.getByRole("group", { name: "Inserează în text" }).getByRole("button", { name: "Locul" }).click();
    await page.keyboard.type(" altă dată.");
    await expect(previewText(page, /Ne vedem la \S.* altă dată\./)).toBeVisible();
    // Her name at the top of the real layout.
    await expect(preview(page).getByRole("link", { name: /\S/ }).first()).toBeVisible();

    await page.getByRole("button", { name: "Trimite-mi un test" }).click();
    await expect(toasts(page)).toContainText(`Testul a plecat la ${admin}.`);
    const [test] = await emailsTo(admin);
    expect(test.Subject).toMatch(/^\[Test\] Înscriere anulată - /);
    expect(test.HTML).toMatch(/Ne vedem la [^<]+ altă dată\./);
    expect(test.Text).toMatch(/Ne vedem la .+ altă dată\./);

    // Nothing was saved, and leaving says so first.
    await page.getByRole("navigation", { name: "Secțiuni admin" }).getByRole("link", { name: "Evenimente" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Pleci fără să salvezi?");
    await dialog.getByRole("button", { name: "Pleacă fără să salvez" }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
    expect((await templateTexts("booking_cancelled")).body_ro).not.toContain("Ne vedem la");
  });

  test("English left blank goes out in Romanian, and the editor says so", async ({ page }) => {
    const before = await templateTexts("review_too_early");
    try {
      await restoreTemplate("review_too_early", { ...before, subject_en: null, body_en: null });
      await page.goto("/admin/emails");
      await expect(
        page.getByRole("listitem").filter({ hasText: "Testimonial: prea devreme" }).getByText("În engleză pleacă textul în română.")
      ).toBeVisible();

      await openEditor(page, "review_too_early", "Testimonial: prea devreme");
      await page.locator("label").filter({ hasText: /^EN/ }).click();
      await expect(page.getByText("Gol: se trimite textul în română.").first()).toBeVisible();
      await expect(previewText(page, "Mulțumim că vrei să scrii")).toBeVisible();
    } finally {
      await restoreTemplate("review_too_early", before);
    }
  });
});

test.describe("announcements", () => {
  const SUBJECT = "Anunț admin E2E";
  test.afterAll(async () => {
    await deleteAnnouncementsTitled(SUBJECT);
  });

  test("from the people ticked in Registrations to a report of who it reached", async ({ page }) => {
    const event = await seedEvent({ max_participants: 10 });
    const tag = unique("t");
    const yes = `da-${tag}@example.com`;
    const no = `nu-${tag}@example.com`;
    try {
      const booking = await seedRegistrationFor(event.id, { email: yes, full_name: "Ana Acceptă" });
      await setMarketingConsent(booking, new Date(Date.now() - 60_000));
      await seedRegistrationFor(event.id, { email: no, full_name: "Ion Refuză" });
      await clearMailbox(yes);
      await clearMailbox(no);

      await page.goto(`/admin/registrations?event=${event.id}`);
      await expect(page.getByRole("list", { name: "Participanți" }).getByRole("listitem")).toHaveCount(2);
      await page.getByLabel("Selectează toți de pe pagină").check();
      await page.getByRole("toolbar", { name: "Acțiuni pentru selecție" }).getByRole("button", { name: "Scrie un anunț" }).click();
      await expect(page).toHaveURL(/\/admin\/emails\/announcements\/[0-9a-f-]{36}$/);

      const audience = page.getByRole("region", { name: "Destinatari" });
      await expect(audience).toContainText("2 rânduri alese din Înscrieri.");
      await expect(audience).toContainText("Îl va primi o persoană.");
      await expect(audience).toContainText("O persoană rămâne pe dinafară.");
      await audience.getByText("Vezi cine").click();
      await expect(audience.getByRole("listitem").filter({ hasText: "Ion Refuză" })).toContainText("N-a acceptat anunțuri");

      await subjectBox(page).click();
      await page.keyboard.type(`${SUBJECT} ${tag}`);
      await bodyBox(page).click();
      await page.keyboard.type("Salut ");
      await page.getByRole("group", { name: "Inserează în text" }).getByRole("button", { name: "Nume" }).click();
      await page.keyboard.type(", avem vești.");
      await expect(previewText(page, "Salut Ana Acceptă, avem vești.")).toBeVisible();

      await page.getByRole("button", { name: "Trimite anunțul" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Destinatari: 1, dintre care 1 în română și 0 în engleză.");
      await dialog.getByRole("button", { name: "Trimite acum" }).click();
      await expect(toasts(page)).toContainText("Anunțul a plecat la o persoană.");

      await expect(page.getByRole("heading", { level: 1, name: `${SUBJECT} ${tag}` })).toBeVisible();
      await expect(page.getByText("A ajuns la o persoană.")).toBeVisible();
      await expect(page.getByText("O persoană a rămas pe dinafară.")).toBeVisible();

      const [message] = await emailsTo(yes);
      expect(message.HTML).toContain("Salut Ana Acceptă, avem vești.");
      expect(await emailsTo(no, 1, 1500)).toHaveLength(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a draft can be deleted, and a sent one goes to the history", async ({ page }) => {
    await page.goto("/admin/emails?tab=announcements");
    await page.getByRole("button", { name: "Anunț nou" }).first().click();
    await expect(page).toHaveURL(/\/admin\/emails\/announcements\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    await expect(page.getByRole("region", { name: "Destinatari" })).toContainText(
      "Toți cei care au acceptat anunțuri, de la orice eveniment."
    );

    await page.getByRole("button", { name: "Șterge ciorna" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Șterge ciorna" }).click();
    await expect(page).toHaveURL(/\/admin\/emails\?tab=announcements$/);
    expect(await announcementById(id)).toBeNull();
  });
});

test.describe("where replies go", () => {
  test("is set in Conținut site, and a typo is pointed out", async ({ page }) => {
    const before = await contentSnapshot("email.reply_to");
    try {
      await page.goto("/admin/content/emails");
      const field = page.getByLabel("Răspunsurile ajung la");
      await field.fill("ana@exemplu");
      await expect(page.getByText("Nu pare o adresă de email.")).toBeVisible();
      await field.fill("ana.raspunsuri@example.com");
      await expect(page.getByText("Nu pare o adresă de email.")).toHaveCount(0);
      await page.getByRole("button", { name: "Salvează modificările" }).click();
      await expect(toasts(page)).toContainText("Salvat");

      await page.goto("/admin/emails");
      await expect(page.getByText("răspunsurile ajung la ana.raspunsuri@example.com.")).toBeVisible();
    } finally {
      await restoreContent("email.reply_to", before);
    }
  });
});

test.describe("stopping announcements to one person", () => {
  test("she can stop them for someone who asked another way", async ({ page }) => {
    const event = await seedEvent({ max_participants: 5 });
    const email = `stop-${unique("s")}@example.com`;
    try {
      const booking = await seedRegistrationFor(event.id, { email, full_name: "Maria Oprește" });
      await setMarketingConsent(booking, new Date(Date.now() - 60_000));

      await page.goto(`/admin/registrations?p=${booking}`);
      const panel = page.getByRole("dialog", { name: /Maria Oprește/ });
      await expect(panel).toContainText("Vrea să afle de evenimentele viitoare");
      await panel.getByRole("button", { name: "Oprește anunțurile către această persoană" }).click();
      await page.getByRole("dialog", { name: "Oprești anunțurile către această persoană?" }).getByRole("button", { name: "Oprește anunțurile către această persoană" }).click();
      await expect(toasts(page)).toContainText("Nu mai primește anunțuri.");
      await expect(panel).toContainText("S-a dezabonat de la anunțuri.");
      expect((await suppressionFor(email))?.reason).toBe("admin");
    } finally {
      await deleteEventBySlug(event.slug);
      await deleteSuppression(email);
    }
  });
});
