import { test, expect, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";
import {
  bucharestDate,
  deleteEventBySlug,
  emailsTo,
  insertReviewLink,
  reviewLinkFor,
  reviewLinksFor,
  seedEvent,
  seedRegistrationFor,
  testimonialForBooking,
  unique,
  updateTestimonial,
} from "./helpers";

/**
 * Verified reviews, from a participant's side: asking for the link, writing
 * through it, and what reaches the site. Phase 6 of docs/OVERHAUL.md.
 *
 * Emails go to the local mailbox (lib/email.ts), which is how these read the
 * link someone would receive.
 */

const slugs: string[] = [];
test.afterEach(async () => {
  while (slugs.length) await deleteEventBySlug(slugs.pop()!);
});

async function pastEvent(overrides: Record<string, unknown> = {}) {
  const event = await seedEvent({ date: bucharestDate(-3), time: "10:00", ...overrides });
  slugs.push(event.slug);
  return event;
}

/** Asks for links the way the share page does, CAPTCHA and all (the test keys always pass). */
const askForLink = (request: APIRequestContext, email: string) =>
  request.post("/api/reviews/request", { data: { email, captchaToken: "XXXX.DUMMY.TOKEN.XXXX", locale: "ro" } });

/** A photo with its camera's details and a GPS position, as a phone writes one. */
async function photoWithLocation(): Promise<Buffer> {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: "#9CAF88" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "PhoneCam", Model: "E2E" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "46/1 46/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "23/1 35/1 0/1" },
    })
    .toBuffer();
}

test.describe("writing a testimonial", () => {
  test("from asking for the link to being published, verified", async ({ page, request }) => {
    const event = await pastEvent();
    const email = `${unique("review")}@example.com`;
    const booking = await seedRegistrationFor(event.id, { full_name: "Ana Maria Popescu", email });

    await page.goto("/ro/testimonials/share");
    await expect(page.locator('[data-verified="true"]')).toBeAttached();
    await page.getByLabel("Emailul cu care te-ai înscris").fill(email);
    await page.getByRole("button", { name: "Trimite-mi linkul" }).click();
    await expect(page.getByRole("heading", { name: "Verifică-ți emailul" })).toBeVisible();

    const link = await reviewLinkFor(email);
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: "Bună, Ana!" })).toBeVisible();
    await expect(page.getByText(`Cum a fost la Eveniment E2E ${event.slug}?`)).toBeVisible();

    await page.locator("label", { has: page.getByRole("radio", { name: "4 din 5" }) }).click();
    const text = page.getByRole("textbox", { name: "Ce ai vrea să afle alții?" });
    await text.click();
    await page.keyboard.type("A fost ");
    // The toolbar hands the focus back to the text before the next letter.
    await page.getByRole("button", { name: "Îngroșat" }).click();
    await expect(text).toBeFocused();
    await expect(page.getByRole("button", { name: "Îngroșat" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.type("liniștitor");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type(" de la început până la sfârșit.");
    await page.getByText("Ana Maria Popescu", { exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "poza.jpg",
      mimeType: "image/jpeg",
      buffer: await photoWithLocation(),
    });
    await expect(page.getByRole("img", { name: "Fotografia aleasă" })).toBeVisible();
    await page.getByLabel("Un link video (opțional)").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByLabel(/Sunt de acord ca testimonialul meu/).check();
    await page.getByRole("button", { name: "Trimite testimonialul" }).click();
    await expect(page.getByRole("heading", { name: "Mulțumim!" })).toBeVisible();

    const stored = await testimonialForBooking(booking);
    expect(stored).toMatchObject({
      source: "participant",
      approved: false,
      rating: 4,
      author_name: "Ana Maria Popescu",
      locale: "ro",
      content: "<p>A fost <strong>liniștitor</strong> de la început până la sfârșit.</p>",
    });
    expect(stored?.consent_at).not.toBeNull();

    // The photo arrives as WebP, with nothing left of its camera or location.
    const photo = Buffer.from(await (await request.get(String(stored?.photo_url))).body());
    expect(photo.subarray(0, 4).toString()).toBe("RIFF");
    expect(photo.subarray(8, 12).toString()).toBe("WEBP");
    const metadata = await sharp(photo).metadata();
    expect(metadata.exif, "no EXIF, so no GPS position").toBeUndefined();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(1600);

    // Nothing is public until she approves it.
    await page.goto("/ro/testimonials");
    await expect(page.getByText("liniștitor")).toHaveCount(0);
    await updateTestimonial(String(stored?.id), { approved: true });
    await page.goto("/ro/testimonials");
    const card = page.getByRole("article").filter({ hasText: "liniștitor" });
    await expect(card).toContainText("Participare verificată");
    await expect(card.getByRole("button", { name: /Pornește videoul de pe YouTube/ })).toBeVisible();
    await expect(card.getByRole("img", { name: "Fotografie de la Ana Maria Popescu" })).toBeVisible();

    // The link worked once.
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Ai scris deja testimonialul" })).toBeVisible();
  });

  test("an English booking is written to in English", async ({ request }) => {
    const event = await pastEvent();
    const email = `${unique("review-en")}@example.com`;
    await seedRegistrationFor(event.id, { full_name: "Jane Doe", email, locale: "en" });

    expect((await askForLink(request, email)).status()).toBe(200);
    const [message] = await emailsTo(email);
    expect(message.Subject).toContain("E2E Event");
    expect(message.HTML).toContain("/en/testimonials/write?token=");
    expect(message.HTML).toContain("Write a testimonial");
  });
});

