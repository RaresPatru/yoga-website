import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  adminAccessToken,
  announcementById,
  announcementRecipients,
  clearMailbox,
  deleteAnnouncementsTitled,
  deleteEventBySlug,
  deleteSuppression,
  emailHeaders,
  emailsTo,
  putRecipients,
  seedAnnouncement,
  seedEvent,
  seedRegistrationFor,
  setMarketingConsent,
  suppress,
  suppressionFor,
  unique,
} from "./helpers";

/**
 * Announcements (lib/announcements.ts): who receives one, and unsubscribing.
 *
 * Only people who ticked "send me news" on some booking receive one, and not
 * if they unsubscribed since (unless they ticked it again later). Every one
 * carries its own unsubscribe link and the headers mail apps use for their
 * one-click Unsubscribe; pressing either puts the address on the suppression
 * list, and the next announcement leaves it out.
 *
 * Sent through the admin's own route, with her token, and read from the
 * local mailbox.
 */

const SUBJECT = "Anunț E2E";
const DAY = 24 * 60 * 60 * 1000;

const send = async (request: APIRequestContext, id: string, retry = false) => {
  const response = await request.post(`/api/admin/announcements/${id}/send`, {
    headers: { Authorization: `Bearer ${await adminAccessToken()}` },
    data: { retry },
  });
  return { status: response.status(), body: await response.json() };
};

