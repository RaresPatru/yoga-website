import { test, expect, type Page } from "@playwright/test";
import {
  dashboardCounts,
  deleteMessages,
  messageRow,
  messagesLeft,
  seedManyMessages,
  seedMessage,
  unique,
} from "./helpers";

/**
 * /admin/messages: the three tabs, the Necitite switch the dashboard opens it
 * with, search, the letter and what it can do, and acting on many messages at
 * once. Phase 8 of docs/OVERHAUL.md.
 *
 * This replaces a test that asserted the page showed "either messages or the
 * empty state", which it did whatever the page drew (audit T4).
 *
 * The admin project's window is 1280px wide, where the letter sits beside the
 * list; admin-mobile.spec.ts opens one on a phone.
 */

const seeded: string[] = [];
test.afterEach(async () => {
  if (seeded.length) await deleteMessages(seeded.splice(0));
});

async function seed(overrides: Record<string, unknown> = {}) {
  const id = await seedMessage(overrides);
  seeded.push(id);
  return id;
}

const rows = (page: Page) => page.getByRole("list", { name: "Lista de mesaje" }).getByRole("listitem");
const rowLink = (page: Page, name: string) => rows(page).getByRole("link", { name: new RegExp(name) });
const tabs = (page: Page) => page.getByRole("navigation", { name: "Mesaje primite, cu stea și arhivate" });
const tab = (page: Page, label: string) => tabs(page).getByRole("link", { name: new RegExp(`^${label}`) });
const letter = (page: Page) => page.getByRole("article");
const toasts = (page: Page) => page.getByRole("region", { name: "Notificări" });
const unreadSwitch = (page: Page) => page.getByRole("button", { name: /^Necitite/ });
const bar = (page: Page) => page.getByRole("toolbar", { name: "Acțiuni pentru selecție" });

/** Waits for the heading, which also proves the admin's translations loaded. */
async function open(page: Page, address = "/admin/messages") {
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
}

test.describe("the inbox", () => {
  test("Primite, Cu stea and Arhivă each hold their messages, and say how many", async ({ page }) => {
    const tag = unique("tab");
    const now = new Date().toISOString();
    await seed({ name: `Nou ${tag}` });
    await seed({ name: `Cu stea ${tag}`, starred: true, read_at: now });
    await seed({ name: `Pus deoparte ${tag}`, archived_at: now, read_at: now });
    await seed({ name: `Pastrat ${tag}`, starred: true, archived_at: now, read_at: now });

    await open(page, `/admin/messages?q=${tag}`);
    await expect(tab(page, "Primite")).toHaveAttribute("aria-current", "page");
    await expect(rows(page)).toHaveCount(2);
    await expect(tab(page, "Primite")).toHaveText(/Primite\s*2/);
    await expect(tab(page, "Cu stea")).toHaveText(/Cu stea\s*2/);
    await expect(tab(page, "Arhivă")).toHaveText(/Arhivă\s*2/);

    // Starred ones are here wherever they live, and an archived one says so.
    await tab(page, "Cu stea").click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: `Pastrat ${tag}` })).toContainText("Arhivat");
    await expect(rows(page).filter({ hasText: `Cu stea ${tag}` })).not.toContainText("Arhivat");

    await tab(page, "Arhivă").click();
    await expect(page).toHaveURL(/tab=archive/);
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).filter({ hasText: `Nou ${tag}` })).toHaveCount(0);
  });

  test("the dashboard's link opens Primite with Necitite on, and the switch turns it off", async ({ page }) => {
    const tag = unique("necitit");
    await seed({ name: `Necitit ${tag}` });
    await seed({ name: `Citit ${tag}`, read_at: new Date().toISOString() });

    await open(page, `/admin/messages?filter=unread&q=${tag}`);
    await expect(unreadSwitch(page)).toHaveAttribute("aria-pressed", "true");
    await expect(unreadSwitch(page)).toHaveText(/Necitite\s*1/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`Necitit ${tag}`);
    // An unread message says so to a screen reader, not only with its dot.
    await expect(rowLink(page, `^Necitit: Necitit ${tag}`)).toBeVisible();

    await unreadSwitch(page).click();
    await expect(unreadSwitch(page)).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page)).toHaveCount(2);
    await expect(page).not.toHaveURL(/filter=unread/);
  });

  test("search finds a name without its accents, an address, and words in the message", async ({ page }) => {
    const tag = unique("cauta");
    const email = `cautare-${tag}@example.com`;
    await seed({ name: `Ionuț ${tag}`, email, message: `Aș vrea să știu mai multe despre respirație ${tag}.` });
    await seed({ name: `Altcineva ${tag}` });

    await open(page);
    const box = page.getByRole("searchbox", { name: "Caută după nume, email sau text" });
    await box.fill(`ionut ${tag}`);
    await expect(page).toHaveURL(/q=ionut/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText(`Ionuț ${tag}`);

    await box.fill(email);
    await expect(rows(page)).toHaveCount(1);
    await box.fill(`respiratie ${tag}`);
    await expect(rows(page)).toHaveCount(1);
    await box.fill(tag);
    await expect(rows(page)).toHaveCount(2);

    await box.fill(`nimic-${tag}`);
    await expect(page.getByText(`Niciun mesaj nu se potrivește căutării „nimic-${tag}”.`)).toBeVisible();
    await page.getByRole("link", { name: "Arată toate mesajele" }).click();
    await expect(box).toHaveValue("");
  });

  test("the star on a row works without opening the message", async ({ page }) => {
    const tag = unique("stea");
    const id = await seed({ name: `Irina ${tag}` });
    await open(page, `/admin/messages?q=${tag}`);

    const star = rows(page).getByRole("button", { name: new RegExp(`Irina ${tag}`) });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await messageRow(id))?.starred).toBe(true);
    await expect(tab(page, "Cu stea")).toHaveText(/Cu stea\s*1/);
    expect((await messageRow(id))?.read_at, "starring is not reading").toBeNull();
  });
});

