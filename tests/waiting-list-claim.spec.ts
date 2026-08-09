import { test, expect } from "@playwright/test";
import {
  seedEvent,
  deleteEventBySlug,
  seedWaitingEntry,
  seedRegistrationFor,
  registrationsFor,
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

  test("claiming a seat on a full event is refused", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    try {
      // Someone else took the last seat between the email going out and the
      // link being followed.
      await seedRegistrationFor(event.id);
      const entryId = await seedWaitingEntry(event.id, "open");

      await page.goto(`/ro/events/${event.slug}?claim=${entryId}`);

      await expect(page.getByRole("heading", { name: "Loc revendicat!" })).toBeHidden();
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