test.describe("announcements", () => {
  test.afterAll(async () => {
    await deleteAnnouncementsTitled(SUBJECT);
  });

  test("only people who opted in receive one, each in their language, and nobody who unsubscribed", async ({ request }) => {
    const event = await seedEvent({ max_participants: 20 });
    const tag = unique("a");
    const addr = (who: string) => `${who}-${tag}@example.com`;
    const now = Date.now();
    try {
      const yes = await seedRegistrationFor(event.id, { email: addr("yes"), full_name: "Ana Da" });
      const no = await seedRegistrationFor(event.id, { email: addr("no"), full_name: "Ion Nu" });
      const stopped = await seedRegistrationFor(event.id, { email: addr("stopped"), full_name: "Radu Oprit" });
      const english = await seedRegistrationFor(event.id, { email: addr("english"), full_name: "Sophie English", locale: "en" });
      const again = await seedRegistrationFor(event.id, { email: addr("again"), full_name: "Maria Iar" });

      await setMarketingConsent(yes, new Date(now - 5 * DAY));
      await setMarketingConsent(stopped, new Date(now - 5 * DAY));
      await suppress(addr("stopped"), new Date(now - 2 * DAY));
      await setMarketingConsent(english, new Date(now - 5 * DAY));
      // Unsubscribed, then ticked the box again on a later booking: a new yes.
      await suppress(addr("again"), new Date(now - 4 * DAY));
      await setMarketingConsent(again, new Date(now - 1 * DAY));
      for (const who of ["yes", "no", "stopped", "english", "again"]) await clearMailbox(addr(who));

      const id = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${tag}`,
        subject_en: `E2E announcement ${tag}`,
        body_ro: "<p>Salut {{user_name}}, avem un eveniment nou.</p>",
        body_en: "<p>Hello {{user_name}}, there is a new event.</p>",
        audience: { kind: "ids", ids: [yes, no, stopped, english, again] },
      });

      const { status, body } = await send(request, id);
      expect(status).toBe(200);
      expect(body).toEqual({ sent: 3, failed: 0, excluded: 2 });

      const [ro] = await emailsTo(addr("yes"));
      expect(ro.Subject).toBe(`${SUBJECT} ${tag}`);
      expect(ro.HTML).toContain("Salut Ana Da, avem un eveniment nou.");
      expect(ro.Text).toContain("Dezabonare: ");
      const [en] = await emailsTo(addr("english"));
      expect(en.Subject).toBe(`E2E announcement ${tag}`);
      expect(en.HTML).toContain("Hello Sophie English");
      expect(await emailsTo(addr("again")), "a newer yes counts again").toHaveLength(1);
      expect(await emailsTo(addr("no"), 1, 1500), "never opted in").toHaveLength(0);
      expect(await emailsTo(addr("stopped"), 1, 1500), "unsubscribed").toHaveLength(0);

      const recipients = await announcementRecipients(id);
      const reason = (email: string) => recipients.find((r) => r.email === email)?.reason;
      expect(reason(addr("no"))).toBe("no_consent");
      expect(reason(addr("stopped"))).toBe("unsubscribed");

      const row = await announcementById(id);
      expect(row?.status).toBe("sent");
      expect(row?.sent_count).toBe(3);

      // Sent once only.
      expect((await send(request, id)).status).toBe(409);
    } finally {
      await deleteEventBySlug(event.slug);
      for (const who of ["stopped", "again", "yes"]) await deleteSuppression(addr(who));
    }
  });

  test("one click from the mail app unsubscribes, and the next announcement leaves them out", async ({ request }) => {
    const event = await seedEvent({ max_participants: 5 });
    const email = `click-${unique("u")}@example.com`;
    try {
      const booking = await seedRegistrationFor(event.id, { email, full_name: "Click Once" });
      await setMarketingConsent(booking, new Date(Date.now() - DAY));
      await clearMailbox(email);

      const first = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${unique("one")}`,
        body_ro: "<p>Primul.</p>",
        audience: { kind: "filter", filters: { tab: "active", status: null, eventId: event.id, q: "" } },
      });
      expect((await send(request, first)).body.sent).toBe(1);

      const [message] = await emailsTo(email);
      const headers = await emailHeaders(message.ID);
      expect(headers["List-Unsubscribe-Post"]).toEqual(["List-Unsubscribe=One-Click"]);
      const oneClick = headers["List-Unsubscribe"][0].match(/<([^>]+)>/)![1];
      expect(oneClick).toMatch(/\/api\/unsubscribe\?token=[\w-]{40,}$/);

      // What Gmail and Apple Mail send when their Unsubscribe is pressed.
      const response = await request.post(new URL(oneClick).pathname + new URL(oneClick).search, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: "List-Unsubscribe=One-Click",
      });
      expect(response.status()).toBe(200);
      const suppressed = await suppressionFor(email);
      expect(suppressed?.reason).toBe("unsubscribed");
      expect(suppressed?.announcement_id).toBe(first);

      await clearMailbox(email);
      const second = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${unique("two")}`,
        body_ro: "<p>Al doilea.</p>",
        audience: { kind: "filter", filters: { tab: "active", status: null, eventId: event.id, q: "" } },
      });
      const { status, body } = await send(request, second);
      expect(status, "nobody left to send to").toBe(409);
      expect(body.code).toBe("nobody");
      expect((await announcementById(second))?.status, "it stays a draft").toBe("draft");
      expect(await emailsTo(email, 1, 1500)).toHaveLength(0);
    } finally {
      await deleteEventBySlug(event.slug);
      await deleteSuppression(email);
    }
  });

  /**
   * A send can stop halfway (the function's time limit, a network failure),
   * and a batch can fail at Resend. Every recipient is marked as it goes, so
   * trying again reaches only the ones that did not get it, and a send that
   * has not moved for ten minutes can be taken over. One still moving cannot.
   */
  test("failed ones are tried again, and a send that stopped carries on, without writing to anyone twice", async ({ request }) => {
    const event = await seedEvent({ max_participants: 10 });
    const tag = unique("r");
    const people = ["first", "second", "third"].map((who) => ({ email: `${who}-${tag}@example.com`, full_name: `Persoana ${who}` }));
    const audience = { kind: "filter", filters: { tab: "active", status: null, eventId: event.id, q: "" } };
    const clearAll = async () => {
      for (const person of people) await clearMailbox(person.email);
    };
    try {
      for (const person of people) {
        const booking = await seedRegistrationFor(event.id, person);
        await setMarketingConsent(booking, new Date(Date.now() - DAY));
      }
      await clearAll();

      // Tried again: one of three came back failed.
      const retried = await seedAnnouncement({ subject_ro: `${SUBJECT} ${tag} a`, body_ro: "<p>Din nou.</p>", audience });
      expect((await send(request, retried)).body.sent).toBe(3);
      await putRecipients(retried, [{ ...people[1], status: "failed", reason: "validation_error: test" }]);
      await clearAll();
      const again = await send(request, retried, true);
      expect(again.status).toBe(200);
      expect(again.body).toEqual({ sent: 3, failed: 0, excluded: 0 });
      expect(await emailsTo(people[1].email)).toHaveLength(1);
      expect(await emailsTo(people[0].email, 1, 1500), "not written to twice").toHaveLength(0);
      expect(await emailsTo(people[2].email, 1, 1500)).toHaveLength(0);

      // Carried on: stopped eleven minutes ago with two still pending.
      await clearAll();
      const stopped = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${tag} b`,
        body_ro: "<p>Continuare.</p>",
        audience,
        status: "sending",
        send_started_at: new Date(Date.now() - 11 * 60_000).toISOString(),
      });
      await putRecipients(stopped, [
        { ...people[0], status: "sent" },
        { ...people[1], status: "pending" },
        { ...people[2], status: "pending" },
      ]);
      const resumed = await send(request, stopped);
      expect(resumed.status).toBe(200);
      expect(resumed.body).toEqual({ sent: 3, failed: 0, excluded: 0 });
      expect(await emailsTo(people[1].email)).toHaveLength(1);
      expect(await emailsTo(people[2].email)).toHaveLength(1);
      expect(await emailsTo(people[0].email, 1, 1500), "already had it").toHaveLength(0);

      // Still moving: left alone.
      const moving = await seedAnnouncement({
        subject_ro: `${SUBJECT} ${tag} c`,
        body_ro: "<p>În curs.</p>",
        audience,
        status: "sending",
        send_started_at: new Date().toISOString(),
      });
      const busy = await send(request, moving);
      expect(busy.status).toBe(409);
      expect(busy.body.code).toBe("busy");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an unknown unsubscribe link changes nothing", async ({ request }) => {
    const response = await request.post("/api/unsubscribe?token=not-a-real-token-but-long-enough-0000", {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: "List-Unsubscribe=One-Click",
    });
    expect(response.status()).toBe(404);
  });

  test("an announcement without its Romanian text is not sent", async ({ request }) => {
    const id = await seedAnnouncement({ subject_ro: `${SUBJECT} ${unique("empty")}`, body_ro: "<p></p>" });
    const { status, body } = await send(request, id);
    expect(status).toBe(400);
    expect(body.code).toBe("empty");
    expect((await announcementById(id))?.status).toBe("draft");
  });

  test("only the administrator may send one", async ({ request }) => {
    const id = await seedAnnouncement({ subject_ro: `${SUBJECT} ${unique("anon")}`, body_ro: "<p>X</p>" });
    expect((await request.post(`/api/admin/announcements/${id}/send`, { data: {} })).status()).toBe(401);
    const forged = await request.post(`/api/admin/announcements/${id}/send`, {
      headers: { Authorization: "Bearer not-a-real-token" },
      data: {},
    });
    expect(forged.status()).toBe(401);
    expect((await announcementById(id))?.status).toBe("draft");
  });
});