test.describe("the letter", () => {
  test("opening a message marks it read, and shows it with their line breaks, who and what in the serif", async ({ page }) => {
    const tag = unique("scrisoare");
    const id = await seed({
      name: `Maria ${tag}`,
      subject: `Întrebare ${tag}`,
      message: "Rândul unu\nRândul doi\n\nUn paragraf nou.",
    });
    const before = await dashboardCounts();

    await open(page, `/admin/messages?q=${tag}`);
    await rowLink(page, `Maria ${tag}`).click();
    await expect(page).toHaveURL(new RegExp(`m=${id}`));

    const heading = letter(page).getByRole("heading", { level: 2, name: `Maria ${tag}` });
    await expect(heading).toBeVisible();
    await expect(heading, "focus follows her into the letter").toBeFocused();
    const subject = letter(page).getByText(`Întrebare ${tag}`, { exact: true });
    for (const serif of [heading, subject]) {
      expect(await serif.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/playfair/i);
    }
    // A single line break stays one; a blank line starts a paragraph.
    expect(await letter(page).getByText("Rândul unu").innerText()).toBe("Rândul unu\nRândul doi");
    await expect(letter(page).getByText("Un paragraf nou.")).toBeVisible();

    await expect.poll(async () => (await messageRow(id))?.read_at).not.toBeNull();
    await expect(rowLink(page, `^Maria ${tag}`)).toBeVisible();
    await expect.poll(async () => (await dashboardCounts()).unread_messages).toBe(before.unread_messages - 1);
    await expect(unreadSwitch(page)).toHaveText(/Necitite\s*0/);
  });

  test("Răspunde prin email writes back in their language, quoting what they wrote", async ({ page }) => {
    const tag = unique("raspuns");
    const english = await seed({
      name: `Sophie ${tag}`,
      email: `sophie-${tag}@example.com`,
      subject: "Parking",
      message: "Hi!\nIs there parking?",
      locale: "en",
    });
    const romanian = await seed({ name: `Ionuț ${tag}`, subject: null, message: "Se poate și fără saltea?" });

    await open(page, `/admin/messages?m=${english}`);
    await expect(letter(page)).toContainText("Scris pe site-ul în engleză");
    let reply = new URL((await page.getByRole("link", { name: "Răspunde prin email" }).getAttribute("href")) ?? "");
    expect(reply.protocol).toBe("mailto:");
    expect(decodeURIComponent(reply.pathname)).toBe(`sophie-${tag}@example.com`);
    expect(reply.searchParams.get("subject")).toBe("Re: Parking");
    let body = reply.searchParams.get("body") ?? "";
    expect(body.startsWith("\r\n\r\nOn ")).toBe(true);
    expect(body).toContain(`, Sophie ${tag} wrote:\r\n> Hi!\r\n> Is there parking?`);

    await open(page, `/admin/messages?m=${romanian}`);
    await expect(letter(page)).not.toContainText("Scris pe site-ul în engleză");
    reply = new URL((await page.getByRole("link", { name: "Răspunde prin email" }).getAttribute("href")) ?? "");
    // No subject of their own: the reply says what it answers.
    expect(reply.searchParams.get("subject")).toMatch(/^Mesajul tău către \S/);
    body = reply.searchParams.get("body") ?? "";
    expect(body.startsWith("\r\n\r\nPe ")).toBe(true);
    expect(body).toContain(`, Ionuț ${tag} a scris:\r\n> Se poate și fără saltea?`);
  });

  test("from the letter: star it, archive it, bring it back, and mark it unread", async ({ page }) => {
    const tag = unique("actiuni");
    const id = await seed({ name: `Elena ${tag}` });
    await open(page, `/admin/messages?q=${tag}`);
    await rowLink(page, `Elena ${tag}`).click();

    const star = letter(page).getByRole("button", { name: "Marchează cu stea" });
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await messageRow(id))?.starred).toBe(true);

    await letter(page).getByRole("button", { name: "Arhivează" }).click();
    await expect(toasts(page)).toContainText("Mesaj arhivat.");
    await expect(page).not.toHaveURL(/m=/);
    await expect(rows(page)).toHaveCount(0);
    await expect.poll(async () => (await messageRow(id))?.archived_at).not.toBeNull();

    await tab(page, "Arhivă").click();
    await rowLink(page, `Elena ${tag}`).click();
    await letter(page).getByRole("button", { name: "Mută în Primite" }).click();
    await expect(toasts(page)).toContainText("Mesaj mutat în Primite.");
    await expect.poll(async () => (await messageRow(id))?.archived_at).toBeNull();

    await tab(page, "Primite").click();
    await rowLink(page, `Elena ${tag}`).click();
    await expect(letter(page).getByRole("heading", { level: 2 })).toBeVisible();
    await letter(page).getByRole("button", { name: "Marchează ca necitit" }).click();
    await expect(toasts(page)).toContainText("Mesaj marcat ca necitit.");
    await expect.poll(async () => (await messageRow(id))?.read_at).toBeNull();
    await expect(rowLink(page, `^Necitit: Elena ${tag}`)).toBeVisible();
  });

  test("deleting asks first, and only a yes deletes", async ({ page }) => {
    const tag = unique("sterge");
    const id = await seed({ name: `Dan ${tag}` });
    await open(page, `/admin/messages?m=${id}`);

    const question = page.getByRole("dialog", { name: `Ștergi definitiv mesajul de la Dan ${tag}?` });
    await letter(page).getByRole("button", { name: "Șterge", exact: true }).click();
    await question.getByRole("button", { name: "Anulează" }).click();
    await expect(question).toBeHidden();
    expect(await messageRow(id)).not.toBeNull();

    await letter(page).getByRole("button", { name: "Șterge", exact: true }).click();
    await question.getByRole("button", { name: "Șterge definitiv" }).click();
    await expect(toasts(page)).toContainText("Mesaj șters.");
    await expect.poll(() => messageRow(id)).toBeNull();
    await expect(page).not.toHaveURL(/m=/);
  });

  test("each message has its own address: a refresh keeps it open, and one that is gone says so", async ({ page }) => {
    const tag = unique("adresa");
    const id = await seed({ name: `Radu ${tag}` });
    await open(page, `/admin/messages?m=${id}`);
    const heading = letter(page).getByRole("heading", { level: 2, name: `Radu ${tag}` });
    await expect(heading).toBeVisible();
    await page.reload();
    await expect(heading).toBeVisible();

    await letter(page).getByRole("button", { name: "Închide mesajul" }).click();
    await expect(page).not.toHaveURL(/m=/);
    await expect(page.getByText("Alege un mesaj ca să-l citești.")).toBeVisible();

    await open(page, "/admin/messages?m=00000000-0000-4000-8000-000000000000");
    await expect(letter(page)).toContainText("Mesajul nu mai există. Poate a fost șters.");
    // An address edited by hand is no such message either, not an error.
    await open(page, '/admin/messages?m=nu-e-un-mesaj"');
    await expect(letter(page)).toContainText("Mesajul nu mai există. Poate a fost șters.");
  });
});

