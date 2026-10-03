import { test, expect, type Page } from "@playwright/test";
import {
  clearNotices,
  deleteEventBySlug,
  emailsTo,
  registrationById,
  seedEvent,
  seedRegistrationFor,
  setCancelToken,
  unique,
  updateRegistration,
} from "./helpers";
import { paidBooking, resetStripe, setStripeRefundsFail, stripeRefunds } from "./stripe-helpers";

/**
 * Money in the admin panel (phase 10): refunds through Stripe from a
 * participant's panel, deciding the refunds people asked for when they
 * cancelled, a refund Stripe could not make, giving a place to someone else,
 * and the dashboard's notices about what happened without her.
 */

const slugs: string[] = [];
test.beforeEach(async () => {
  await resetStripe();
});
test.afterEach(async () => {
  await setStripeRefundsFail(false);
  while (slugs.length) await deleteEventBySlug(slugs.pop()!);
});

async function event(overrides: Record<string, unknown> = {}) {
  const e = await seedEvent(overrides);
  slugs.push(e.slug);
  return e;
}

const panel = (page: Page) => page.getByRole("dialog").first();
const toasts = (page: Page) => page.getByRole("region", { name: "Notificări" });

async function openPanel(page: Page, id: string) {
  await page.goto(`/admin/registrations?p=${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Înscrieri" })).toBeVisible();
}

test.describe("refunds from the participant panel", () => {
  test("a Stripe payment is refunded there, in full, after saying how much", async ({ page, request }) => {
    const e = await event({ price: 450 });
    const booking = await paidBooking(request, e.id, `${unique("admin-refund")}@example.com`);

    await openPanel(page, booking.registrationId);
    await expect(panel(page).getByText("A plătit 450 RON.")).toBeVisible();
    await panel(page).getByRole("button", { name: "Rambursează 450 RON" }).click();
    const confirm = page.getByRole("dialog", { name: "Returnezi 450 RON?" });
    await expect(confirm).toContainText("O rambursare nu se poate anula.");
    await confirm.getByRole("button", { name: "Rambursează 450 RON" }).click();

    await expect(toasts(page)).toContainText("Plata de 450 RON a fost returnată prin Stripe.");
    await expect(panel(page).getByText("Rambursat", { exact: true })).toBeVisible();
    expect((await registrationById(booking.registrationId))?.payment_status).toBe("refunded");
    const [refund] = await stripeRefunds();
    expect(refund).toMatchObject({ payment_intent: booking.paymentIntent, amount: 45000 });
  });

  test("when Stripe refuses, she is told why and nothing changes", async ({ page, request }) => {
    const e = await event({ price: 200 });
    const booking = await paidBooking(request, e.id, `${unique("refused")}@example.com`);
    await setStripeRefundsFail(true);

    await openPanel(page, booking.registrationId);
    await panel(page).getByRole("button", { name: "Rambursează 200 RON" }).click();
    await page.getByRole("dialog", { name: "Returnezi 200 RON?" }).getByRole("button", { name: "Rambursează 200 RON" }).click();

    await expect(toasts(page)).toContainText("Stripe nu a făcut rambursarea:");
    expect((await registrationById(booking.registrationId))?.payment_status).toBe("completed");
  });

  test("someone who withdrew late waits for her decision, and she can decline", async ({ page }) => {
    const e = await event({ price: 150 });
    const id = await seedRegistrationFor(e.id, {
      full_name: "Retras Târziu",
      payment_status: "completed",
      cancelled_at: new Date().toISOString(),
      refund_requested_at: new Date().toISOString(),
    });

    await openPanel(page, id);
    await expect(panel(page).getByText(/S-a retras pe .*, din linkul din emailul de confirmare\./)).toBeVisible();
    await expect(panel(page).getByText(/așteaptă decizia ta/)).toBeVisible();
    // No Stripe payment behind this seeded booking: she can only mark it.
    await expect(panel(page).getByRole("button", { name: "Marchează ca rambursat" })).toBeVisible();
    // Already gone, so neither removed again nor given new details.
    await expect(panel(page).getByRole("button", { name: "Anulează înscrierea" })).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "Schimbă datele" })).toHaveCount(0);

    await panel(page).getByRole("button", { name: "Nu rambursa" }).click();
    await expect(toasts(page)).toContainText("Notat: plata nu se rambursează.");
    await expect(panel(page).getByText("S-a retras", { exact: true })).toBeVisible();
    const row = await registrationById(id);
    expect(row?.refund_requested_at).toBeNull();
    expect(row?.payment_status).toBe("completed");
  });

  test("a refund Stripe could not make is a warning until she settles it", async ({ page }) => {
    const e = await event({ price: 150 });
    const id = await seedRegistrationFor(e.id, {
      payment_status: "refunded",
      refunded_at: new Date().toISOString(),
      refund_failed_at: new Date().toISOString(),
      amount_paid: 15000,
      paid_currency: "ron",
    });

    await openPanel(page, id);
    const warning = panel(page).getByRole("alert");
    await expect(warning).toContainText("Stripe nu a putut returna plata de 150 RON");
    await warning.getByRole("button", { name: "S-a rezolvat" }).click();
    await expect(toasts(page)).toContainText("Notat: rambursarea s-a rezolvat.");
    await expect(panel(page).getByRole("alert")).toHaveCount(0);
    expect((await registrationById(id))?.refund_failed_at).toBeNull();
  });
});

test.describe("giving a place to someone else", () => {
  test("new details replace the old, the old cancel link stops, and the new person gets the confirmation", async ({ page }) => {
    const e = await event({ price: 0 });
    const id = await seedRegistrationFor(e.id, { full_name: "Prima Persoană" });
    await setCancelToken(id, "old-link-token-0000000000000000000000000000");
    const newEmail = `${unique("friend")}@example.com`;

    await openPanel(page, id);
    await panel(page).getByRole("button", { name: "Schimbă datele" }).click();
    const dialog = page.getByRole("dialog", { name: "Datele participantului" });
    await dialog.getByLabel("Nume complet").fill("Prietena Nouă");
    await dialog.getByLabel("Email").fill(newEmail);
    await dialog.getByLabel("Telefon").fill("+40733000111");
    await dialog.getByLabel(/Trimite-i confirmarea/).check();
    await dialog.getByRole("button", { name: "Salvează datele" }).click();

    await expect(toasts(page)).toContainText("Datele au fost salvate.");
    await expect(panel(page).getByRole("heading", { name: "Prietena Nouă" })).toBeVisible();
    const row = await registrationById(id);
    expect(row).toMatchObject({ full_name: "Prietena Nouă", email: newEmail, phone: "+40733000111" });
    expect(row?.cancel_token_hash, "a new link, made for the new person").not.toBe(null);

    const [mail] = await emailsTo(newEmail, 1);
    expect(mail.Subject).toContain("Confirmare înscriere");
    await page.goto("/ro/booking?token=old-link-token-0000000000000000000000000000");
    await expect(page.getByRole("heading", { name: "Linkul nu mai funcționează" })).toBeVisible();
  });

  test("an address that already has a seat on the event is refused, and the dialog keeps what she typed", async ({ page }) => {
    const e = await event({ price: 0 });
    const taken = `${unique("taken")}@example.com`;
    await seedRegistrationFor(e.id, { email: taken });
    const id = await seedRegistrationFor(e.id, { full_name: "Altcineva" });

    await openPanel(page, id);
    await panel(page).getByRole("button", { name: "Schimbă datele" }).click();
    const dialog = page.getByRole("dialog", { name: "Datele participantului" });
    await dialog.getByLabel("Email").fill(taken);
    await dialog.getByRole("button", { name: "Salvează datele" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Adresa aceasta are deja un loc la eveniment.");
    await expect(dialog.getByLabel("Email")).toHaveValue(taken);
    expect((await registrationById(id))?.email).not.toBe(taken);
  });
});

test.describe("the dashboard's notices", () => {
  test("a cancellation shows at the top until she marks it seen", async ({ page, request }) => {
    await clearNotices();
    const e = await event({ price: 0 });
    const id = await seedRegistrationFor(e.id, { full_name: "Ioana Retrasă" });
    await setCancelToken(id, "notice-token-000000000000000000000000000000");
    const res = await request.post("/api/booking/cancel", {
      form: { token: "notice-token-000000000000000000000000000000", locale: "ro" },
      maxRedirects: 0,
    });
    expect(res.headers().location).toContain("result=cancelled");

    await page.goto("/admin");
    const notices = page.getByRole("region", { name: "Noutăți" });
    await expect(notices).toContainText(/Ioana Retrasă s-a retras de la .*\. Locul s-a eliberat\./);
    await notices.getByRole("link", { name: /Vezi/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/registrations\\?p=${id}`));
    await expect(panel(page).getByRole("heading", { name: "Ioana Retrasă" })).toBeVisible();

    await page.goto("/admin");
    await page.getByRole("region", { name: "Noutăți" }).getByRole("button", { name: "Marchează ca văzute" }).click();
    await expect(page.getByRole("region", { name: "Noutăți" })).toHaveCount(0);
  });

  test("a refund made in Stripe is a notice with its amount", async ({ page, request }) => {
    await clearNotices();
    const e = await event({ price: 380 });
    const booking = await paidBooking(request, e.id, `${unique("dash")}@example.com`);
    await updateRegistration(booking.registrationId, { full_name: "Mihai Rambursat" });
    const { refundInDashboard } = await import("./stripe-helpers");
    await refundInDashboard(booking.paymentIntent);

    await page.goto("/admin");
    await expect(page.getByRole("region", { name: "Noutăți" })).toContainText(
      /Plata făcută de Mihai Rambursat pentru .* \(380 RON\) a fost rambursată din Stripe\./
    );
  });
});