test.describe("who may write", () => {
  test("only people who came get a link, and the answer is the same for everyone", async ({ request }) => {
    const event = await pastEvent({ price: 100 });
    const people = {
      paid: { payment_status: "completed" },
      removed: { payment_status: "completed", removed_at: new Date().toISOString(), removal_reason: "Test" },
      refundAsked: { payment_status: "completed", refund_requested_at: new Date().toISOString() },
      refunded: { payment_status: "refunded" },
      unpaid: { payment_status: "pending" },
    };
    const emails: Record<string, string> = {};
    for (const [who, state] of Object.entries(people)) {
      emails[who] = `${unique(who.toLowerCase())}@example.com`;
      await seedRegistrationFor(event.id, { email: emails[who], ...state });
    }
    const stranger = `${unique("stranger")}@example.com`;

    for (const email of [...Object.values(emails), stranger]) {
      const response = await askForLink(request, email);
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    }

    expect(await emailsTo(emails.paid)).toHaveLength(1);
    for (const who of ["removed", "refundAsked", "refunded", "unpaid"]) {
      expect(await emailsTo(emails[who], 1, 1500), `${who} gets nothing`).toHaveLength(0);
    }
    expect(await emailsTo(stranger, 1, 1500)).toHaveLength(0);
  });

  test("someone whose event is still to come is told when they can write", async ({ request }) => {
    const event = await seedEvent({ date: bucharestDate(10) });
    slugs.push(event.slug);
    const email = `${unique("early")}@example.com`;
    const booking = await seedRegistrationFor(event.id, { email });

    await askForLink(request, email);
    const [message] = await emailsTo(email);
    expect(message.HTML).toContain("Poți scrie după ce se încheie evenimentul");
    expect(message.HTML).not.toContain("testimonials/write");
    expect(await reviewLinksFor(booking)).toHaveLength(0);
  });
});

test.describe("the link", () => {
  const submit = (request: APIRequestContext, token: string, content = "<p>Frumos și liniștit, aș mai veni.</p>") =>
    request.post("/api/reviews", {
      multipart: { token, rating: "5", content, name: "short", consent: "true", video: "" },
    });

  test("works once", async ({ request }) => {
    const event = await pastEvent();
    const booking = await seedRegistrationFor(event.id, { full_name: "Ioana Pop" });
    const token = unique("token-once-0123456789");
    await insertReviewLink(booking, token, new Date(Date.now() + 86_400_000));

    expect((await submit(request, token)).status()).toBe(200);
    expect((await testimonialForBooking(booking))?.author_name).toBe("Ioana P.");

    const again = await submit(request, token);
    expect(again.status()).toBe(410);
    expect((await again.json()).code).toBe("used");
  });

  test("lapses, and a made-up one is refused", async ({ page, request }) => {
    const event = await pastEvent();
    const booking = await seedRegistrationFor(event.id);
    const token = unique("token-expired-0123456789");
    await insertReviewLink(booking, token, new Date(Date.now() - 1000));

    await page.goto(`/ro/testimonials/write?token=${token}`);
    await expect(page.getByRole("heading", { name: "Linkul a expirat" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cere un link nou" })).toHaveAttribute("href", "/ro/testimonials/share");
    expect((await submit(request, token)).status()).toBe(410);

    await page.goto("/ro/testimonials/write?token=nu-exista-un-astfel-de-link-0123456789");
    await expect(page.getByRole("heading", { name: "Linkul nu funcționează" })).toBeVisible();
  });

  test("keeps paragraphs, bold and italics, and nothing else", async ({ page, request }) => {
    const event = await pastEvent();
    const booking = await seedRegistrationFor(event.id);
    const token = unique("token-xss-0123456789");
    await insertReviewLink(booking, token, new Date(Date.now() + 86_400_000));

    const hostile =
      '<p onclick="alert(1)">Bun <strong>eveniment</strong> <em>zic</em></p>' +
      '<script>alert(1)</script><img src=x onerror="alert(2)">' +
      '<a href="javascript:alert(3)">link</a><style>body{display:none}</style>' +
      '<iframe src="https://evil.example"></iframe><h1>Titlu</h1>';
    expect((await submit(request, token, hostile)).status()).toBe(200);

    const stored = String((await testimonialForBooking(booking))?.content);
    expect(stored).toBe("<p>Bun <strong>eveniment</strong> <em>zic</em></p>linkTitlu");
    expect(stored).not.toMatch(/script|onerror|onclick|javascript|style|iframe|<h1|<a|<img/i);

    await updateTestimonial(String((await testimonialForBooking(booking))?.id), { approved: true });
    let dialog = false;
    page.on("dialog", async (d) => {
      dialog = true;
      await d.dismiss();
    });
    await page.goto("/ro/testimonials");
    await expect(page.getByText("Bun eveniment zic")).toBeVisible();
    expect(dialog, "no script ran").toBe(false);
  });
});
