import { test, expect, type Page } from "@playwright/test";
import {
  bucharestDate,
  seedEvent,
  deleteEventBySlug,
  seedRegistrationFor,
  registrationsFor,
  registerDirectly,
  seedTestimonialOn,
  tryInsertEvent,
  unique,
} from "./helpers";

/**
 * Asserts the document is no wider than the screen showing it.
 *
 * Measured rather than eyeballed, because a sideways-scrolling page looks
 * completely normal in a screenshot until you try to scroll it. `clientWidth`
 * is the viewport; `scrollWidth` is how far the content actually reaches.
 */
async function expectNoSidewaysScroll(page: Page) {
  const { viewport, content } = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(
    content,
    `page content is ${content}px wide in a ${viewport}px viewport`
  ).toBeLessThanOrEqual(viewport);
}

/**
 * Asserts the open country list is fully on screen and has not widened the page.
 *
 * Both halves matter. An element can sit inside the viewport and still push the
 * document wider, and it can leave the document alone while hanging off the
 * left edge where nobody can reach it.
 */
async function expectCountryListInsideViewport(page: Page) {
  const { listLeft, listRight, viewport, scrollWidth } = await page.evaluate(() => {
    const box = document.querySelector('[role="listbox"]')!.getBoundingClientRect();
    return {
      listLeft: box.left,
      listRight: box.right,
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  expect(listLeft, "the list must not hang off the left edge").toBeGreaterThanOrEqual(0);
  expect(listRight, "the list must not run past the right edge").toBeLessThanOrEqual(viewport);
  expect(scrollWidth, "an open list must not widen the page").toBeLessThanOrEqual(viewport);
}

test.describe("events", () => {
  test("list page renders seeded event card with details", async ({ page }) => {
    const event = await seedEvent({ price: 0 });
    const title = `Eveniment E2E ${event.slug}`;
    try {
      await page.goto("/ro/events");
      await expect(page.getByRole("heading", { level: 1, name: "Evenimente", exact: true })).toBeVisible();
      const card = page.getByRole("link", { name: title });
      await expect(card).toBeVisible();
      await expect(card).toContainText("Gratuit");
      await expect(card).toContainText("Cluj-Napoca");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * A card summarises the description; it does not print its markup.
   *
   * `events.description_ro` holds HTML — the event page renders it through
   * sanitizeHtml + dangerouslySetInnerHTML — and both card surfaces used to
   * drop the raw column into a paragraph, so the tags showed. seedEvent's own
   * `<p>Descriere de test E2E.</p>` was enough to reproduce it.
   */
  test("cards summarise the description without showing its markup", async ({ page }) => {
    const event = await seedEvent({
      description_ro: "<p>Prima linie.</p><p>A doua linie &amp; restul.</p>",
    });
    const title = `Eveniment E2E ${event.slug}`;
    try {
      for (const path of ["/ro/events", "/ro"]) {
        await page.goto(path);
        const card = page.getByRole("link", { name: title });
        // The home page only carries a handful of events; skip if this one did
        // not make the carousel rather than asserting on luck.
        if ((await card.count()) === 0) continue;

        await expect(card).toContainText("Prima linie.");
        await expect(card, "tags must not reach the visitor").not.toContainText("<p>");
        await expect(card, "entities are decoded, not printed").not.toContainText("&amp;");
      }
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * The card says when the event ends, not just when it starts.
   *
   * Both card surfaces render the same strings -- the one on /events and the
   * carousel slide on the home page -- through one formatter, so a change to
   * either cannot quietly say something different from the other.
   *
   * The dash is an en dash with thin spaces around it, which is why these
   * assert on the parts rather than on a pasted string: a test that pastes the
   * literal passes or fails on invisible characters and tells you nothing
   * about which.
   */
  test("a one-day event shows its hours, and falls back to the start alone", async ({ page }) => {
    const ranged = await seedEvent({ time: "18:30", end_time: "20:00" });
    const openEnded = await seedEvent({ time: "07:15", end_time: null });
    try {
      await page.goto("/ro/events");

      const rangedCard = page.getByRole("link", { name: `Eveniment E2E ${ranged.slug}` });
      await expect(rangedCard).toContainText("18:30");
      await expect(rangedCard).toContainText("20:00");

      /*
       * No end time is a real state, not a gap to fill. A printed end is a
       * promise about when somebody gets to leave, and a visitor cannot tell a
       * stated one from a guessed one -- so it says nothing rather than
       * inventing ninety minutes.
       */
      const openCard = page.getByRole("link", { name: `Eveniment E2E ${openEnded.slug}` });
      await expect(openCard).toContainText("07:15");
      await expect(openCard).not.toContainText("\u2013");
    } finally {
      await deleteEventBySlug(ranged.slug);
      await deleteEventBySlug(openEnded.slug);
    }
  });

  /**
   * An event spanning days shows both halves: which days it occupies, and the
   * hours it keeps on them.
   *
   * These are two separate facts and neither suppresses the other. The hours on
   * a multi-day event read as the daily schedule -- "09:00 - 16:00, Friday to
   * Sunday" -- which is what she means by filling both in.
   *
   * The date half is also what makes an event crossing midnight readable. A
   * 22:00 session ending at 01:00 must carry the next day as its end date,
   * because the database refuses an end before its start on one date; so the
   * dates say "7 - 8" and the hours say "22:00 - 01:00", and neither needed to
   * know about the other.
   */
  test("a multi-day event shows its dates and its daily hours", async ({ page }) => {
    const retreat = await seedEvent({
      date: "2099-03-20",
      time: "09:00",
      end_date: "2099-03-22",
      end_time: "16:00",
    });
    const overnight = await seedEvent({
      date: "2099-11-07",
      time: "22:00",
      end_date: "2099-11-08",
      end_time: "01:00",
    });
    try {
      await page.goto("/ro/events");

      // The day range, with the month and year said once rather than twice.
      const card = page.getByRole("link", { name: `Eveniment E2E ${retreat.slug}` });
      await expect(card).toContainText("22 martie 2099");
      await expect(card).toContainText("09:00");
      await expect(card, "the daily hours, not just the start").toContainText("16:00");

      const night = page.getByRole("link", { name: `Eveniment E2E ${overnight.slug}` });
      await expect(night, "the dates move with it across midnight").toContainText(
        "8 noiembrie 2099"
      );
      await expect(night).toContainText("22:00");
      await expect(night).toContainText("01:00");
    } finally {
      await deleteEventBySlug(retreat.slug);
      await deleteEventBySlug(overnight.slug);
    }
  });

  /**
   * English puts the month before the day, so a range inside one month cannot
   * drop it from the same side Romanian does.
   *
   * Dropping it from the first date is right for Romanian — "28 - 29 octombrie
   * 2026" — and leaves English reading "28 - October 29, 2026", which is a
   * fragment. English keeps the month on the first date instead.
   */
  test("a date range reads correctly in both languages", async ({ page }) => {
    const event = await seedEvent({
      date: "2099-10-28",
      time: null,
      end_date: "2099-10-29",
    });
    const name = `E2E Event ${event.slug}`;
    try {
      await page.goto("/en/events");
      const card = page.getByRole("link", { name });
      await expect(card).toContainText("October 28");
      await expect(card).toContainText("29, 2099");
      await expect(card, "the month must not land before the first day").not.toContainText(
        "28 – October"
      );

      await page.goto("/ro/events");
      const roCard = page.getByRole("link", { name: `Eveniment E2E ${event.slug}` });
      await expect(roCard).toContainText("29 octombrie 2099");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * A date she has announced without an hour shows no clock at all.
   *
   * This is why `time` became nullable: she books a venue for a weekend in
   * March and says so months before deciding when Friday begins. The old
   * column was NOT NULL, so the only way to store that was a placeholder hour
   * -- and a visitor cannot tell a placeholder from a real one.
   */
  test("an event with no announced hour shows a date and no clock", async ({ page }) => {
    const undated = await seedEvent({
      date: "2099-04-10",
      time: null,
      end_date: "2099-04-12",
    });
    try {
      await page.goto("/ro/events");
      const card = page.getByRole("link", { name: `Eveniment E2E ${undated.slug}` });
      await expect(card).toContainText("12 aprilie 2099");
      // Nothing that could be read as a time of day.
      await expect(card).not.toContainText(":");
    } finally {
      await deleteEventBySlug(undated.slug);
    }
  });

  test("detail page renders info, calendar entry and register form behaviour", async ({
    page,
    request,
  }) => {
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
      await expect(page.getByLabel("Telefon")).toBeVisible();

      /*
       * The calendar control is the event's own date, and it opens a menu — see
       * components/events/event-date-link.tsx. So the trigger is a <summary>
       * with no destination of its own; the three destinations are inside it.
       *
       * The .ics is fetched rather than followed. Two of the three options
       * leave for Google or Outlook, which is not somewhere a test should
       * navigate, and the third is a hand-off the browser would try to open.
       */
      const calendar = page.locator('summary[data-tooltip="Adaugă în calendar"]');
      await expect(calendar).toBeVisible();
      await calendar.click();
      await expect(
        page.locator(".event-calendar ul a", { hasText: "Apple Calendar" })
      ).toHaveAttribute("href", /\/api\/calendar\/event\//);

      const icsResponse = await request.get(`/api/calendar/event/${event.slug}?locale=ro`);
      expect(icsResponse.status()).toBe(200);
      expect(icsResponse.headers()["content-type"]).toContain("text/calendar");
      const ics = await icsResponse.text();

      // Check what is actually inside it, not just that something arrived.
      //
      // seedEvent creates the event at 10:00, meaning 10:00 in Romania. The
      // invite must therefore say 07:00 UTC in summer (UTC+3) or 08:00 in
      // winter (UTC+2). The old code wrote "10:00 UTC" — sending every attendee
      // an invite two or three hours late — and no test noticed, because the
      // only assertion was on the filename.
      const dtStart = ics.match(/DTSTART:(\d{8}T\d{6}Z)/)?.[1];
      expect(dtStart, "DTSTART must be an explicit UTC timestamp").toBeTruthy();

      const [, hour] = dtStart!.match(/T(\d{2})/)!;
      expect(
        ["07", "08"],
        `10:00 Europe/Bucharest should be 07:00Z (summer) or 08:00Z (winter), got ${dtStart}`
      ).toContain(hour);

      await page.getByLabel("Nume complet").fill("Test E2E");
      await page.getByLabel("Email").fill("e2e@example.com");
      await page.getByLabel("Telefon").fill("07221112233");

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
      await page.getByLabel("Telefon").fill("0722111222");

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
      // "Locuri epuizate" is the site's one phrase for this state — the same one
      // the card on /ro/events uses. See components/events/seat-count.tsx.
      //
      // Two matches is the assertion, not an accident of the locator. This page
      // marks the state twice, in two places that are far apart on screen: the
      // badge in the meta line beside the date, and the line under the capacity
      // bar in the registration panel. They used to disagree — "Complet" in the
      // badge, "Locuri epuizate" in the panel — so counting them is what catches
      // either one drifting back to a vocabulary of its own.
      //
      // `exact` because getByText substring-matches and this page has a lot of
      // Romanian on it.
      const soldOut = page.getByText("Locuri epuizate", { exact: true });
      await expect(soldOut).toHaveCount(2);
      await expect(soldOut.first()).toBeVisible();

      // The registration form must be gone and the waiting list offered.
      await expect(page.getByRole("button", { name: "Înscrie-te gratuit" })).toBeHidden();

      await page.getByRole("button", { name: "Intră pe lista de așteptare" }).click();

      await expect(page.locator('[data-verified="true"]')).toBeAttached();
      await page.getByLabel("Nume complet").fill("Maria Ionescu");
      await page.getByLabel("Email").fill(`maria-${Date.now()}@example.com`);
      await page.getByLabel("Telefon").fill("0722333444");
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
      await page.getByLabel("Telefon").fill("0722");
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

/**
 * The event page on a narrow screen.
 *
 * Pinned to 375px rather than left to the project's viewport so this runs on
 * every browser project, not only the mobile one — this is the layout almost
 * every real visitor gets, arriving from an Instagram story on a phone.
 */
test.describe("event page at phone width", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // The page used to lay out 435px wide inside a 390px screen, so opening any
  // event with an open registration form scrolled sideways: you had to pinch
  // out or drag left-to-right to read it.
  //
  // The cause was two defaults compounding. The phone field is a flex row, and
  // an <input> reports a minimum intrinsic width of about 20 characters; a flex
  // item will not shrink below that because `min-width` defaults to `auto`. The
  // card holding it is a grid item, which defaults the same way — so instead of
  // the input overflowing its own box, the column grew, then the grid, then the
  // document. A single unshrinkable input widened the entire page.
  //
  // Asserted on scrollWidth rather than by looking at a screenshot, because a
  // sideways-scrolling page looks completely normal until you try to scroll it.
  test("does not scroll sideways", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expectNoSidewaysScroll(page);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the country picker searches, shows a flag, and reparses the number", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);

      // Romania is preselected and the trigger shows a real image, not a text
      // glyph. The flags used to be emoji, which Windows draws as the bare
      // letters "RO" — fine on the phone, wrong on the desktop she administers
      // the site from.
      const picker = page.getByRole("button", { name: /Prefix țară/ });
      await expect(picker).toContainText("+40");
      await expect(picker.locator("img")).toHaveAttribute("src", "/flags/RO.svg");

      await picker.click();

      // Searching by name, with no diacritics — which is how people type on a
      // phone. "Regatul Unit" is the United Kingdom in Romanian.
      const search = page.getByRole("combobox", { name: "Caută țara" });
      await search.fill("regatul");
      const option = page.getByRole("option", { name: /Regatul Unit/ });
      await expect(option).toBeVisible();
      await option.click();

      await expect(picker).toContainText("+44");
      await expect(picker.locator("img")).toHaveAttribute("src", "/flags/GB.svg");

      // Choosing a country must re-parse the number against it, not just
      // relabel the box.
      const number = page.getByLabel("Telefon");
      await number.fill("07911123456");
      await expect(number).toHaveValue("+44 7911 123456");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // The dialling code is the other way in: someone who knows "+33" should not
  // have to know it is called France.
  test("the country picker can be searched by dialling code", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByRole("button", { name: /Prefix țară/ }).click();

      await page.getByRole("combobox", { name: "Caută țara" }).fill("+33");
      await page.getByRole("option", { name: /\+33$/ }).first().click();

      await expect(page.getByRole("button", { name: /Prefix țară/ })).toContainText("+33");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  // A native <select> draws its options outside the page, so on a desktop
  // browser the 240-entry country list spilled past the window edge. The
  // replacement is an ordinary element anchored to the field, so it cannot.
  test("the open country list stays inside the viewport", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByRole("button", { name: /Prefix țară/ }).click();
      await expect(page.getByRole("listbox")).toBeVisible();

      await expectCountryListInsideViewport(page);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

/**
 * The same page at 320px.
 *
 * 320 is the floor worth supporting — the width of an iPhone SE, and still what
 * a phone reports with the largest accessibility text size, which shrinks the
 * CSS viewport. It is deliberately narrower than the 375px block above, because
 * overflow is a min-content problem: an element that refuses to shrink below
 * its content shows up first on the narrowest screen, and only at some widths.
 * A layout can pass at 375 and still scroll sideways at 320.
 *
 * Only the two layout assertions run here. The picker's search and parsing
 * behaviour is not viewport-sensitive and is already covered above; repeating
 * it would double the runtime of this file for nothing.
 *
 * Like the block above this is pinned rather than left to the project, so it
 * runs on both engines — WebKit and Chromium disagree about intrinsic sizing
 * often enough that testing one is not testing the other.
 */
test.describe("event page at 320px, the narrowest supported width", () => {
  test.use({ viewport: { width: 320, height: 658 } });

  test("does not scroll sideways", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await expectNoSidewaysScroll(page);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the open country list stays inside the viewport", async ({ page }) => {
    const event = await seedEvent({ price: 0, max_participants: 10 });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await page.getByRole("button", { name: /Prefix țară/ }).click();
      await expect(page.getByRole("listbox")).toBeVisible();

      await expectCountryListInsideViewport(page);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

/**
 * A capacity nobody set means nobody can book.
 *
 * WHAT THIS IS REALLY GUARDING
 *
 * `max_participants` used to mean "unlimited" when it was NULL, so an event
 * saved without a number took bookings from an unbounded number of people and
 * said nothing about it — the seat count rendered nothing, so the card looked
 * exactly like one with seats left. It now reads as sold out, and zero is legal
 * and means the same thing on purpose: she fills an event through Instagram and
 * still wants the date on the site so a place that frees up can be taken.
 *
 * The page saying "sold out" is the least important half of that. Hiding a form
 * is presentation, and presentation can be undone with developer tools or
 * skipped entirely by posting to /api/register. So every case below checks the
 * booking itself is refused, not just that the form is gone —
 * `register_for_event()` in
 * supabase/migrations/20260918000000_capacity_is_required.sql is the rule, and
 * this is what proves it is the rule.
 */
test.describe("an event with no seats set cannot be booked", () => {
  /** Post a registration the way the site does, CAPTCHA token and all. */
  const attemptBooking = async (
    request: import("@playwright/test").APIRequestContext,
    eventId: string
  ) =>
    request.post("/api/register", {
      data: {
        eventId,
        fullName: "Test Capacitate",
        email: `capacity-${Date.now()}@example.com`,
        phone: "+40721112233",
        // .env.test uses Cloudflare's always-pass keys, so this clears the
        // CAPTCHA rather than stopping at it — which is what used to make every
        // registration test assert an error message instead of a booking.
        captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
      },
    });

  for (const [name, capacity] of [
    ["left blank", null],
    ["set to zero", 0],
  ] as const) {
    test(`capacity ${name}: sold out on the page and refused by the API`, async ({
      page,
      request,
    }) => {
      const event = await seedEvent({ price: 0, max_participants: capacity });
      try {
        await page.goto(`/ro/events/${event.slug}`);

        // Two places on this page say it, and they have drifted apart before —
        // the badge beside the date and the line under the capacity bar.
        await expect(page.getByText("Locuri epuizate", { exact: true })).toHaveCount(2);

        // No booking form, and the waiting list in its place.
        await expect(page.getByRole("button", { name: "Înscrie-te gratuit" })).toBeHidden();
        await expect(
          page.getByRole("button", { name: "Intră pe lista de așteptare" })
        ).toBeVisible();

        // A fraction needs two real numbers. "0/0 locuri" is not information.
        await expect(page.getByText(/\d+\/\d+ locuri/)).toHaveCount(0);

        /*
         * And the part that actually matters. A hidden form is a suggestion;
         * this is the refusal.
         */
        const response = await attemptBooking(request, event.id);
        expect(
          response.status(),
          "an event with no capacity must refuse a booking, not accept one"
        ).toBeGreaterThanOrEqual(400);
        expect(await response.text()).toContain("complet");

        // Nothing was written, either — a refusal that still inserts a row is
        // not a refusal.
        expect((await registrationsFor(event.id)).length).toBe(0);
      } finally {
        await deleteEventBySlug(event.slug);
      }
    });
  }

  /**
   * The other half of the same rule, and the reason this is not simply "refuse
   * everything": a real capacity still books, exactly once per seat.
   */
  test("a capacity of one still takes one booking and then stops", async ({ request }) => {
    const event = await seedEvent({ price: 0, max_participants: 1 });
    try {
      const first = await attemptBooking(request, event.id);
      expect(first.status(), "the first booking must be accepted").toBeLessThan(400);

      const second = await attemptBooking(request, event.id);
      expect(second.status(), "the second must not be").toBeGreaterThanOrEqual(400);

      expect((await registrationsFor(event.id)).length).toBe(1);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * On a card, the same state has to read the same way. This is the listing the
   * home page's "see all events" leads to, and an event that says nothing about
   * seats is what the whole change was about.
   */
  test("a card for an event with no capacity says sold out rather than nothing", async ({
    page,
  }) => {
    const blank = await seedEvent({ max_participants: null });
    const zero = await seedEvent({ max_participants: 0 });
    try {
      await page.goto("/ro/events");
      for (const event of [blank, zero]) {
        await expect(page.locator(`a[href$="/events/${event.slug}"]`)).toContainText(
          "Locuri epuizate"
        );
      }
    } finally {
      await deleteEventBySlug(blank.slug);
      await deleteEventBySlug(zero.slug);
    }
  });
});

/**
 * The address opens a map when she has pinned one.
 *
 * `events.map_link` takes either a URL she pasted or a coordinate pair, and it
 * ends up as the `href` of a link on a public page — so what it refuses matters
 * as much as what it accepts. lib/map-link.ts is the boundary.
 */
test.describe("the event address opens a map", () => {
  test("coordinates become a pin, and a pasted link is used as given", async ({ page }) => {
    const pinned = await seedEvent({
      location: "Parcul Central, Cluj-Napoca",
      map_link: "46.7712, 23.5949",
    });
    const linked = await seedEvent({
      location: "Brașov",
      map_link: "https://www.google.com/maps/search/?api=1&query=Bra%C8%99ov",
    });
    try {
      await page.goto(`/ro/events/${pinned.slug}`);
      const address = page.getByRole("link", { name: /Parcul Central/ });
      await expect(address).toHaveAttribute("href", /46\.7712/);
      // Leaves the site, so it must not hand the destination a window opener.
      await expect(address).toHaveAttribute("rel", /noopener/);

      await page.goto(`/ro/events/${linked.slug}`);
      await expect(page.getByRole("link", { name: /Brașov/ })).toHaveAttribute(
        "href",
        /google\.com\/maps/
      );
    } finally {
      await deleteEventBySlug(pinned.slug);
      await deleteEventBySlug(linked.slug);
    }
  });

  test("no map link leaves the address as plain text", async ({ page }) => {
    const event = await seedEvent({ location: "Cluj-Napoca", map_link: null });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByText("Cluj-Napoca").first()).toBeVisible();
      await expect(page.getByRole("link", { name: /Cluj-Napoca/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Vezi locația" })).toHaveCount(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * THE ONE THAT IS NOT ABOUT CONVENIENCE
   *
   * This value is typed into the admin panel and becomes an href. `javascript:`
   * is a perfectly valid URL as far as `new URL()` is concerned, and a `data:`
   * URL can carry a whole document — so lib/map-link.ts checks the scheme
   * against a list of two rather than against a list of things to reject.
   *
   * Refused input renders as plain text. Nothing is shown to the visitor about
   * it, because a link that goes nowhere is worse than no link and she is the
   * only person who could fix it.
   */
  for (const hostile of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "not a link at all",
    "999.0, 999.0",
  ]) {
    test(`refuses to link "${hostile.slice(0, 24)}"`, async ({ page }) => {
      const event = await seedEvent({ location: "Cluj-Napoca", map_link: hostile });
      try {
        await page.goto(`/ro/events/${event.slug}`);
        await expect(page.getByRole("link", { name: /Cluj-Napoca/ })).toHaveCount(0);
        const hrefs = await page.locator("a").evaluateAll((els) =>
          els.map((el) => el.getAttribute("href") ?? "")
        );
        expect(hrefs.some((h) => h.startsWith("javascript:") || h.startsWith("data:"))).toBe(
          false
        );
      } finally {
        await deleteEventBySlug(event.slug);
      }
    });
  }
});

/**
 * The calendar entry is a URL now rather than a file the page assembles, which
 * is what lets an iPhone hand it to the Calendar app instead of the Files app.
 */
test.describe("the calendar route", () => {
  test("answers text/calendar with the event in it", async ({ request }) => {
    const event = await seedEvent({ price: 0, location: "Cluj-Napoca" });
    try {
      const res = await request.get(`/api/calendar/event/${event.slug}?locale=ro`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/calendar");
      /*
       * `inline`, not `attachment`. Attachment is what tells iOS to download
       * the file rather than open it, which is the behaviour the route exists
       * to avoid — so this is the assertion that protects the whole point.
       */
      expect(res.headers()["content-disposition"]).toContain("inline");

      const ics = await res.text();
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain(`Eveniment E2E ${event.slug}`);
      expect(ics).toContain("LOCATION:Cluj-Napoca");
      // A way back to the page, which is the question somebody actually has
      // three weeks later.
      expect(ics).toMatch(/URL:https?:\/\/.+\/events\//);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("does not serve a draft", async ({ request }) => {
    const event = await seedEvent({ published: false });
    try {
      expect((await request.get(`/api/calendar/event/${event.slug}`)).status()).toBe(404);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

test.describe("tooltips look like the site, and are actually drawn", () => {
  /**
   * THE BUG THIS CATCHES, WHICH NO STYLE ASSERTION WOULD
   *
   * The tooltip is the trigger's own `::after`, so a trigger with hidden
   * overflow clips it out of existence. `truncate` is the usual way in — it is
   * three declarations under one name, and `overflow: hidden` is the one nobody
   * is thinking about when they reach for it.
   *
   * The header wordmark had exactly that. Its tooltip computed as fully opaque,
   * would have passed any check on `opacity` or `content`, and painted nothing
   * whatsoever. It was found by looking at a screenshot.
   *
   * So this asserts the property that actually matters and cannot be faked:
   * no element carrying `data-tooltip` may clip its own overflow.
   */
  for (const path of ["/ro", "/ro/events"]) {
    test(`no tooltip on ${path} is clipped by its own trigger`, async ({ page }) => {
      await page.goto(path);

      const triggers = await page.evaluate(() =>
        [...document.querySelectorAll("[data-tooltip]")].map((el) => ({
          tip: el.getAttribute("data-tooltip") ?? "",
          overflow: getComputedStyle(el).overflow,
        }))
      );

      expect(triggers.length, "this page has no tooltips to check").toBeGreaterThan(0);
      expect(
        triggers.filter((t) => t.overflow !== "visible"),
        "these triggers hide their own overflow, so their tooltip cannot paint"
      ).toEqual([]);
    });
  }

  /**
   * And that they are ours rather than the operating system's.
   *
   * A `title` attribute draws a black box with white text in the system font,
   * which on a cream and sage page looks like a fault. It cannot be styled —
   * no browser exposes a hook — so the only way to match the site is not to use
   * it. This fails if one comes back.
   */
  test("no public page falls back to the browser's own tooltip", async ({ page }) => {
    for (const path of ["/ro", "/ro/events", "/ro/blog", "/ro/contact"]) {
      await page.goto(path);
      const native = await page.evaluate(() =>
        [...document.querySelectorAll("[title]")]
          // An <iframe> title is its accessible name, not a tooltip, and a
          // <title> inside an SVG is a label. Neither draws the OS box.
          .filter((el) => !["IFRAME", "TITLE", "SVG"].includes(el.tagName))
          .map((el) => `${el.tagName.toLowerCase()}[title="${el.getAttribute("title")}"]`)
      );
      expect(native, `${path} still uses a native title tooltip`).toEqual([]);
    }
  });

  test("the tooltip is drawn in the site's colours, not black on white", async ({ page }) => {
    await page.goto("/ro/events/yoga-in-parc");
    const style = await page.evaluate(() => {
      // Named, not `[data-tooltip]` — the first one on any page is the header
      // wordmark, which is a perfectly good tooltip and the wrong one to assert
      // the event page's content against.
      const el = document.querySelector('summary[data-tooltip="Adaugă în calendar"]')!;
      const after = getComputedStyle(el, "::after");
      return {
        hiddenAtRest: after.opacity === "0",
        content: after.content,
        color: after.color,
        rounded: parseFloat(after.borderRadius) > 0,
      };
    });
    // `--color-charcoal`, #2D2D2D. Not the OS tooltip's white-on-black.
    expect(style.color).toBe("rgb(45, 45, 45)");
    expect(style.rounded).toBe(true);
    expect(style.hiddenAtRest).toBe(true);
    expect(style.content).toContain("calendar");
  });
});

/**
 * The event's date is how you put the event in your calendar, and its address
 * is how you open a map. Both are inline text rather than buttons, so what
 * makes them look tappable is worth pinning: on a phone there is no hover, and
 * the affordance has to survive being read in a screenshot.
 */
test.describe("the event meta row", () => {
  const inDays = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  test("the date adds to a calendar and the address opens a map", async ({ page }) => {
    const event = await seedEvent({
      date: inDays(20),
      time: "18:30",
      end_time: "19:45",
      location: "Parcul Central, Cluj-Napoca",
      map_link: "46.7712, 23.5949",
    });
    try {
      await page.goto(`/ro/events/${event.slug}`);

      const date = page.locator('summary[data-tooltip="Adaugă în calendar"]');
      await expect(date).toBeVisible();
      /*
       * The visible date has to be inside the accessible name rather than
       * replaced by it — WCAG 2.5.3, and the same mistake the share button made
       * when an aria-label pinned its name while its text changed.
       */
      const dateText = (await date.innerText()).trim();
      await expect(date).toHaveAttribute("aria-label", new RegExp(escapeForRegExp(dateText)));

      const address = page.locator('a[data-tooltip="Vezi pe hartă"]');
      await expect(address).toHaveAttribute("href", /46\.7712/);
      await expect(address).toHaveAttribute("aria-label", /Parcul Central/);

      // Both carry the underline that says "this does something" with no
      // pointer present. `none` would mean a phone sees plain text.
      for (const link of [date, address]) {
        await expect(link).toHaveCSS("text-decoration-line", "underline");
      }
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * The buttons these replaced are gone, not merely hidden. A stray control
   * offering the same destination twice is the thing that was being removed.
   */
  test("there is no add-to-calendar or view-location button left", async ({ page }) => {
    const event = await seedEvent({ map_link: "46.7712, 23.5949", location: "Cluj-Napoca" });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByRole("button", { name: /Calendar/i })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Vezi loca[țt]ia/ })).toHaveCount(0);
      // And no embedded map: it cost 1.23MB from Google on a page that
      // otherwise never contacts them.
      await expect(page.locator('iframe[src*="google.com/maps"]')).toHaveCount(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });
});

/**
 * When an event ends, which the site had no way of saying.
 *
 * Every calendar entry it produced was ninety minutes, retreats included, and
 * the page showed a start time with no hint whether to budget an hour or a
 * weekend. A duration column was the first attempt; an end date and an end time
 * are what she actually knows, and what a multi-day event can be said in.
 */
test.describe("when an event ends", () => {
  const inDays = (n: number) =>
    new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  test("a stated end becomes a time range and a correct calendar entry", async ({
    page,
    request,
  }) => {
    const event = await seedEvent({
      date: inDays(21),
      time: "18:30",
      end_time: "19:45",
    });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      // An en dash with thin spaces, which is how a range is set.
      await expect(page.getByText("18:30 – 19:45")).toBeVisible();

      const ics = await (
        await request.get(`/api/calendar/event/${event.slug}?locale=ro`)
      ).text();
      const start = ics.match(/DTSTART:(\d{8}T\d{6})Z/)![1];
      const end = ics.match(/DTEND:(\d{8}T\d{6})Z/)![1];
      const minutes = (Date.parse(toIso(end)) - Date.parse(toIso(start))) / 60000;
      expect(minutes, "the calendar entry must be as long as the event").toBe(75);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an unstated end shows a start time and invents no end", async ({ page }) => {
    const event = await seedEvent({ date: inDays(22), time: "10:00", end_time: null });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await expect(page.getByText("10:00", { exact: true })).toBeVisible();
      await expect(page.getByText(/\d{2}:\d{2}\s*[–-]\s*\d{2}:\d{2}/)).toHaveCount(0);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * A retreat's calendar entry covers the whole thing, not one day of it.
   *
   * The page and the file say different true things here and that is correct:
   * the page shows the dates and the hours kept on each of them, while the
   * entry is one block from the first morning to the last afternoon. Somebody
   * looking at their calendar wants to see the weekend occupied.
   *
   * The duration column could express neither: 2880 minutes modulo a day is
   * zero, so the page printed "09:00 - 09:00" unless specially guarded, and a
   * week meant asking her to type 10080.
   */
  test("a multi-day event keeps its full length in the calendar", async ({ page, request }) => {
    const event = await seedEvent({
      date: inDays(23),
      time: "09:00",
      end_date: inDays(25),
      end_time: "16:00",
    });
    try {
      await page.goto(`/ro/events/${event.slug}`);
      // Both halves on the page: the days, and the hours on those days.
      await expect(page.getByText("09:00 – 16:00")).toBeVisible();

      const ics = await (
        await request.get(`/api/calendar/event/${event.slug}?locale=ro`)
      ).text();
      const start = ics.match(/DTSTART:(\d{8}T\d{6})Z/)![1];
      const end = ics.match(/DTEND:(\d{8}T\d{6})Z/)![1];
      // Two days and seven hours: 09:00 on the first morning to 16:00 on the
      // third afternoon, not the ninety minutes every entry used to get.
      expect((Date.parse(toIso(end)) - Date.parse(toIso(start))) / 60000).toBe(2 * 1440 + 420);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * No start time makes it an all-day entry, which is a different kind of
   * calendar entry rather than one beginning at midnight.
   *
   * RFC 5545 spells this with a DATE-valued DTSTART, and its DTEND is
   * *exclusive* -- a three-day event ending on the 12th is written as the 13th.
   * Getting that wrong renders the entry a day short, which is how somebody
   * books a train home before the retreat has finished.
   */
  test("an event with no announced hour becomes an all-day entry", async ({ request }) => {
    const event = await seedEvent({
      date: "2099-04-10",
      time: null,
      end_date: "2099-04-12",
    });
    try {
      const ics = await (
        await request.get(`/api/calendar/event/${event.slug}?locale=ro`)
      ).text();

      expect(ics, "a DATE value, not a midnight timestamp").toContain(
        "DTSTART;VALUE=DATE:20990410"
      );
      expect(ics, "DTEND is exclusive, so the day after the last day").toContain(
        "DTEND;VALUE=DATE:20990413"
      );
      expect(ics, "no timestamp form anywhere").not.toMatch(/DTSTART:\d{8}T/);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("an end before its start is refused by the database", async () => {
    const { error, slug } = await tryInsertEvent({
      date: "2099-05-10",
      end_date: "2099-05-09",
    });
    try {
      expect(error?.message ?? "", "an end before the start must be refused").toContain(
        "events_end_not_before_start"
      );
    } finally {
      await deleteEventBySlug(slug);
    }
  });

  test("an end time before the start on the same day is refused", async () => {
    const { error, slug } = await tryInsertEvent({
      date: "2099-05-10",
      time: "18:00",
      end_date: "2099-05-10",
      end_time: "17:00",
    });
    try {
      expect(error?.message ?? "").toContain("events_end_time_after_start");
    } finally {
      await deleteEventBySlug(slug);
    }
  });
});

/** `20260918T153000` -> a string Date.parse understands as UTC. */
function toIso(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(
    9,
    11
  )}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The calendar menu, on the platforms this site actually meets.
 *
 * THE RULE THESE PROTECT
 *
 * Detection ranks, it never gates. Every visitor is offered all three
 * calendars whatever their user agent says, because user-agent sniffing is
 * wrong eventually for everybody and the usual way it fails is stranding
 * someone on a path that does not work for them. The order changes; the
 * contents never do. See lib/platform.ts.
 *
 * The in-app case is not an edge case here. Almost everyone arrives from an
 * Instagram link, which means a web view embedded in another app — the place
 * where handing an .ics to the operating system is least likely to do anything
 * visible.
 */
test.describe("the calendar menu on the event date", () => {
  const IN_APP_IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/21F79 Instagram 331.0.0.37.90";

  /** Open the menu and read the options in the order they are offered. */
  const optionsFor = async (page: import("@playwright/test").Page, slug: string) => {
    await page.goto(`/ro/events/${slug}`);
    await page.locator("summary[data-tooltip]").first().click();
    return page.locator(".event-calendar ul a").evaluateAll((els) =>
      els.map((el) => ({
        label: (el.textContent ?? "").trim(),
        href: el.getAttribute("href") ?? "",
        target: el.getAttribute("target"),
        rel: el.getAttribute("rel"),
      }))
    );
  };

  test("offers all three calendars, whatever the device", async ({ page }) => {
    const event = await seedEvent({ time: "18:30", end_time: "19:45" });
    try {
      const options = await optionsFor(page, event.slug);
      expect(options.map((o) => o.label).sort()).toEqual([
        "Apple Calendar (.ics)",
        "Google Calendar",
        "Outlook",
      ]);

      const byLabel = (needle: string) => options.find((o) => o.label.includes(needle))!;

      // The two web calendars open alongside the page rather than replacing it,
      // and must not hand the destination a window opener.
      for (const web of ["Google", "Outlook"]) {
        expect(byLabel(web).target, `${web} should open in a new tab`).toBe("_blank");
        expect(byLabel(web).rel).toContain("noopener");
      }

      /*
       * The .ics is a hand-off to the operating system, not a page to visit, so
       * it stays in this tab — and it comes from the route rather than a blob
       * built in the browser. A Blob produces a *file*, which on an iPhone
       * lands in Files and has to be hunted down; a URL answering
       * `text/calendar` opens the Calendar sheet instead.
       */
      const apple = byLabel("Apple");
      expect(apple.target).toBeNull();
      expect(apple.href).toContain(`/api/calendar/event/${event.slug}`);
      expect(apple.href).not.toMatch(/^(blob|data):/);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * Inside Instagram the .ics stops being the first offer. A link to a web page
   * is the one thing every embedded browser can still do; handing a file to iOS
   * from inside somebody else's web view is the case most likely to do nothing
   * at all. The .ics stays in the list, one line down.
   */
  test("inside an in-app browser, the web calendar is offered first", async ({ browser }) => {
    const event = await seedEvent();
    const context = await browser.newContext({ userAgent: IN_APP_IPHONE });
    const page = await context.newPage();
    try {
      const options = await optionsFor(page, event.slug);
      expect(options[0].label).toBe("Google Calendar");
      expect(options.map((o) => o.label)).toContain("Apple Calendar (.ics)");
    } finally {
      await context.close();
      await deleteEventBySlug(event.slug);
    }
  });

  test("Escape closes it and gives focus back to the date", async ({ page }) => {
    const event = await seedEvent();
    try {
      await page.goto(`/ro/events/${event.slug}`);
      const trigger = page.locator("summary[data-tooltip]").first();
      await trigger.click();
      await expect(page.locator(".event-calendar[open]")).toHaveCount(1);

      await page.keyboard.press("Escape");
      await expect(page.locator(".event-calendar[open]")).toHaveCount(0);
      // Focus on <body> would mean the next Tab restarts from the top of the page.
      expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("SUMMARY");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * `<details>` opens on its own, so the menu is a working list of three links
   * before any JavaScript runs — which matters in an embedded browser that may
   * never get round to running it.
   */
  test("it still opens with JavaScript switched off", async ({ browser }) => {
    const event = await seedEvent();
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(`/ro/events/${event.slug}`);
      await page.locator("summary[data-tooltip]").first().click();
      await expect(page.locator(".event-calendar[open]")).toHaveCount(1);
      await expect(page.locator(".event-calendar ul a")).toHaveCount(3);
    } finally {
      await context.close();
      await deleteEventBySlug(event.slug);
    }
  });
});

/**
 * The .ics as a file, against the spec rather than against a hunch.
 *
 * RFC 5545 §3.1 caps a content line at 75 **octets** and folds the rest onto
 * continuation lines beginning with a space. The generator did not fold at all,
 * so every description produced one enormous line: lenient parsers coped,
 * strict ones rejected the entry, and the ones in between truncated it. Her
 * descriptions are a paragraph, so this was never a theoretical limit.
 *
 * Octets, not characters — "Practică" is eight characters and nine bytes — and
 * a fold may never land inside a multi-byte character, which is why the
 * diacritics are checked after a round trip through unfolding.
 */
test.describe("the .ics is a valid RFC 5545 file", () => {
  const LONG_DESCRIPTION =
    "Practică în aer liber în Parcul Central, pe iarbă, cu saltelele noastre. " +
    "Dacă plouă, ne mutăm în sală; aducem pături, perne și boluri tibetane " +
    "pentru ultima jumătate de oră, când ne așezăm și nu mai facem nimic.";

  const octets = (value: string) => new TextEncoder().encode(value).length;

  test("folds long lines, escapes text, and survives unfolding", async ({ request }) => {
    const event = await seedEvent({
      description_ro: LONG_DESCRIPTION,
      location: "Parcul Central, Cluj-Napoca",
      time: "18:30",
      end_time: "19:45",
    });
    try {
      const response = await request.get(`/api/calendar/event/${event.slug}?locale=ro`);
      const body = await response.text();
      const lines = body.split("\r\n");

      expect(
        lines.filter((line) => octets(line) > 75),
        "RFC 5545 caps a content line at 75 octets"
      ).toEqual([]);

      // Vacuity guard: a generator that emitted nothing would also pass above.
      expect(
        lines.filter((line) => line.startsWith(" ")).length,
        "this description is long enough that it must have been folded"
      ).toBeGreaterThan(0);

      expect(body.endsWith("\r\n"), "the file ends with CRLF").toBe(true);
      expect(/[^\r]\n/.test(body), "every break is CRLF, never a bare LF").toBe(false);

      // Unfold the way a parser does, then check nothing was lost or mangled.
      const unfolded = body.replace(/\r\n[ \t]/g, "");
      const description = unfolded.match(/^DESCRIPTION:(.*)$/m)![1];

      expect(description).toContain("ne mutăm în sală");
      expect(description, "commas are special in a TEXT value").toContain("\\,");
      expect(description, "semicolons are special in a TEXT value").toContain("\\;");
      expect(unfolded).toContain("LOCATION:Parcul Central\\, Cluj-Napoca");

      // Both timestamps explicit UTC, which is what Google's `dates` wants too.
      expect(unfolded).toMatch(/DTSTART:\d{8}T\d{6}Z/);
      expect(unfolded).toMatch(/DTEND:\d{8}T\d{6}Z/);
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("the entry is as long as the event, not a default", async ({ request }) => {
    // The two-day case used to go into everybody's calendar as an hour and a
    // half, and the last row is the one place a default is still correct: an
    // .ics with no end at all is not a valid entry, so it falls back.
    for (const [overrides, expected] of [
      [{ time: "09:00", end_time: "10:15" }, 75],
      [{ time: "09:00", end_date: "__plus2__", end_time: "09:00" }, 2880],
      [{ time: "09:00", end_time: null }, 90],
    ] as const) {
      const date = "2099-06-10";
      const event = await seedEvent({
        ...overrides,
        date,
        end_date: overrides.end_date === "__plus2__" ? "2099-06-12" : null,
      });
      try {
        const ics = await (
          await request.get(`/api/calendar/event/${event.slug}?locale=ro`)
        ).text();
        const stamp = (name: string) => {
          const raw = ics.match(new RegExp(`${name}:(\\d{8}T\\d{6})Z`))![1];
          return Date.parse(
            `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(
              9,
              11
            )}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`
          );
        };
        expect(
          (stamp("DTEND") - stamp("DTSTART")) / 60000,
          JSON.stringify(overrides)
        ).toBe(expected);
      } finally {
        await deleteEventBySlug(event.slug);
      }
    }
  });
});

/**
 * An event's life on the public site (lib/event-phase.ts): bookable before it
 * starts, closed once it has, and in the archive once it is over. An old
 * Instagram story must land on a page that says the event is over, not one
 * that takes a payment (audit B4).
 */
test.describe("an event's life", () => {
  const slugs: string[] = [];
  test.afterEach(async () => {
    while (slugs.length) await deleteEventBySlug(slugs.pop()!);
  });
  const track = <T extends { slug: string }>(event: T) => {
    slugs.push(event.slug);
    return event;
  };

  test("/events marks one under way and keeps past ones in the archive, unless hidden", async ({ page }) => {
    const ongoing = track(
      await seedEvent({ title_ro: `În desfășurare ${unique("t")}`, date: bucharestDate(-1), time: "10:00", end_date: bucharestDate(1) })
    );
    const past = track(await seedEvent({ title_ro: `Trecut ${unique("t")}`, date: bucharestDate(-5) }));
    const hidden = track(
      await seedEvent({ title_ro: `Ascuns din arhivă ${unique("t")}`, date: bucharestDate(-6), show_in_archive: false })
    );

    await page.goto("/ro/events");
    const ongoingCard = page.locator(`a[href$="/events/${ongoing.slug}"]`);
    await expect(ongoingCard).toContainText("În desfășurare");
    // Not bookable, so no price and no seats on its card.
    await expect(ongoingCard.getByText(/locuri/)).toHaveCount(0);

    const archive = page.getByRole("region", { name: "Evenimente trecute" });
    await expect(archive.locator(`a[href$="/events/${past.slug}"]`)).toBeVisible();
    await expect(page.locator(`a[href$="/events/${hidden.slug}"]`)).toHaveCount(0);
  });

  test("the archive is split into pages of twelve", async ({ page }) => {
    for (let i = 0; i < 13; i++) {
      track(await seedEvent({ title_ro: `Arhivă ${unique("a")}`, date: bucharestDate(-20 - i) }));
    }
    await page.goto("/ro/events");
    const pages = page.getByRole("navigation", { name: "Pagini" });
    await pages.getByRole("link", { name: "Pagina 2" }).click();
    await expect(page).toHaveURL(/\/ro\/events\?page=2/);
    await expect(pages.getByRole("link", { name: "Pagina 2" })).toHaveAttribute("aria-current", "page");
    // Page two is the archive alone.
    await expect(page.getByRole("region", { name: "Evenimente trecute" })).toBeVisible();

    const beyond = await page.goto("/ro/events?page=999");
    expect(beyond?.status()).toBe(404);
  });

  test("an ended event's page says so, takes no booking, and shows what participants said", async ({ page }) => {
    const event = track(await seedEvent({ date: bucharestDate(-4), max_participants: 10 }));
    const quote = `A fost minunat ${unique("q")}`;
    await seedTestimonialOn(event.id, quote);
    await seedTestimonialOn(event.id, `Neaprobat ${unique("q")}`, false);

    await page.goto(`/ro/events/${event.slug}`);
    await expect(page.getByText("Încheiat", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Evenimentul s-a încheiat" })).toBeVisible();
    await expect(page.getByLabel("Nume complet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Înscrie-te/ })).toHaveCount(0);
    await expect(page.getByText(/\d+\/\d+ locuri/)).toHaveCount(0);

    const said = page.getByRole("region", { name: "Ce au spus participanții" });
    await expect(said.getByText(quote)).toBeVisible();
    await expect(said.getByText(/^Neaprobat/)).toHaveCount(0);
    await page.getByRole("link", { name: "Vezi evenimentele următoare" }).click();
    await expect(page).toHaveURL(/\/ro\/events$/);
  });

  test("an event under way takes no booking", async ({ page }) => {
    const event = track(await seedEvent({ date: bucharestDate(-1), time: "10:00", end_date: bucharestDate(1) }));
    await page.goto(`/ro/events/${event.slug}`);
    await expect(page.getByRole("heading", { name: "Evenimentul este în desfășurare" })).toBeVisible();
    await expect(page.getByLabel("Nume complet")).toHaveCount(0);
  });

  test("the booking, the waiting list and the database all refuse once an event has started", async ({ request }) => {
    const event = track(
      await seedEvent({ date: bucharestDate(-1), time: "10:00", end_date: bucharestDate(1), price: 0, max_participants: 10 })
    );
    const attendee = (kind: string) => ({
      eventId: event.id,
      fullName: "Test Început",
      email: `${kind}-${unique("m")}@example.com`,
      phone: "+40721112233",
      // .env.test uses Cloudflare's always-pass keys.
      captchaToken: "XXXX.DUMMY.TOKEN.XXXX",
    });

    const booking = await request.post("/api/register", { data: attendee("started") });
    expect(booking.status()).toBe(409);
    expect((await booking.json()).code).toBe("started");

    const waiting = await request.post("/api/register/waiting-list", { data: attendee("started-wait") });
    expect(waiting.status()).toBe(409);
    expect((await waiting.json()).code).toBe("started");

    // The rule itself, below the routes.
    const direct = await registerDirectly(event.id);
    expect(direct.code).toBe("started");
    expect(await registrationsFor(event.id)).toHaveLength(0);
  });

  test("an event with no announced hour closes when its day begins", async () => {
    const today = track(await seedEvent({ date: bucharestDate(0), time: null, max_participants: 10 }));
    expect((await registerDirectly(today.id)).code).toBe("started");
    const tomorrow = track(await seedEvent({ date: bucharestDate(1), time: null, max_participants: 10 }));
    expect((await registerDirectly(tomorrow.id)).success).toBe(true);
  });
});
