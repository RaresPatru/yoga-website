import { test, expect } from "@playwright/test";
import {
  adminAccessToken,
  bucharestDate,
  seedEvent,
  deleteEventBySlug,
  deleteRegistration,
  seedWaitingEntry,
  seedRegistrationFor,
  registrationsFor,
  waitingEntry,
} from "./helpers";
import { sessionsFor } from "./stripe-helpers";

/**
 * The claim flow: someone on a waiting list is emailed a link when a seat frees
 * up, and follows it back to the event page with ?claim=<id>.
 *
 * None of this had any coverage, and two of the four cases below were outright
 * broken: an expired link worked forever, and a paid event handed over a free
 * seat.
 */
test.describe("waiting-list claim", () => {
  test("a valid link inside the window claims the seat", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 2 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");

      await page.goto(`/ro/events/${event.slug}?claim=${entryId}`);

      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an expired link is refused and explains why", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 2 });
    try {
      const entryId = await seedWaitingEntry(event.id, "expired");

      await page.goto(`/ro/events/${event.slug}?claim=${entryId}`);

      // Previously this claimed the seat regardless of age — the 24-hour window
      // was written into the database and the email, but never checked.
      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeHidden();
      await expect(page.getByText(/Linkul a expirat/)).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an entry that was never notified cannot be used as a token", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 2 });
    try {
      // On the list, but no seat has opened and no email has gone out. Holding
      // this id must not be enough to claim.
      const entryId = await seedWaitingEntry(event.id, "none");

      await page.goto(`/ro/events/${event.slug}?claim=${entryId}`);

      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeHidden();
      await expect(page.getByText(/Link invalid sau expirat/)).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * Somebody booked the seat before the waitlisted person pressed their link.
   * First come, first served (Rares' rule): they are told so with an apology,
   * not an "invalid link", and their offer is withdrawn so they are waiting
   * again, in the order they joined, which makes them first for the next seat.
   */
  test("a seat someone else booked first gets an apology, and they stay first in line", async ({ page, request }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    try {
      const stranger = await seedRegistrationFor(event.id);
      const first = await seedWaitingEntry(event.id, "open");
      const second = await seedWaitingEntry(event.id, "none");

      await page.goto(`/ro/events/${event.slug}?claim=${first}`);
      await expect(page.getByRole("heading", { name: "Ne pare rău, locul a fost ocupat" })).toBeVisible();
      await expect(page.getByText(/Îți păstrezi locul în fruntea listei/)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeHidden();

      const after = await waitingEntry(first);
      expect(after.claimed_at).toBeNull();
      expect(after.claim_expires_at, "the lost offer no longer holds a place").toBeNull();

      // The seat comes back; the next offer is theirs, not the one behind them.
      await deleteRegistration(stranger);
      const token = await adminAccessToken();
      const res = await request.post("/api/admin/events/notify-waiting-list", {
        headers: { Authorization: `Bearer ${token}` },
        data: { eventId: event.id },
      });
      expect((await res.json()).notified).toBe(1);
      expect((await waitingEntry(first)).notified_at).not.toBeNull();
      expect((await waitingEntry(second)).notified_at).toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a link is refused once the event has started", async ({ page }) => {
    const event = await seedEvent({
      price: 0,
      max_participants: 5,
      date: bucharestDate(-1),
      time: "10:00",
      end_date: bucharestDate(1),
    });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");
      await page.goto(`/ro/events/${event.slug}?claim=${entryId}`);
      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeHidden();
      expect(await registrationsFor(event.id)).toHaveLength(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("waiting-list claim API", () => {
  /*
   * The suite's stand-in for Stripe (tests/fake-stripe.ts) answers now, so
   * the paid claim runs to the end instead of stopping at a placeholder key
   * (audit T2). What it must do: a pending booking, never a free one, and a
   * checkout in the event's own currency (audit B1).
   */
  test("a paid event never yields a free seat, and charges in the event's currency", async ({ request }) => {
    const event = await seedEvent({ price: 80, currency: "EUR", max_participants: 2 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");

      const res = await request.post(`/api/register/claim-spot/${entryId}`, { data: { locale: "en" } });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.checkoutUrl).toContain("/pay/cs_");

      const seats = await registrationsFor(event.id);
      expect(seats.map((s) => s.payment_status), "claiming a paid event must never create a free registration").toEqual([
        "pending",
      ]);

      const [session] = await sessionsFor(seats[0].id);
      expect(session.currency).toBe("eur");
      expect(session.amount_total).toBe(8000);
      expect(session.locale).toBe("en");
      expect((await waitingEntry(entryId)).claimed_at).not.toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("pressed again after turning back at Stripe, it returns to the same checkout", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 2 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");
      const first = await (await request.post(`/api/register/claim-spot/${entryId}`, { data: { locale: "ro" } })).json();
      const again = await request.post(`/api/register/claim-spot/${entryId}`, { data: { locale: "ro" } });
      expect(again.status()).toBe(200);
      expect((await again.json()).checkoutUrl, "the same payment page, not a second one").toBe(first.checkoutUrl);
      expect(await registrationsFor(event.id)).toHaveLength(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("someone who already has a seat is told so, and leaves the waiting list", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 3 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");
      const entry = await waitingEntry(entryId);
      await seedRegistrationFor(event.id, { email: entry.email });

      const res = await request.post(`/api/register/claim-spot/${entryId}`, { data: { locale: "ro" } });
      expect(res.status()).toBe(409);
      expect((await res.json()).code).toBe("already_registered");
      expect((await waitingEntry(entryId)).removed_at, "off the list: it could only offer a second seat").not.toBeNull();
      expect(await registrationsFor(event.id)).toHaveLength(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
