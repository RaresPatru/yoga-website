import { test, expect } from "@playwright/test";
import { seedEvent, deleteEventBySlug, seedRegistrationFor } from "./helpers";

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

      // Check what is actually inside the file, not just that one arrived.
      //
      // seedEvent creates the event at 10:00, meaning 10:00 in Romania. The
      // invite must therefore say 07:00 UTC in summer (UTC+3) or 08:00 in
      // winter (UTC+2). The old code wrote "10:00 UTC" — sending every attendee
      // an invite two or three hours late — and no test noticed, because the
      // only assertion was on the filename.
      const stream = await download.createReadStream();
      const ics = (await stream.toArray()).map(String).join("");

      const dtStart = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
      expect(dtStart, "DTSTART must be an explicit UTC timestamp").toBeTruthy();

      const [, hour] = dtStart!.match(/T(\d{2})/)!;
      expect(
        ["07", "08"],
        `10:00 Europe/Bucharest should be 07:00Z (summer) or 08:00Z (winter), got ${dtStart}`
      ).toContain(hour);

      await page.getByLabel("Nume complet").fill("Test E2E");
      await page.getByLabel("Email").fill("e2e@example.com");
      await page.getByPlaceholder("+40 7XX XXX XXX").fill("07221112233");

      // Regression guard: the Turnstile widget used to be torn down and
      // re-rendered on every keystroke, because the effect that created it
      // depended on inline callback props that were new objects each render.
      // Counting render() calls across a keystroke catches that returning.
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
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // The single most important path in the application, and until the Turnstile
  // test keys were wired up it had no coverage at all: every registration test
  // stopped at the CAPTCHA and asserted the error message instead.
  test("registers successfully for a free event", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);

      await expect(page.getByText("0/10 locuri ocupate")).toBeVisible();

      // Waiting for the CAPTCHA before typing serves two purposes: the token
      // has to exist before submitting, and it proves React has hydrated. These
      // are controlled inputs, so a fill that lands pre-hydration is wiped by
      // the first render.
      await expect(page.locator('[data-verified="true"]')).toBeAttached();

      await page.getByLabel("Nume complet").fill("Ana Popescu");
      await page.getByLabel("Email").fill(`ana-${Date.now()}@example.com`);
      await page.getByPlaceholder("+40 7XX XXX XXX").fill("0722111222");

      await page.getByRole("button", { name: "Înscrie-te gratuit" }).click();

      await expect(page.getByRole("heading", { name: "Înscriere reușită!" })).toBeVisible();

      // And the seat is really taken — proving the count on the page reflects
      // the database rather than always reading zero.
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByText("1/10 locuri ocupate")).toBeVisible();
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // Regression test for the bug that made the whole waiting-list feature
  // unreachable in production: anonymous visitors could not read the
  // registrations table, so the seat count was always 0, so `isFull` was never
  // true, so this UI never appeared for anyone.
  test("a full event shows as booked out and offers the waiting list", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    try {
      await seedRegistrationFor(event.id);

      await page.goto(`/ro/events/${event.slug}`);

      await expect(page.getByText("1/1 locuri ocupate")).toBeVisible();
      await expect(page.getByText("Locuri epuizate")).toBeVisible();

      // The registration form must be gone and the waiting list offered.
      await expect(page.getByRole("button", { name: "Înscrie-te gratuit" })).toBeHidden();

      await page.getByRole("button", { name: "Intră pe lista de așteptare" }).click();

      await expect(page.locator('[data-verified="true"]')).toBeAttached();
      await page.getByLabel("Nume complet").fill("Maria Ionescu");
      await page.getByLabel("Email").fill(`maria-${Date.now()}@example.com`);
      await page.getByPlaceholder("+40 7XX XXX XXX").fill("0722333444");
      await page.getByRole("button", { name: "Înscrie-te pe lista de așteptare" }).click();

      await expect(page.getByRole("heading", { name: "Listă de așteptare" })).toBeVisible();
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
