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
  test("a paid event never yields a free seat", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 2 });
    try {
      const entryId = await seedWaitingEntry(event.id, "open");

      const res = await request.post(`/api/register/claim-spot/${entryId}`);
      const body = await res.json().catch(() => ({}));

      // Asserted as an invariant rather than as one specific response, because
      // the outcome legitimately depends on whether Stripe is reachable:
      //
      //   configured   -> 200 with a checkout URL
      //   placeholder  -> 502, seat released, claim link still unspent
      //
      // What must be true either way is that nobody gets in for nothing. The
      // old code created a 'free' registration whatever the price, so everyone
      // on a paid event's waiting list was admitted without paying.
      if (res.status() === 200) {
        expect(body.checkoutUrl).toContain("stripe.com");
      } else {
        expect(res.status()).toBe(502);
      }

      const seats = await registrationsFor(event.id);
      expect(
        seats.filter((s) => s.payment_status === "free"),
        "claiming a paid event must never create a free registration"
      ).toHaveLength(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
