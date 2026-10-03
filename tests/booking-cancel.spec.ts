import { test, expect, type Page } from "@playwright/test";
import {
  bucharestDate,
  deleteEventBySlug,
  emailsTo,
  noticesFor,
  registrationById,
  seedEvent,
  seedRegistrationFor,
  setCancelToken,
  unique,
} from "./helpers";
import { bookByApi, paidBooking, resetStripe, setStripeRefundsFail, stripeRefunds } from "./stripe-helpers";

/**
 * Cancelling from the link in the confirmation email (/ro/booking?token=…),
 * by Rares' rules of 3 October 2026 (lib/cancel-rules.ts): an automatic full
 * refund up to 48 hours before the start, after that the seat is freed and the
 * refund is the instructor's decision, and nothing once the event has begun.
 * Whatever happens, she sees it on her dashboard.
 */

test.beforeEach(async () => {
  await resetStripe();
});

const TOKEN_LENGTH = 43;
const newToken = () => `t${unique("cancel").replace(/[^a-z0-9]/gi, "")}`.padEnd(TOKEN_LENGTH, "x").slice(0, TOKEN_LENGTH);

async function openLink(page: Page, token: string) {
  await page.goto(`/ro/booking?token=${token}`);
}

test.describe("the cancel link", () => {
  test("cancels a free booking, frees its seat, and tells her", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const token = newToken();
    try {
      const id = await seedRegistrationFor(event.id);
      await setCancelToken(id, token);
      await openLink(page, token);

      await expect(page.getByRole("heading", { name: "Rezervarea ta" })).toBeVisible();
      await expect(page.getByText("Dacă nu mai poți veni, anulează, ca locul să ajungă la altcineva.")).toBeVisible();
      // Opening the page changed nothing: mail scanners open every link.
      expect((await registrationById(id))?.cancelled_at).toBeNull();

      await page.getByRole("button", { name: "Anulează înscrierea" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Gata. Înscrierea e anulată." })).toBeVisible();
      await expect(page.getByText(/Ai anulat această înscriere pe/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Anulează înscrierea" })).toHaveCount(0);

      expect((await registrationById(id))?.cancelled_at).not.toBeNull();
      const notices = await noticesFor(id);
      expect(notices.map((n) => [n.kind, n.details.refund])).toEqual([["cancelled", "none"]]);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("48 hours or more before the start, refunds in full, automatically", async ({ page, request }) => {
    const event = await seedEvent({ price: 450, max_participants: 5 });
    const token = newToken();
    try {
      const booking = await paidBooking(request, event.id, `${unique("early")}@example.com`);
      await setCancelToken(booking.registrationId, token);
      await openLink(page, token);

      await expect(page.getByText(/primești înapoi 450 RON, automat/)).toBeVisible();
      await expect(page.getByText(/Rambursarea automată se aplică până pe/)).toBeVisible();
      await page.getByRole("button", { name: "Anulează și primește banii înapoi" }).click();
      await expect(page.getByRole("status").filter({ hasText: "banii se întorc" })).toBeVisible();
      await expect(page.getByText("Plata de 450 RON a fost returnată integral.", { exact: false })).toBeVisible();

      const row = await registrationById(booking.registrationId);
      expect(row?.payment_status).toBe("refunded");
      expect(row?.cancelled_at).not.toBeNull();
      const refunds = await stripeRefunds();
      expect(refunds).toHaveLength(1);
      // Never partial: no amount was asked for, so Stripe returned it all.
      expect(refunds[0]).toMatchObject({ payment_intent: booking.paymentIntent, amount: 45000 });

      await expect.poll(async () => (await noticesFor(booking.registrationId)).map((n) => n.kind)).toEqual(["cancelled"]);
      const [notice] = await noticesFor(booking.registrationId);
      expect(notice.details).toMatchObject({ refund: "automatic", amount: 45000 });
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("inside the last 48 hours, frees the seat and leaves the refund to her", async ({ page, request }) => {
    // Tomorrow at noon: always in the future, and always under 48 hours away.
    const event = await seedEvent({ price: 300, max_participants: 5, date: bucharestDate(1), time: "12:00" });
    const token = newToken();
    try {
      const booking = await paidBooking(request, event.id, `${unique("late")}@example.com`);
      await setCancelToken(booking.registrationId, token);
      await openLink(page, token);

      await expect(page.getByText(/banii nu se mai returnează automat/)).toBeVisible();
      await expect(page.getByText(/scrie-i organizatoarei/)).toBeVisible();
      await page.getByRole("button", { name: "Anulează înscrierea" }).click();
      await expect(page.getByRole("status").filter({ hasText: "organizatoarea a fost anunțată de cererea de rambursare" })).toBeVisible();
      await expect(page.getByText("Rambursarea așteaptă decizia organizatoarei.")).toBeVisible();

      const row = await registrationById(booking.registrationId);
      expect(row?.payment_status, "the money stays until she decides").toBe("completed");
      expect(row?.cancelled_at).not.toBeNull();
      expect(row?.refund_requested_at).not.toBeNull();
      expect(await stripeRefunds()).toEqual([]);
      const [notice] = await noticesFor(booking.registrationId);
      expect(notice.details.refund).toBe("requested");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("once the event has started, it cannot be cancelled here", async ({ page, request }) => {
    const event = await seedEvent({
      price: 0,
      max_participants: 5,
      date: bucharestDate(-1),
      time: "10:00",
      end_date: bucharestDate(1),
    });
    const token = newToken();
    try {
      const id = await seedRegistrationFor(event.id);
      await setCancelToken(id, token);
      await openLink(page, token);
      await expect(page.getByText(/Evenimentul a început, așa că înscrierea nu mai poate fi anulată/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Anulează/ })).toHaveCount(0);

      // Nor by posting the form directly.
      const res = await request.post("/api/booking/cancel", { form: { token, locale: "ro" }, maxRedirects: 0 });
      expect(res.headers().location).toContain("result=closed");
      expect((await registrationById(id))?.cancelled_at).toBeNull();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("when Stripe cannot refund, the booking is still cancelled and the refund waits for her", async ({ page, request }) => {
    const event = await seedEvent({ price: 220, max_participants: 5 });
    const token = newToken();
    try {
      const booking = await paidBooking(request, event.id, `${unique("refuse")}@example.com`);
      await setCancelToken(booking.registrationId, token);
      await setStripeRefundsFail(true);
      await openLink(page, token);
      await page.getByRole("button", { name: "Anulează și primește banii înapoi" }).click();
      await expect(page.getByRole("status").filter({ hasText: "rambursarea automată nu a mers acum" })).toBeVisible();

      const row = await registrationById(booking.registrationId);
      expect(row?.cancelled_at).not.toBeNull();
      expect(row?.payment_status).toBe("completed");
      expect(row?.refund_requested_at).not.toBeNull();
      const [notice] = await noticesFor(booking.registrationId);
      expect(notice.details.refund).toBe("failed");
    } finally {
      await setStripeRefundsFail(false);
      await deleteEventBySlug(event.slug);
    }
  });

  test("a link that matches no booking says so", async ({ page }) => {
    await openLink(page, newToken());
    await expect(page.getByRole("heading", { name: "Linkul nu mai funcționează" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Scrie-i organizatoarei" })).toBeVisible();
  });

  test("the confirmation email carries the link, and it opens this booking", async ({ page, request }) => {
    const event = await seedEvent({ price: 0, max_participants: 5 });
    const email = `${unique("mail-link")}@example.com`;
    try {
      const booked = await bookByApi(request, event.id, email);
      expect(booked.status).toBe(200);
      const [mail] = await emailsTo(email, 1);
      const link = mail.HTML.match(/href="(http[^"]*\/ro\/booking\?token=[^"]+)"/)?.[1];
      expect(link, "the confirmation links to the cancel page").toBeTruthy();
      await page.goto(link!.replace(/&amp;/g, "&"));
      await expect(page.getByText("Ana Popescu")).toBeVisible();
      await expect(page.getByRole("button", { name: "Anulează înscrierea" })).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
