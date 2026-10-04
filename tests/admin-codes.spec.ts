import { test, expect, type Page } from "@playwright/test";
import { adminAccessToken, bookingsOn, deleteEventBySlug, registrationById, seedEvent, unique } from "./helpers";
import { bookByApi, paySession, resetStripe, sessionIdOf, stripeCalls } from "./stripe-helpers";

/**
 * Coduri de reducere (/admin/codes): promotion codes she makes for her
 * announcements, kept in Stripe (the suite's stand-in, tests/fake-stripe.ts),
 * which applies them on its payment page and counts their uses.
 */

test.beforeEach(async () => {
  await resetStripe();
});

/** The codes listed under "Codurile tale" (toasts are list items too). */
const codeList = (page: Page) => page.getByRole("region", { name: "Codurile tale" });

test.describe("discount codes", () => {
  test("a code is made in Stripe as she typed it, and listed with its uses", async ({ page }) => {
    await page.goto("/admin/codes");
    await expect(page.getByRole("heading", { level: 1, name: "Coduri de reducere" })).toBeVisible();
    await expect(page.getByText("Niciun cod încă.", { exact: false })).toBeVisible();
    await expect(page.getByText(/ultimele 30 de zile/)).toBeVisible();

    await page.getByLabel("Codul").fill("vara10");
    await expect(page.getByLabel("Codul"), "codes are written in capitals").toHaveValue("VARA10");
    await page.getByRole("radio", { name: "Procent" }).check();
    await page.getByLabel("Procentul").fill("10");
    await page.getByLabel("De câte ori, în total (opțional)").fill("5");
    await page.getByRole("button", { name: "Creează codul" }).click();

    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Codul VARA10 e gata.");
    const item = codeList(page).getByRole("listitem").filter({ hasText: "VARA10" });
    await expect(item).toContainText("10%");
    await expect(item).toContainText("Folosiri: 0 din 5");
    await expect(item).toContainText("fără dată de final");
    await expect(item).toContainText("Activ");

    const calls = await stripeCalls();
    const coupon = calls.find((c) => c.path === "/v1/coupons")!;
    expect(coupon.params).toMatchObject({ percent_off: "10", duration: "once" });
    const promo = calls.find((c) => c.method === "POST" && c.path === "/v1/promotion_codes")!;
    expect(promo.params).toMatchObject({ code: "VARA10", max_redemptions: "5" });
  });

  test("a code she cannot have is refused in words, before Stripe sees it", async ({ page }) => {
    await page.goto("/admin/codes");
    await page.getByLabel("Codul").fill("X!");
    await page.getByLabel("Procentul").fill("10");
    // The browser's own pattern check would stop the form first; the server's
    // answer is what this is about, so the form is sent past it.
    await page.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
    await page.getByRole("button", { name: "Creează codul" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Codul poate avea între 3 și 30 de litere, cifre sau liniuțe.");

    await page.getByLabel("Codul").fill("CINCI");
    await page.getByLabel("Procentul").fill("150");
    await page.getByRole("button", { name: "Creează codul" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Procentul e un număr întreg de la 1 la 100");
    expect((await stripeCalls()).filter((c) => c.method === "POST")).toEqual([]);
  });

  test("a code turns off, and on again", async ({ page, request }) => {
    const res = await request.post("/api/admin/promotion-codes", {
      headers: { Authorization: `Bearer ${await adminAccessToken()}` },
      data: { code: "TOAMNA-50", kind: "amount", value: 50, currency: "RON" },
    });
    expect(res.status()).toBe(200);

    await page.goto("/admin/codes");
    const item = codeList(page).getByRole("listitem").filter({ hasText: "TOAMNA-50" });
    await expect(item).toContainText("50 RON");
    await item.getByRole("button", { name: /Oprește/ }).click();
    await expect(item).toContainText("Oprit");
    await item.getByRole("button", { name: /Pornește/ }).click();
    await expect(item).toContainText("Activ");
  });

  test("used at checkout, it lowers the price, counts the use, and is kept on the booking", async ({ request, page }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    try {
      const made = await request.post("/api/admin/promotion-codes", {
        headers: { Authorization: `Bearer ${await adminAccessToken()}` },
        data: { code: "PRIETENI25", kind: "percent", value: 25 },
      });
      expect(made.status()).toBe(200);

      const { body } = await bookByApi(request, event.id, `${unique("coded")}@example.com`);
      await paySession(sessionIdOf(body.checkoutUrl!), { code: "prieteni25" });

      const [booking] = await bookingsOn(event.id);
      expect(booking.payment_status).toBe("completed");
      expect(booking.amount_paid, "a quarter off 200 lei").toBe(15000);
      expect(booking.discount_code).toBe("PRIETENI25");
      expect((await registrationById(String(booking.id)))?.paid_currency).toBe("ron");

      await page.goto("/admin/codes");
      await expect(codeList(page).getByRole("listitem").filter({ hasText: "PRIETENI25" })).toContainText("Folosiri: 1");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
