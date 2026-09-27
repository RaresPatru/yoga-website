import { test, expect } from "@playwright/test";
import {
  bucharestDate,
  contentSnapshot,
  emailsTo,
  insertReviewLink,
  putContent,
  restoreContent,
  reviewLinksFor,
  unique,
  deleteEventBySlug,
  registrationById,
  seedEvent,
  seedRegistrationFor,
  seedWaitingRow,
  waitingEntry,
  waitingListFor,
} from "./helpers";

/**
 * The daily job: /api/cron/daily, which Vercel calls once a day (vercel.json)
 * and which runs daily_cleanup() in
 * supabase/migrations/20260928000000_participants.sql.
 *
 * The route is on the open internet, so the first thing proved is that only a
 * caller holding CRON_SECRET gets anything done. Then what it does: notes go
 * 30 days after the event, not before, and a checkout nobody finished goes
 * after a week, putting back in line anyone who had claimed that seat.
 */

const secret = () => process.env.CRON_SECRET!;
const DAY_MS = 24 * 60 * 60 * 1000;

test.describe("the daily job", () => {
  test("refuses a call without the secret, or with the wrong one", async ({ request }) => {
    expect((await request.get("/api/cron/daily")).status()).toBe(401);
    const wrong = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${secret()}x` } });
    expect(wrong.status()).toBe(401);
    const bare = await request.get("/api/cron/daily", { headers: { Authorization: secret() } });
    expect(bare.status()).toBe(401);
  });

  test("clears notes 30 days after the event, and not a day before", async ({ request }) => {
    // Ended 31 days ago, and 29 days ago (one-day events with no end hour end
    // at midnight after their day, so the day itself is a day earlier).
    const old = await seedEvent({ date: bucharestDate(-32), time: null });
    const recent = await seedEvent({ date: bucharestDate(-29), time: "10:00" });
    const note = { participant_note: "Genunchiul stâng.", note_consent_at: new Date().toISOString(), admin_note: "Saltea groasă." };
    try {
      const oldBooking = await seedRegistrationFor(old.id, note);
      const recentBooking = await seedRegistrationFor(recent.id, note);
      const oldWaiting = await seedWaitingRow(old.id, note);

      const response = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${secret()}` } });
      expect(response.status()).toBe(200);
      const result = await response.json();
      expect(result.notes_cleared).toBeGreaterThanOrEqual(2);

      const cleared = await registrationById(oldBooking);
      expect(cleared?.participant_note).toBeNull();
      expect(cleared?.admin_note).toBeNull();
      // The record that they consented stays.
      expect(cleared?.note_consent_at).not.toBeNull();

      const kept = await registrationById(recentBooking);
      expect(kept?.participant_note).toBe("Genunchiul stâng.");
      expect(kept?.admin_note).toBe("Saltea groasă.");

      const [waiting] = (await waitingListFor(old.id)).filter((w) => w.id === oldWaiting);
      expect(waiting.participant_note).toBeNull();
      expect(waiting.admin_note).toBeNull();
    } finally {
      await deleteEventBySlug(old.slug);
      await deleteEventBySlug(recent.slug);
    }
  });

  test("deletes a checkout left unpaid for a week and puts its claimer back in line", async ({ request }) => {
    const event = await seedEvent({ price: 100 });
    try {
      const stale = await seedRegistrationFor(event.id, {
        payment_status: "pending",
        created_at: new Date(Date.now() - 8 * DAY_MS).toISOString(),
      });
      const fresh = await seedRegistrationFor(event.id, {
        payment_status: "pending",
        created_at: new Date(Date.now() - 2 * DAY_MS).toISOString(),
      });
      const claimer = await seedWaitingRow(event.id, {
        claimed_at: new Date(Date.now() - 8 * DAY_MS).toISOString(),
        claimed_registration_id: stale,
        notified_at: new Date(Date.now() - 8 * DAY_MS).toISOString(),
        claim_expires_at: new Date(Date.now() - 7 * DAY_MS).toISOString(),
      });

      const response = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${secret()}` } });
      expect(response.status()).toBe(200);
      expect((await response.json()).abandoned_removed).toBeGreaterThanOrEqual(1);

      expect(await registrationById(stale)).toBeNull();
      // Two days is inside the week a late payment can still arrive in.
      expect(await registrationById(fresh)).not.toBeNull();

      const back = await waitingEntry(claimer);
      expect(back.claimed_at).toBeNull();
      expect(back.notified_at).toBeNull();
      expect(back.claim_expires_at).toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("the daily job and testimonials", () => {
  const run = (request: import("@playwright/test").APIRequestContext) =>
    request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${secret()}` } });

  test("the morning after, the people who came get a link, once", async ({ request }) => {
    const ended = await seedEvent({ date: bucharestDate(-1), time: "10:00" });
    const longAgo = await seedEvent({ date: bucharestDate(-10), time: "10:00" });
    const came = `${unique("came")}@example.com`;
    const refunded = `${unique("refunded")}@example.com`;
    const earlier = `${unique("earlier")}@example.com`;
    try {
      await seedRegistrationFor(ended.id, { email: came, full_name: "Maria Venită" });
      await seedRegistrationFor(ended.id, { email: refunded, payment_status: "refunded" });
      await seedRegistrationFor(longAgo.id, { email: earlier });

      const response = await run(request);
      expect(response.status()).toBe(200);
      expect((await response.json()).review_invitations.invited).toBeGreaterThanOrEqual(1);

      const [invitation] = await emailsTo(came);
      expect(invitation.HTML).toContain("/ro/testimonials/write?token=");
      expect(await emailsTo(refunded, 1, 1500), "a refunded booking is not invited").toHaveLength(0);
      expect(await emailsTo(earlier, 1, 1500), "an event over a week ago is not").toHaveLength(0);

      // A second morning sends nobody a second link.
      await run(request);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await emailsTo(came)).toHaveLength(1);
    } finally {
      await deleteEventBySlug(ended.slug);
      await deleteEventBySlug(longAgo.slug);
    }
  });

  test("sends nothing when she has turned invitations off", async ({ request }) => {
    const before = await contentSnapshot("testimonials.invitations");
    const ended = await seedEvent({ date: bucharestDate(-1), time: "10:00" });
    const email = `${unique("off")}@example.com`;
    try {
      await putContent("testimonials.invitations", "off");
      await seedRegistrationFor(ended.id, { email });
      const response = await run(request);
      expect((await response.json()).review_invitations).toMatchObject({ invited: 0, off: true });
      expect(await emailsTo(email, 1, 1500)).toHaveLength(0);
    } finally {
      await restoreContent("testimonials.invitations", before);
      await deleteEventBySlug(ended.slug);
    }
  });

  test("deletes links once they have lapsed", async ({ request }) => {
    const event = await seedEvent({ date: bucharestDate(-5), time: "10:00" });
    try {
      const booking = await seedRegistrationFor(event.id);
      await insertReviewLink(booking, unique("lapsed-link-0123456789"), new Date(Date.now() - 1000));
      await insertReviewLink(booking, unique("live-link-0123456789"), new Date(Date.now() + 86_400_000));
      const response = await run(request);
      expect((await response.json()).review_links_expired).toBeGreaterThanOrEqual(1);
      expect(await reviewLinksFor(booking)).toHaveLength(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
