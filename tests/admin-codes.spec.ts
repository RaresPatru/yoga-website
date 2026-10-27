import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  adminAccessToken,
  announcementCodes,
  anonStorageClient,
  bookingsOn,
  deleteAnnouncementsTitled,
  deleteEventBySlug,
  registrationById,
  seedAnnouncement,
  seedEvent,
  seedRegistrationFor,
  setMarketingConsent,
  unique,
} from "./helpers";
import {
  ageCode,
  bookByApi,
  paySession,
  resetStripe,
  sessionIdOf,
  stripeCalls,
  stripePromotionCodes,
} from "./stripe-helpers";
import { codesCarried } from "../lib/announcement-codes";

/**
 * Coduri de reducere (/admin/codes): promotion codes she makes for her
 * announcements, kept in Stripe (the suite's stand-in, tests/fake-stripe.ts),
 * which applies them on its payment page and counts their uses.
 *
 * Stripe neither changes nor deletes a code, so an edit makes a new version
 * and a deletion switches the code off (lib/promotion-codes.ts). And because
 * she hands codes out in announcements, the site records which codes each
 * announcement carried and asks before she breaks what someone's email told
 * them (Rares, 5 and 27 October 2026).
 */

const SUBJECT = "Cod E2E";
const DAY = 24 * 60 * 60 * 1000;

test.beforeEach(async () => {
  await resetStripe();
});

test.afterAll(async () => {
  await deleteAnnouncementsTitled(SUBJECT);
});

/** The codes listed under "Codurile tale" (toasts are list items too). */
const codeList = (page: Page) => page.getByRole("region", { name: "Codurile tale" });

/** One code's row in the list. */
const row = (page: Page, word: string) =>
  codeList(page).locator(":scope > ul > li").filter({ has: page.getByText(word, { exact: true }) });

const toasts = (page: Page) => page.getByRole("region", { name: "Notificări" });

/** A word nobody else's test uses: the database remembers which words were emailed. */
const freshWord = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();

const authorised = async () => ({ Authorization: `Bearer ${await adminAccessToken()}` });

async function makeCode(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post("/api/admin/promotion-codes", { headers: await authorised(), data });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()).code as { id: string; code: string };
}

/** Today in Romania plus `days`, as the date input takes it. */
const dayFromNow = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest" }).format(new Date(Date.now() + days * DAY));

/** The version of a code her list shows now: the newest in Stripe, not replaced. */
async function currentVersion(word: string) {
  const versions = (await stripePromotionCodes()).filter((c) => c.code === word && !c.metadata.replaced_by);
  expect(versions, `one current version of ${word}`).toHaveLength(1);
  return versions[0];
}

/**
 * Sends an announcement carrying `word` to one person who opted in, through
 * the admin's own route, as the Trimite button does.
 */
async function announce(request: APIRequestContext, word: string, name = "Ioana Cod") {
  const event = await seedEvent({ max_participants: 10 });
  const email = `${unique("cod")}@example.com`.toLowerCase();
  const booking = await seedRegistrationFor(event.id, { email, full_name: name });
  await setMarketingConsent(booking, new Date(Date.now() - DAY));
  const subject = `${SUBJECT} ${word}`;
  const id = await seedAnnouncement({
    subject_ro: subject,
    body_ro: `<p>Folosește codul <strong>${word}</strong> la plată.</p>`,
    audience: { kind: "ids", ids: [booking] },
  });
  const sent = await request.post(`/api/admin/announcements/${id}/send`, { headers: await authorised(), data: {} });
  expect(sent.status(), await sent.text()).toBe(200);
  return { event, email, name, subject, announcementId: id };
}