test.describe("many at once", () => {
  test("ticks several, or all that match, and acts on them together", async ({ page }) => {
    const tag = unique("multe");
    const ids = await seedManyMessages(27, `Grup ${tag}`);
    seeded.push(...ids);

    await open(page, `/admin/messages?q=${tag}`);
    await expect(rows(page)).toHaveCount(25);
    await page.getByLabel("Selectează toate de pe pagină").check();
    await expect(page.getByText("Toate cele 25 de pe această pagină sunt selectate.")).toBeVisible();
    await page.getByRole("button", { name: "Selectează toate cele 27" }).click();
    await expect(bar(page)).toContainText("Selectate: 27");

    // "All 27" are the ones she was shown: one that arrives while she is
    // choosing is not archived with them.
    const late = await seed({ name: `Grup ${tag} târziu` });
    await bar(page).getByRole("button", { name: "Arhivează" }).click();
    await expect(toasts(page)).toContainText("Arhivate: 27.");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("târziu");
    expect((await messageRow(late))?.archived_at).toBeNull();

    // A few, from the bar's menu.
    await tab(page, "Arhivă").click();
    await expect(rows(page)).toHaveCount(25);
    await rows(page).nth(0).getByRole("checkbox").check();
    await rows(page).nth(1).getByRole("checkbox").check();
    await expect(bar(page)).toContainText("Selectate: 2");
    await bar(page).getByRole("button", { name: "Mai multe" }).click();
    await page.getByRole("menuitem", { name: "Adaugă stea" }).click();
    await expect(toasts(page)).toContainText("Cu stea: 2.");
    await expect(tab(page, "Cu stea")).toHaveText(/Cu stea\s*2/);

    // Deleting all that match says how many, and waits for a yes.
    await page.getByLabel("Selectează toate de pe pagină").check();
    await page.getByRole("button", { name: "Selectează toate cele 27" }).click();
    await bar(page).getByRole("button", { name: "Șterge" }).click();
    await page.getByRole("dialog", { name: "Ștergi definitiv 27 de mesaje?" }).getByRole("button", { name: "Șterge definitiv" }).click();
    await expect(toasts(page)).toContainText("Șterse definitiv: 27.");
    expect(await messagesLeft(ids)).toBe(0);
    expect(await messageRow(late)).not.toBeNull();
  });
});

test("the inbox in English", async ({ page }) => {
  const tag = unique("english");
  await seed({ name: `Laura ${tag}` });
  await open(page, `/admin/messages?q=${tag}`);
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();
  const english = page.getByRole("navigation", { name: "Inbox, starred and archived messages" });
  for (const label of ["Inbox", "Starred", "Archive"]) {
    await expect(english.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /^Unread/ })).toBeVisible();
  await page.getByRole("button", { name: "Treci la română" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mesaje" })).toBeVisible();
});
