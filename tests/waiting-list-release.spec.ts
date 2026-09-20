import { test, expect } from "@playwright/test";
import {
  seedEvent,
  deleteEventBySlug,
  seedWaitingEntry,
  seedRegistrationFor,
  updateEventCapacity,
  adminAccessToken,
} from "./helpers";

/**
 * Releasing a waiting list by editing the event.
 *
 * WHAT THIS PROTECTS
 *
 * A capacity of NULL or 0 means sold out — see
 * 20260918000000_capacity_is_required.sql — and registration only happens on
 * this site, so a closed event has no seat for anybody to claim. The waiting
 * list is therefore a queue only she can release, by putting a number in the
 * capacity field.
 *
 * Before the route these tests cover, nothing released it. Worse, the Stripe
 * webhook emailed claim links on a refund without ever asking whether the event
 * had a seat to give, so people on a closed event's list were sent links that
 * register_for_event() then refused with a 409. The guard now lives inside
 * notifyWaitingList(), which counts free seats from `event_availability` — the
 * same view the booking gate agrees with — so a link it sends is a link the
 * claim route will honour.
 *
 * The emails themselves go nowhere here: .env.test points Resend at a
 * placeholder key and each send is caught individually, so what these assert is
 * who *would* be written to, which is the part that has been wrong.
 */
test.describe("releasing a waiting list from the admin panel", () => {
  /** POST as the logged-in administrator, the way the panel does after a save. */
  const release = async (request: import("@playwright/test").APIRequestContext, eventId: string) => {
    const response = await request.post("/api/admin/events/notify-waiting-list", {
      headers: { Authorization: `Bearer ${await adminAccessToken()}` },
      data: { eventId },
    });
    return { status: response.status(), body: await response.json() };
  };

  /*
   * The case that was sending dead links. Zero is not "no limit" and it is not
   * "one seat"; it is closed, and a queue on a closed event stays put.
   */
  test("a closed event emails nobody, however long the queue is", async ({ request }) => {
    const event = await seedEvent({ max_participants: 0 });
    try {
      await seedWaitingEntry(event.id);
      await seedWaitingEntry(event.id);

      const { status, body } = await release(request, event.id);
      expect(status).toBe(200);
      expect(body.notified, "capacity 0 has no seat to offer").toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an event with no capacity set emails nobody either", async ({ request }) => {
    const event = await seedEvent({ max_participants: null });
    try {
      await seedWaitingEntry(event.id);

      const { body } = await release(request, event.id);
      expect(body.notified, "NULL capacity is sold out, not unlimited").toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /* The point of the whole feature: she types a number and the queue moves. */
  test("putting a number in capacity releases the queue, in order", async ({ request }) => {
    const event = await seedEvent({ max_participants: 0 });
    try {
      await seedWaitingEntry(event.id);
      await seedWaitingEntry(event.id);
      await seedWaitingEntry(event.id);

      // Nothing while it is closed.
      expect((await release(request, event.id)).body.notified).toBe(0);

      // She opens two seats. Two links go out, not three.
      await updateEventCapacity(event.id, 2);
      const { body } = await release(request, event.id);
      expect(body.notified, "two seats, two of the three people waiting").toBe(2);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /*
   * Seats are counted against the people already booked, not against capacity
   * alone — otherwise lowering the number to hold a place back would read as
   * opening one.
   */
  test("a full event emails nobody even with seats on paper", async ({ request }) => {
    const event = await seedEvent({ max_participants: 2 });
    try {
      await seedRegistrationFor(event.id);
      await seedRegistrationFor(event.id);
      await seedWaitingEntry(event.id);

      const { body } = await release(request, event.id);
      expect(body.notified, "2 seats and 2 taken is 0 free").toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /*
   * The panel fires this after every save, so saving four times in a minute
   * must not email the same person four times. An entry holding a claim link
   * that has not lapsed is skipped.
   */
  /**
   * Never more live claim links than seats — across calls, not just within one.
   *
   * The batch limit alone does not give this, and the panel calls the route
   * after every save. Two seats and three people waiting: the first save offers
   * to two, and a second save used to offer to the third, because nobody had
   * written to *them* yet. Three live links, two seats, and whoever acted last
   * met the booking gate's refusal — the dead link this whole guard exists to
   * prevent, arriving by a different route.
   */
  test("a second save does not promise a seat that is already promised", async ({ request }) => {
    const event = await seedEvent({ max_participants: 0 });
    try {
      await seedWaitingEntry(event.id);
      await seedWaitingEntry(event.id);
      await seedWaitingEntry(event.id);

      await updateEventCapacity(event.id, 2);
      expect((await release(request, event.id)).body.notified).toBe(2);

      expect(
        (await release(request, event.id)).body.notified,
        "both seats are already spoken for"
      ).toBe(0);
      expect(
        (await release(request, event.id)).body.notified,
        "and still are on the third save"
      ).toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("saving again does not email the same person twice", async ({ request }) => {
    const event = await seedEvent({ max_participants: 1 });
    try {
      await seedWaitingEntry(event.id);

      expect((await release(request, event.id)).body.notified).toBe(1);
      expect(
        (await release(request, event.id)).body.notified,
        "their claim link is still live"
      ).toBe(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /*
   * It sends email in her name, so it is not a route anybody may call. Without
   * a token it must refuse before doing any of the work above.
   */
  test("it refuses anyone who is not the administrator", async ({ request }) => {
    const event = await seedEvent({ max_participants: 5 });
    try {
      await seedWaitingEntry(event.id);

      const anonymous = await request.post("/api/admin/events/notify-waiting-list", {
        data: { eventId: event.id },
      });
      expect(anonymous.status()).toBe(401);

      const forged = await request.post("/api/admin/events/notify-waiting-list", {
        headers: { Authorization: "Bearer not-a-real-token" },
        data: { eventId: event.id },
      });
      expect(forged.status()).toBe(401);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
