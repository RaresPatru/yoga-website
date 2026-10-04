import { test, expect, type Page } from "@playwright/test";
import {
  deleteEventBySlug,
  registrationByEmail,
  seedEvent,
  seedRegistrationFor,
  unique,
  waitingListFor,
} from "./helpers";

/**
 * What the booking and waiting-list forms ask since phase 5: an optional note
 * ("Ceva ce ar trebui să știu?") that is kept only with its own consent, an
 * opt-in for news that starts unticked, a line pointing at the privacy policy,
 * and the page's language, stored with the booking so emails answer in it.
 */

async function fillDetails(page: Page, email: string, labels = { name: "Nume complet", phone: "Telefon" }) {
  // The CAPTCHA passing proves React has hydrated; a fill before that is lost.
  await expect(page.locator('[data-verified="true"]')).toBeAttached();
  await page.getByLabel(labels.name).fill("Ana Popescu");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel(labels.phone, { exact: true }).fill("0722111222");
}

test.describe("the booking form", () => {
  test("keeps a note only with consent, and stores the opt-in and the language", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("note")}@example.com`;
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await fillDetails(page, email);

      // The news box starts unticked, and the privacy policy is one link away.
      const news = page.getByLabel("Vreau să aflu prin email de evenimentele viitoare.");
      await expect(news).not.toBeChecked();
      await expect(page.getByRole("link", { name: "politica de confidențialitate" })).toHaveAttribute("href", "/ro/privacy");

      // The consent box appears only once there is a note to consent to.
      const consent = page.getByLabel(/Sunt de acord ca nota mea/);
      await expect(consent).toHaveCount(0);
      await page.getByLabel("Ceva ce ar trebui să știu?").fill("Am o accidentare la genunchi.");
      await expect(consent).not.toBeChecked();

      // Without the tick the form does not send: the box is required.
      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();
      expect(await consent.evaluate((el) => el.matches(":invalid"))).toBe(true);
      await page.waitForTimeout(500);
      expect(await registrationByEmail(email)).toBeNull();

      await consent.check();
      await news.check();
      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();
      await expect(page.getByRole("heading", { name: "Înscriere reușită!" })).toBeVisible();

      const booking = await registrationByEmail(email);
      expect(booking?.participant_note).toBe("Am o accidentare la genunchi.");
      expect(booking?.note_consent_at).not.toBeNull();
      expect(booking?.marketing_consent_at).not.toBeNull();
      expect(booking?.locale).toBe("ro");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an English booking is stored as English, without news it did not ask for", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("en")}@example.com`;
    try {
      await page.goto(`/en/events/${event.slug}`);
      await fillDetails(page, email, { name: "Full name", phone: "Phone" });
      await page.getByRole("button", { name: "Register for free" }).click();
      await expect(page.getByRole("heading", { name: "Registration successful!" })).toBeVisible();

      const booking = await registrationByEmail(email);
      expect(booking?.locale).toBe("en");
      expect(booking?.participant_note).toBeNull();
      expect(booking?.marketing_consent_at).toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the API refuses a note without consent, whatever the form did", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    try {
      const response = await request.post("/api/register", {
        data: {
          eventId: event.id,
          fullName: "Fără Acord",
          email: `${unique("nc")}@example.com`,
          phone: "+40721112233",
          note: "Sunt însărcinată.",
          captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
          locale: "ro",
        },
      });
      expect(response.status()).toBe(400);
      expect((await response.json()).code).toBe("note_needs_consent");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the waiting-list form asks the same, and stores it on the entry", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    const email = `${unique("wl")}@example.com`;
    try {
      await seedRegistrationFor(event.id);
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByRole("button", { name: "Intră pe lista de așteptare" }).click();
      await fillDetails(page, email);
      await page.getByLabel("Ceva ce ar trebui să știu?").fill("Vin cu fiica mea.");
      await page.getByLabel(/Sunt de acord ca nota mea/).check();
      await page.getByLabel("Vreau să aflu prin email de evenimentele viitoare.").check();
      await page.getByRole("button", { name: "Înscrie-te pe lista de așteptare" }).click();
      await expect(page.getByRole("heading", { name: "Listă de așteptare" })).toBeVisible();

      const [entry] = (await waitingListFor(event.id)).filter((w) => w.email === email);
      expect(entry.participant_note).toBe("Vin cu fiica mea.");
      expect(entry.note_consent_at).not.toBeNull();
      expect(entry.marketing_consent_at).not.toBeNull();
      expect(entry.locale).toBe("ro");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
