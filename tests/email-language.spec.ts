import { test, expect } from "@playwright/test";
import { deleteEventBySlug, emailsTo, seedEvent, unique } from "./helpers";

/**
 * Emails answer in the language the person booked in, with dates written the
 * way people read them (audit B15), and they reach the local mailbox rather
 * than Resend when the site runs on the local database (audit S6).
 *
 * Booked through the API with the Turnstile test keys, the way the form does.
 */

const book = (request: import("@playwright/test").APIRequestContext, eventId: string, email: string, locale: string) =>
  request.post("/api/register", {
    data: {
      eventId,
      fullName: "Participant Limbă",
      email,
      phone: "+40721112233",
      captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
      locale,
    },
  });

/** The event's date as each language's email should write it. */
function readable(date: string, locale: "ro" | "en") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

test.describe("email language", () => {
  test("an English booking gets the English confirmation, with a readable date", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("en")}@example.com`;
    try {
      const response = await book(request, event.id, email, "en");
      expect(response.status()).toBe(200);

      const [message] = await emailsTo(email);
      expect(message, "the confirmation reaches the local mailbox").toBeTruthy();
      expect(message.Subject).toBe(`Registration confirmation - E2E Event ${event.slug}`);
      expect(message.HTML).toContain("You have successfully registered");
      // The seeded event's date, as English writes it, not 2026-10-10.
      const seededDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      expect(message.HTML).toContain(readable(seededDate, "en"));
      expect(message.HTML).not.toContain(seededDate);
      // The calendar entry comes along, without markup in its description.
      expect(message.Attachments.map((a) => a.FileName)).toEqual([expect.stringMatching(/\.ics$/)]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a Romanian booking gets the Romanian confirmation", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("ro")}@example.com`;
    try {
      expect((await book(request, event.id, email, "ro")).status()).toBe(200);

      const [message] = await emailsTo(email);
      expect(message.Subject).toBe(`Confirmare înscriere - Eveniment E2E ${event.slug}`);
      expect(message.HTML).toContain("Te-ai înscris cu succes");
      const seededDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      expect(message.HTML).toContain(readable(seededDate, "ro"));
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