test.describe("discount codes", () => {
  test("a code is made in Stripe as she typed it, and listed with its uses", async ({ page }) => {
    await page.goto("/admin/codes");
    await expect(page.getByRole("heading", { level: 1, name: "Coduri de reducere" })).toBeVisible();
    await expect(page.getByText("Niciun cod încă.", { exact: false })).toBeVisible();
    await expect(page.getByText(/ultimele 30 de zile/)).toBeVisible();

    await page.getByLabel("Codul", { exact: true }).fill("vara10");
    await expect(page.getByLabel("Codul", { exact: true }), "codes are written in capitals").toHaveValue("VARA10");
    await page.getByRole("radio", { name: "Procent" }).check();
    await page.getByLabel("Procentul").fill("10");
    await page.getByLabel("De câte ori, în total (opțional)").fill("5");
    await page.getByRole("button", { name: "Creează codul" }).click();

    await expect(toasts(page)).toContainText("Codul VARA10 e gata.");
    const item = row(page, "VARA10");
    await expect(item).toContainText("10%");
    await expect(item).toContainText("Folosiri: 0 din 5");
    await expect(item).toContainText("fără dată de final");
    await expect(item).toContainText("Activ");
    await expect(page.getByLabel("Codul", { exact: true }), "the form starts empty again").toHaveValue("");

    const calls = await stripeCalls();
    const coupon = calls.find((c) => c.path === "/v1/coupons")!;
    expect(coupon.params).toMatchObject({ percent_off: "10", duration: "once" });
    const promo = calls.find((c) => c.method === "POST" && c.path === "/v1/promotion_codes")!;
    expect(promo.params).toMatchObject({ code: "VARA10", max_redemptions: "5" });
  });

  test("a code she cannot have is refused in words, before Stripe sees it", async ({ page }) => {
    await page.goto("/admin/codes");
    await page.getByLabel("Codul", { exact: true }).fill("X!");
    await page.getByLabel("Procentul").fill("10");
    // The browser's own pattern check would stop the form first; the server's
    // answer is what this is about, so the form is sent past it.
    await page.locator("form").evaluate((form: HTMLFormElement) => (form.noValidate = true));
    await page.getByRole("button", { name: "Creează codul" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Codul poate avea între 3 și 30 de litere, cifre sau liniuțe.");

    await page.getByLabel("Codul", { exact: true }).fill("CINCI");
    await page.getByLabel("Procentul").fill("150");
    await page.getByRole("button", { name: "Creează codul" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Procentul e un număr întreg de la 1 la 100");
    expect((await stripeCalls()).filter((c) => c.method === "POST")).toEqual([]);
  });

  test("a code turns off, and on again", async ({ page, request }) => {
    await makeCode(request, { code: "TOAMNA-50", kind: "amount", value: 50, currency: "RON" });

    await page.goto("/admin/codes");
    const item = row(page, "TOAMNA-50");
    await expect(item).toContainText("50 RON");
    await item.getByRole("button", { name: /Oprește/ }).click();
    await expect(item).toContainText("Oprit");
    await item.getByRole("button", { name: /Pornește/ }).click();
    await expect(item).toContainText("Activ");
  });

  test("used at checkout, it lowers the price, counts the use, and is kept on the booking", async ({ request, page }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    try {
      await makeCode(request, { code: "PRIETENI25", kind: "percent", value: 25 });

      const { body } = await bookByApi(request, event.id, `${unique("coded")}@example.com`);
      await paySession(sessionIdOf(body.checkoutUrl!), { code: "prieteni25" });

      const [booking] = await bookingsOn(event.id);
      expect(booking.payment_status).toBe("completed");
      expect(booking.amount_paid, "a quarter off 200 lei").toBe(15000);
      expect(booking.discount_code).toBe("PRIETENI25");
      expect((await registrationById(String(booking.id)))?.paid_currency).toBe("ron");

      await page.goto("/admin/codes");
      await expect(row(page, "PRIETENI25")).toContainText("Folosiri: 1");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  /**
   * The two boxes beside each other on one line (Rares, 5 October 2026): the
   * discount's radio buttons used to sit on their own line above its box,
   * which put it a row lower than the code's.
   */
  test("boxes beside each other sit on one line", async ({ page }) => {
    await page.goto("/admin/codes");
    const top = async (label: string) => (await page.getByLabel(label, { exact: true }).boundingBox())!.y;

    for (const kind of ["Procent", "Sumă fixă"]) {
      await page.getByRole("radio", { name: kind }).check();
      const value = kind === "Procent" ? "Procentul" : "Suma";
      expect(Math.abs((await top("Codul")) - (await top(value))), `the code and the ${value.toLowerCase()} with ${kind}`).toBeLessThanOrEqual(1);
    }
    expect(
      Math.abs((await top("Ultima zi (opțional)")) - (await top("De câte ori, în total (opțional)"))),
      "the last day and the uses"
    ).toBeLessThanOrEqual(1);
  });

  test("the copy button puts the code on the clipboard", async ({ page, request }) => {
    // The panel's project grants no clipboard permission, and what matters is
    // what the site hands the clipboard, so the clipboard is a recorder.
    await page.addInitScript(() => {
      const copied: string[] = [];
      (window as unknown as { __copied: string[] }).__copied = copied;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (text: string) => void copied.push(text) },
      });
    });
    const word = freshWord("COPIE");
    await makeCode(request, { code: word, kind: "percent", value: 5 });

    await page.goto("/admin/codes");
    await row(page, word).getByRole("button", { name: `Copiază ${word}` }).click();
    await expect(toasts(page)).toContainText(`Ai copiat codul ${word}.`);
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([word]);
  });

  test("an edit makes a new version in Stripe, keeps the uses, and still works at checkout", async ({ page, request }) => {
    const event = await seedEvent({ price: 200, max_participants: 5 });
    const word = freshWord("VARA");
    try {
      const first = await makeCode(request, { code: word, kind: "percent", value: 10, maxRedemptions: 5 });
      const { body } = await bookByApi(request, event.id, `${unique("edit")}@example.com`);
      await paySession(sessionIdOf(body.checkoutUrl!), { code: word });

      await page.goto("/admin/codes");
      await expect(row(page, word)).toContainText("Folosiri: 1 din 5");
      await row(page, word).getByRole("button", { name: `Editează ${word}` }).click();
      const dialog = page.getByRole("dialog", { name: `Editezi codul ${word}` });
      await expect(dialog.getByLabel("Procentul")).toHaveValue("10");
      await expect(dialog).toContainText("Până acum: 1.");
      await dialog.getByLabel("Procentul").fill("20");
      await dialog.getByLabel("De câte ori, în total (opțional)").fill("10");
      await dialog.getByRole("button", { name: "Salvează modificările" }).click();

      await expect(toasts(page)).toContainText(`Codul ${word} e salvat.`);
      await expect(dialog).toBeHidden();
      await expect(row(page, word), "one code on her list").toHaveCount(1);
      await expect(row(page, word)).toContainText("20%");
      await expect(row(page, word)).toContainText("Folosiri: 1 din 10");

      // In Stripe: the old one off and pointing at the new, which carries the line on.
      const versions = (await stripePromotionCodes()).filter((c) => c.code === word);
      expect(versions).toHaveLength(2);
      const old = versions.find((c) => c.id === first.id)!;
      const replacement = versions.find((c) => c.id !== first.id)!;
      expect(old.active).toBe(false);
      expect(old.metadata.replaced_by).toBe(replacement.id);
      expect(replacement.active).toBe(true);
      expect(replacement.max_redemptions, "the 10 she typed, less the use already made").toBe(9);
      expect(replacement.metadata).toMatchObject({ lineage: first.id, version: "1", uses_before: "1" });

      // And people still type the same word.
      const second = await bookByApi(request, event.id, `${unique("edit2")}@example.com`);
      await paySession(sessionIdOf(second.body.checkoutUrl!), { code: word.toLowerCase() });
      const paid = (await bookingsOn(event.id)).find((b) => b.id === second.body.id)!;
      expect(paid.amount_paid, "a fifth off 200 lei").toBe(16000);
      await page.reload();
      await expect(row(page, word)).toContainText("Folosiri: 2 din 10");
    } finally {
      await deleteEventBySlug(event.slug);
    }
  });

  test("a limit at or below the uses so far is refused, and nothing changes", async ({ page, request }) => {
    const word = freshWord("LIMITA");
    const made = await makeCode(request, { code: word, kind: "percent", value: 10, maxRedemptions: 5 });
    await ageCode(made.id, { times_redeemed: 2 });

    await page.goto("/admin/codes");
    await row(page, word).getByRole("button", { name: `Editează ${word}` }).click();
    const dialog = page.getByRole("dialog", { name: `Editezi codul ${word}` });
    await dialog.getByLabel("De câte ori, în total (opțional)").fill("2");
    await dialog.getByRole("button", { name: "Salvează modificările" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("A fost folosit deja de 2 ori, așa că limita trebuie să fie cel puțin 3.");

    const versions = (await stripePromotionCodes()).filter((c) => c.code === word);
    expect(versions, "no new version").toHaveLength(1);
    expect(versions[0].active, "the code still works").toBe(true);
  });

  test("a code nobody received is deleted without a question, and Undo brings it back", async ({ page, request }) => {
    const word = freshWord("STERS");
    const made = await makeCode(request, { code: word, kind: "percent", value: 15 });

    await page.goto("/admin/codes");
    await row(page, word).getByRole("button", { name: `Șterge ${word}` }).click();
    await expect(toasts(page)).toContainText(`Ai șters codul ${word}.`);
    await expect(page.getByRole("dialog"), "no question first").toHaveCount(0);
    await expect(row(page, word)).toHaveCount(0);
    let code = (await stripePromotionCodes()).find((c) => c.id === made.id)!;
    expect(code.active, "switched off in Stripe, which keeps it").toBe(false);
    expect(code.metadata.deleted_at).toBeTruthy();

    await toasts(page).getByRole("button", { name: "Anulează" }).click();
    await expect(toasts(page)).toContainText(`Codul ${word} e din nou în listă.`);
    await expect(row(page, word)).toContainText("Activ");
    code = (await stripePromotionCodes()).find((c) => c.id === made.id)!;
    expect(code.active).toBe(true);
    expect(code.metadata.deleted_at).toBeUndefined();
  });

  test("switching on a code past its last day is refused, and an edit with a new day revives it", async ({ page, request }) => {
    const word = freshWord("IARNA");
    const made = await makeCode(request, { code: word, kind: "percent", value: 10 });
    const off = await request.post(`/api/admin/promotion-codes/${made.id}`, { headers: await authorised(), data: { active: false } });
    expect(off.status()).toBe(200);
    await ageCode(made.id, { expires_at: Math.floor(Date.now() / 1000) - 60 });

    await page.goto("/admin/codes");
    await expect(row(page, word)).toContainText("Expirat");
    await row(page, word).getByRole("button", { name: /Pornește/ }).click();
    await expect(toasts(page)).toContainText("Codul a expirat sau nu mai are folosiri.");

    await row(page, word).getByRole("button", { name: `Editează ${word}` }).click();
    const dialog = page.getByRole("dialog", { name: `Editezi codul ${word}` });
    await expect(dialog).toContainText("Ziua aceasta a trecut.");
    await dialog.getByLabel("Ultima zi (opțional)").fill(dayFromNow(10));
    await dialog.getByRole("button", { name: "Salvează modificările" }).click();
    await expect(toasts(page)).toContainText(`Codul ${word} e salvat.`);
    // Off before, so off after: an edit never switches a code on by itself.
    await expect(row(page, word)).toContainText("Oprit");
    await row(page, word).getByRole("button", { name: /Pornește/ }).click();
    await expect(row(page, word)).toContainText("Activ");
  });
});

test.describe("discount codes she emailed", () => {
  test("an announcement's codes are found as whole words in capitals, in the version each reader got", () => {
    const texts = (fields: Partial<Parameters<typeof codesCarried>[0]>) => ({
      subject_ro: "",
      subject_en: null,
      body_ro: "",
      body_en: null,
      ...fields,
    });
    const both = (code: string) => [{ code, in_ro: true, in_en: true }];

    expect(codesCarried(texts({ body_ro: "<p>Codul tău: <strong>VARA</strong>.</p>" }), ["VARA"])).toEqual(both("VARA"));
    expect(codesCarried(texts({ subject_ro: "Cod: TOAMNA10" }), ["TOAMNA10"]), "in the subject").toEqual(both("TOAMNA10"));
    expect(
      codesCarried(texts({ body_ro: "<p>Vara aceasta facem yoga la mare.</p>" }), ["VARA", "YOGA"]),
      "an ordinary word is not the code"
    ).toEqual([]);
    expect(codesCarried(texts({ body_ro: "<p>VARA10-BONUS</p>" }), ["VARA10"]), "a longer word").toEqual([]);
    expect(codesCarried(texts({ body_ro: "<p>Scrie VARA10-</p>" }), ["VARA10"]), "a dash after it").toEqual(both("VARA10"));
    expect(
      codesCarried(texts({ body_ro: '<p><a href="https://site.ro/?cod=VARA10">aici</a></p>' }), ["VARA10"]),
      "only what a reader sees"
    ).toEqual([]);
    expect(
      codesCarried(texts({ body_ro: "<p>Cod: TOAMNA</p>", body_en: "<p>No code here.</p>" }), ["TOAMNA"]),
      "English readers got the English text"
    ).toEqual([{ code: "TOAMNA", in_ro: true, in_en: false }]);
    expect(
      codesCarried(texts({ subject_en: "Code IARNA", body_ro: "<p>x</p>", body_en: "<p>y</p>" }), ["IARNA"]),
      "an English subject over the English text"
    ).toEqual([{ code: "IARNA", in_ro: false, in_en: true }]);
    expect(codesCarried(texts({ body_ro: "<p>PRIMAVARA</p>" }), ["primavara"]), "a code Stripe holds in lowercase").toEqual(
      both("PRIMAVARA")
    );
  });

  test("a sent announcement records its codes, and the list says who received each", async ({ page, request }) => {
    const word = freshWord("TRIMIS");
    await makeCode(request, { code: word, kind: "percent", value: 20 });
    const sent = await announce(request, word);
    try {
      expect(await announcementCodes(sent.announcementId)).toEqual([{ code: word, in_ro: true, in_en: true }]);

      await page.goto("/admin/codes");
      const item = row(page, word);
      await item.getByText("Trimis pe email la o persoană").click();
      const people = item.getByRole("listitem");
      await expect(people).toHaveCount(1);
      await expect(people).toContainText(sent.name);
      await expect(people).toContainText(sent.email);
      await expect(people).toContainText(`în „${sent.subject}”`);
      await expect(people.getByRole("link", { name: sent.name })).toHaveAttribute(
        "href",
        `/admin/registrations?q=${encodeURIComponent(sent.email)}`
      );
    } finally {
      await deleteEventBySlug(sent.event.slug);
    }
  });

  test("a code someone received asks before it is deleted, switched off or changed, and says who", async ({ page, request }) => {
    const word = freshWord("PROMIS");
    await makeCode(request, { code: word, kind: "percent", value: 20 });
    const sent = await announce(request, word);
    try {
      await page.goto("/admin/codes");
      const item = row(page, word);
      const question = page.getByRole("dialog").filter({ hasText: sent.name });

      await item.getByRole("button", { name: `Șterge ${word}` }).click();
      await expect(question).toContainText(`Ștergi codul ${word}?`);
      await expect(question).toContainText("L-ai trimis pe email unei persoane, care îl poate folosi încă:");
      await question.getByRole("button", { name: "Anulează" }).click();
      await expect(item).toContainText("Activ");

      await item.getByRole("button", { name: /Oprește/ }).click();
      await expect(question).toContainText(`Oprești codul ${word}?`);
      await question.getByRole("button", { name: "Anulează" }).click();
      await expect(item).toContainText("Activ");

      // The number of uses promised nobody anything: no question.
      await item.getByRole("button", { name: `Editează ${word}` }).click();
      let editor = page.getByRole("dialog", { name: `Editezi codul ${word}` });
      await editor.getByLabel("De câte ori, în total (opțional)").fill("50");
      await editor.getByRole("button", { name: "Salvează modificările" }).click();
      await expect(toasts(page)).toContainText(`Codul ${word} e salvat.`);
      await expect(item).toContainText("din 50");

      // The amount did.
      await item.getByRole("button", { name: `Editează ${word}` }).click();
      editor = page.getByRole("dialog", { name: `Editezi codul ${word}` });
      await editor.getByLabel("Procentul").fill("25");
      await editor.getByRole("button", { name: "Salvează modificările" }).click();
      await expect(question).toContainText(`Schimbi codul ${word}?`);
      await expect(question).toContainText(
        `Emailul lor spune: ${word}, 20%, fără dată de final. După salvare: ${word}, 25%, fără dată de final.`
      );
      await question.getByRole("button", { name: "Salvează modificările" }).click();
      await expect(item).toContainText("25%");
      await expect(item, "the same word, so the same people received it").toContainText("Trimis pe email la o persoană");

      // Past its last day it is worth nothing to them: no question.
      await ageCode((await currentVersion(word)).id, { expires_at: Math.floor(Date.now() / 1000) - 60 });
      await page.reload();
      await expect(item).toContainText("Expirat");
      await item.getByRole("button", { name: `Șterge ${word}` }).click();
      await expect(toasts(page)).toContainText(`Ai șters codul ${word}.`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await deleteEventBySlug(sent.event.slug);
    }
  });

  test("a word that was emailed before asks again when a new code takes it", async ({ page, request }) => {
    const word = freshWord("REVINE");
    const made = await makeCode(request, { code: word, kind: "percent", value: 10 });
    const sent = await announce(request, word, "Mara Revine");
    try {
      const gone = await request.delete(`/api/admin/promotion-codes/${made.id}`, { headers: await authorised() });
      expect(gone.status()).toBe(200);

      await page.goto("/admin/codes");
      await page.getByLabel("Codul", { exact: true }).fill(word);
      await page.getByLabel("Procentul").fill("15");
      await page.getByRole("button", { name: "Creează codul" }).click();
      const question = page.getByRole("dialog").filter({ hasText: sent.name });
      await expect(question).toContainText(`${word} a mai fost trimis pe email`);
      await expect(question).toContainText(`în „${sent.subject}”`);
      await question.getByRole("button", { name: "Anulează" }).click();
      expect((await stripePromotionCodes()).filter((c) => c.code === word), "nothing made").toHaveLength(1);
      await expect(page.getByLabel("Codul", { exact: true }), "what she typed is still there").toHaveValue(word);

      await page.getByRole("button", { name: "Creează codul" }).click();
      await question.getByRole("button", { name: "Creează codul" }).click();
      await expect(toasts(page)).toContainText(`Codul ${word} e gata.`);
      await expect(row(page, word)).toContainText("15%");
    } finally {
      await deleteEventBySlug(sent.event.slug);
    }
  });

  test("Registrations shows who received a code and who paid with one", async ({ page, request }) => {
    const word = freshWord("INSCRIS");
    await makeCode(request, { code: word, kind: "percent", value: 50 });
    const sent = await announce(request, word, "Dana Primit");
    const paidEvent = await seedEvent({ price: 100, max_participants: 5 });
    const payer = `${unique("platit")}@example.com`.toLowerCase();
    try {
      const { body } = await bookByApi(request, paidEvent.id, payer, { fullName: "Paul Folosit" });
      await paySession(sessionIdOf(body.checkoutUrl!), { code: word });

      await page.goto(`/admin/registrations?status=code_received&q=${encodeURIComponent(sent.email)}`);
      const received = page.getByRole("list", { name: "Participanți" }).getByRole("listitem");
      await expect(received).toHaveCount(1);
      await expect(received).toContainText(`Cod primit: ${word}`);
      await expect(page.getByLabel("Stare", { exact: true })).toHaveValue("code_received");

      await page.goto(`/admin/registrations?status=code_used&q=${encodeURIComponent(payer)}`);
      const used = page.getByRole("list", { name: "Participanți" }).getByRole("listitem");
      await expect(used).toHaveCount(1);
      await expect(used).toContainText(`Cod folosit: ${word}`);

      await page.goto(`/admin/registrations?q=${encodeURIComponent(sent.email)}`);
      await page.getByRole("link", { name: sent.name }).click();
      const panel = page.getByRole("dialog");
      await expect(panel.getByRole("heading", { name: "Coduri de reducere" })).toBeVisible();
      await expect(panel.getByRole("link", { name: new RegExp(`${word}, primit în „${sent.subject}”`) })).toHaveAttribute(
        "href",
        `/admin/emails/announcements/${sent.announcementId}`
      );
    } finally {
      await deleteEventBySlug(sent.event.slug);
      await deleteEventBySlug(paidEvent.slug);
    }
  });

  test("the announcement editor puts one of her codes in the text", async ({ page, request }) => {
    const word = freshWord("ANUNT");
    await makeCode(request, { code: word, kind: "percent", value: 10 });
    const id = await seedAnnouncement({ subject_ro: `${SUBJECT} editor ${word}`, body_ro: "" });

    await page.goto(`/admin/emails/announcements/${id}`);
    await page.getByRole("button", { name: "Adaugă un cod de reducere" }).click();
    await page.getByRole("menuitem", { name: word }).click();
    await expect(page.locator(".ProseMirror strong", { hasText: word })).toBeVisible();
  });

  test("visitors cannot read who received a code", async () => {
    const anon = await anonStorageClient();
    for (const source of ["announcement_codes", "admin_code_recipients"]) {
      const { data, error } = await anon.from(source).select("*").limit(1);
      expect(error, `${source} must refuse the publishable key outright`).not.toBeNull();
      expect(data).toBeNull();
    }
  });
});
