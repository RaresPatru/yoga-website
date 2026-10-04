import { test, expect } from "@playwright/test";
import {
  contentSnapshot,
  deleteEventBySlug,
  emailsTo,
  putContent,
  restoreContent,
  seedEvent,
  seedRegistrationFor,
  unique,
} from "./helpers";

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

/**
 * Every email is drawn in one layout and sent the same way (lib/email.ts,
 * lib/email-layout.ts): from her site's name rather than whatever name the
 * sending address carries, with replies going to her own address (audit I13),
 * and with a plain-text version beside the HTML.
 */
test.describe("who an email is from", () => {
  test("it carries her site's name, replies go to her, and it has a text version", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("from")}@example.com`;
    const before = await contentSnapshot("email.reply_to");
    const siteName = (await contentSnapshot("general.site_name"))?.value_ro || "localhost:3100";
    try {
      await putContent("email.reply_to", "ea@example.com");
      expect((await book(request, event.id, email, "ro")).status()).toBe(200);

      const [message] = await emailsTo(email);
      expect(message.From.Name).toBe(siteName);
      expect(message.ReplyTo.map((r) => r.Address)).toEqual(["ea@example.com"]);
      // The layout: her name at the top, the button for the event's page.
      expect(message.HTML).toContain(`>${siteName}</a>`);
      // Mail carries its text with CRLF line endings.
      expect(message.Text.replace(/\r\n/g, "\n").startsWith(`${siteName}\n\n`)).toBe(true);
      expect(message.Text).toContain("Te-ai înscris cu succes la Eveniment E2E");
      expect(message.Text, "no markup in the text version").not.toMatch(/<[a-z]/i);
    } finally {
      await restoreContent("email.reply_to", before);
      await deleteEventBySlug(event.slug);
    }
  });

  test("an event without a WhatsApp group sends no empty WhatsApp line", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5, whatsapp_group_link: null });
    const email = `${unique("wa")}@example.com`;
    try {
      expect((await book(request, event.id, email, "ro")).status()).toBe(200);
      const [message] = await emailsTo(email);
      expect(message.HTML).not.toContain("WhatsApp");
      expect(message.Text).not.toContain("WhatsApp");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("the waiting list", () => {
  test("joining it sends a confirmation in the page's language", async ({ request }) => {
    const event = await seedEvent({ max_participants: 1 });
    const email = `${unique("wl")}@example.com`;
    try {
      await seedRegistrationFor(event.id);
      const response = await request.post("/api/register/waiting-list", {
        data: {
          eventId: event.id,
          fullName: "Waiting Person",
          email,
          phone: "+40721112233",
          captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
          locale: "en",
        },
      });
      expect(response.status()).toBe(200);

      const [message] = await emailsTo(email);
      expect(message.Subject).toBe(`You are on the waiting list - E2E Event ${event.slug}`);
      expect(message.HTML).toContain("You are on the waiting list for");
      expect(message.Text).toContain("The link in that email is valid for 24 hours.");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
