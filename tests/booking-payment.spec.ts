import { test, expect, type Page } from "@playwright/test";
import {
  bookingsOn,
  deleteEventBySlug,
  emailsTo,
  registrationById,
  seedEvent,
  seedRegistrationFor,
  unique,
} from "./helpers";
import { bookByApi, resetStripe, sessionIdOf, sessionsFor, setStripeWebhooks, stripeSessions } from "./stripe-helpers";

/**
 * Paying for a seat, as a visitor does it: the form, Stripe's page (the
 * suite's stand-in, tests/fake-stripe.ts), and what the event page says when
 * Stripe sends them back (audit B2). In both engines: most visitors pay on
 * an iPhone.
 */

test.beforeEach(async () => {
  await resetStripe();
});

async function fillDetails(page: Page, email: string) {
  // The CAPTCHA passing proves React has hydrated; a fill before that is lost.
  await expect(page.locator('[data-verified="true"]')).toBeAttached();
  await page.getByLabel("Nume complet").fill("Ana Popescu");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Telefon", { exact: true }).fill("0722111222");
}

/** Books through the form and lands on the stand-in's payment page. */
async function bookAndReachStripe(page: Page, slug: string, email: string) {
  await page.goto(`/ro/events/${slug}`);
  await fillDetails(page, email);
  await page.getByRole("button", { name: "Continuă la plată" }).click();
  await page.waitForURL(/127\.0\.0\.1:12111\/pay\/cs_/);
}

test.describe("paying for a seat", () => {
  test("says how it can be paid", async ({ page }) => {
    const lei = await seedEvent({ price: 300, currency: "RON" });
    const dollars = await seedEvent({ price: 90, currency: "USD" });
    try {
      await page.goto(`/ro/events/${lei.slug}`);
      await expect(page.getByText("Plătești cu cardul sau cu Revolut Pay.")).toBeVisible();
      await page.goto(`/en/events/${dollars.slug}`);
      await expect(page.getByText("Pay by card.", { exact: true })).toBeVisible();
    } finally {
      await deleteEventBySlug(lei.slug);
      await deleteEventBySlug(dollars.slug);
    }
  });

  test("goes to Stripe with card and Revolut Pay, and comes back confirmed", async ({ page }) => {
    const event = await seedEvent({ price: 450, max_participants: 5 });
    const email = `${unique("pay")}@example.com`;
    try {
      await bookAndReachStripe(page, event.slug, email);
      await expect(page.locator("[data-methods]")).toHaveText("card,revolut_pay");
      await expect(page.locator("[data-total]")).toHaveText("450.00 RON");

      await page.getByRole("button", { name: "Plătește" }).click();
      await expect(page.getByRole("heading", { name: "Plata a fost primită" })).toBeVisible();
      // The checkout's id is a key to its state: it does not stay in the address.
      expect(page.url()).not.toContain("checkout=");

      const [booking] = await bookingsOn(event.id);
      expect(booking.payment_status).toBe("completed");
      const [mail] = await emailsTo(email, 1);
      expect(mail.Subject).toContain("Confirmare plată");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("turning back keeps the seat, and resuming opens the same payment page", async ({ page }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    const email = `${unique("back")}@example.com`;
    try {
      await bookAndReachStripe(page, event.slug, email);
      const first = page.url();

      await page.getByRole("link", { name: "Înapoi" }).click();
      await expect(page.getByRole("heading", { name: "Plata nu s-a încheiat" })).toBeVisible();
      await expect(page.getByText(/Locul tău e păstrat până la ora \d{2}:\d{2}\./)).toBeVisible();

      await page.getByRole("button", { name: "Reia plata" }).click();
      await page.waitForURL(/\/pay\/cs_/);
      expect(page.url(), "the same checkout, not a second one").toBe(first);
      expect(await stripeSessions()).toHaveLength(1);

      await page.getByRole("button", { name: "Plătește" }).click();
      await expect(page.getByRole("heading", { name: "Plata a fost primită" })).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("giving up the place frees it at once and closes the payment page", async ({ page }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    try {
      await bookAndReachStripe(page, event.slug, `${unique("give-up")}@example.com`);
      const sessionId = sessionIdOf(page.url());
      await page.getByRole("link", { name: "Înapoi" }).click();
      await page.getByRole("button", { name: "Renunță la loc" }).click();
      await expect(page.getByRole("heading", { name: "Ai renunțat la loc" })).toBeVisible();

      expect(await bookingsOn(event.id), "the unpaid booking is gone").toEqual([]);
      const [session] = (await stripeSessions()).filter((s) => s.id === sessionId);
      expect(session.status, "and its payment page can no longer take money").toBe("expired");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("paid while Stripe's message is late: the page confirms it by itself", async ({ page }) => {
    const event = await seedEvent({ price: 320, max_participants: 5 });
    const email = `${unique("late")}@example.com`;
    try {
      await setStripeWebhooks(false);
      await bookAndReachStripe(page, event.slug, email);
      await page.getByRole("button", { name: "Plătește" }).click();
      await expect(page.getByRole("heading", { name: "Plata a fost primită" })).toBeVisible();

      const [booking] = await bookingsOn(event.id);
      expect(booking.payment_status).toBe("completed");
      expect(await emailsTo(email, 1)).toHaveLength(1);
    } finally {
      await setStripeWebhooks(true);
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("one seat per email per event (B3)", () => {
  test("an address that already has a seat is told so, kindly", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("twice")}@example.com`;
    try {
      await seedRegistrationFor(event.id, { email });
      await page.goto(`/ro/events/${event.slug}`);
      await fillDetails(page, email);
      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Adresa aceasta are deja un loc la eveniment" })).toBeVisible();
      expect(await bookingsOn(event.id)).toHaveLength(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("booking again while a checkout is open goes back to it, and takes no second seat", async ({ request }) => {
    const event = await seedEvent({ price: 150, max_participants: 5 });
    const email = `${unique("again")}@example.com`;
    try {
      const first = await bookByApi(request, event.id, email, { fullName: "Ana Popescu" });
      const second = await bookByApi(request, event.id, email.toUpperCase(), { fullName: "Ana Maria Popescu" });
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.checkoutUrl).toBe(first.body.checkoutUrl);
      expect(await sessionsFor(first.body.id!)).toHaveLength(1);
      // The details just sent are the ones kept.
      expect((await registrationById(first.body.id!))?.full_name).toBe("Ana Maria Popescu");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("someone else's address books normally beside it", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    try {
      const a = await bookByApi(request, event.id, `${unique("a")}@example.com`);
      const b = await bookByApi(request, event.id, `${unique("b")}@example.com`);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await bookingsOn(event.id)).toHaveLength(2);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
