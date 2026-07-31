import { test, expect } from "@playwright/test";
import { seedEvent, deleteEventBySlug } from "./helpers";

test.describe("events", () => {
  test("list page renders seeded event card with details", async ({ page }) => {
    const event = await seedEvent({ price: 0 });
    const title = `Eveniment E2E ${event.slug}`;
    try {
      await page.goto("/ro/events");
      await expect(page.getByRole("heading", { name: "Evenimente" })).toBeVisible();
      const card = page.getByRole("link", { name: title });
      await expect(card).toBeVisible();
      await expect(card).toContainText("Gratuit");
      await expect(card).toContainText("Cluj-Napoca");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("detail page renders info, calendar download and register form behaviour", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    const title = `Eveniment E2E ${event.slug}`;
    try {
      await page.goto(`/ro/events/${event.slug}`);

      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Descriere de test E2E.")).toBeVisible();
      await expect(page.getByText("Gratuit", { exact: true })).toBeVisible();
      await expect(page.getByText("0/10 locuri ocupate")).toBeVisible();

      await expect(page.getByLabel("Nume complet")).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByPlaceholder("+40 7XX XXX XXX")).toBeVisible();

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Adaugă în Calendar" }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.ics$/);

      await page.getByLabel("Nume complet").fill("Test E2E");
      await page.getByLabel("Email").fill("e2e@example.com");
      await page.getByPlaceholder("+40 7XX XXX XXX").fill("07221112233");

      const widget = page.locator(".turnstile-widget");
      await expect(widget).toBeAttached();
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const ts = window.turnstile!;
        const orig = ts.render.bind(ts);
        let calls = 0;
        ts.render = (container, options) => {
          calls++;
          return orig(container, options);
        };
        (window as unknown as { __turnstileRenderCalls: () => number }).__turnstileRenderCalls = () => calls;
      });
      const baseline = await page.evaluate(() =>
        (window as unknown as { __turnstileRenderCalls: () => number }).__turnstileRenderCalls()
      );
      await page.getByLabel("Nume complet").fill("Test E2E Modificat");
      const afterTyping = await page.evaluate(() =>
        (window as unknown as { __turnstileRenderCalls: () => number }).__turnstileRenderCalls()
      );
      expect(afterTyping).toBe(baseline);

      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();
      await expect(page.getByText("Completează verificarea de securitate.")).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("detail page flags an invalid phone number", async ({ page }) => {
    const event = await seedEvent();
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByLabel("Nume complet").fill("Test E2E");
      await page.getByLabel("Email").fill("e2e@example.com");
      await page.getByPlaceholder("+40 7XX XXX XXX").fill("0722");
      await expect(page.getByText("Număr de telefon invalid / Invalid phone number")).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("paid event shows price and payment button", async ({ page }) => {
    const event = await seedEvent({ price: 150, max_participants: 5 });
    const title = `Eveniment E2E ${event.slug}`;
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("150 RON")).toBeVisible();
      await expect(page.getByRole("button", { name: "Continuă la plată" })).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("English locale shows English title", async ({ page }) => {
    const event = await seedEvent();
    const titleEn = `E2E Event ${event.slug}`;
    try {
      await page.goto(`/en/events/${event.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});
