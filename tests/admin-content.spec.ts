import { test, expect, type Page } from "@playwright/test";
import {
  contentSnapshot,
  deleteFaqsByQuestion,
  insertBareFaq,
  putContent,
  restoreContent,
  unique,
} from "./helpers";
import { CONTENT_SECTIONS } from "../lib/site-content-schema";

/**
 * "Conținut site" (components/admin/content/*) and the public pages it feeds.
 *
 * Every test that changes a field puts it back as it found it, including
 * deleting a row the test caused to be created, because the public specs read
 * the same seeded content.
 */

const save = (page: Page) => page.getByRole("button", { name: "Salvează modificările" });

/** Waits for the section's form, which proves the client has loaded it. */
async function openSection(page: Page, id: string) {
  await page.goto(`/admin/content/${id}`);
  await expect(save(page)).toBeVisible();
  await expect(page.getByText("Totul e salvat")).toBeVisible();
}

test.describe("the content sections", () => {
  test("every section opens at its own address, in menu order", async ({ page }) => {
    await page.goto("/admin/content");
    await expect(page).toHaveURL(/\/admin\/content\/identity$/);
    const menu = page.getByRole("navigation", { name: "Secțiunile conținutului" });
    await expect(menu.getByRole("link")).toHaveCount(CONTENT_SECTIONS.length);
    const labels = await menu.getByRole("link").allTextContents();
    expect(labels).toEqual(CONTENT_SECTIONS.map((section) => section.title.ro));

    for (const section of CONTENT_SECTIONS) {
      await menu.getByRole("link", { name: section.title.ro, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/content/${section.id}$`));
      await expect(page.getByRole("heading", { level: 2, name: section.title.ro })).toBeVisible();
    }
  });

  test("an unknown section is not found", async ({ page }) => {
    const response = await page.goto("/admin/content/nu-exista");
    expect(response?.status()).toBe(404);
  });
});

test.describe("editing a section", () => {
  test("a text saves with one Save and appears on the site", async ({ page }) => {
    const key = "home.hero_title";
    const before = await contentSnapshot(key);
    const title = `Titlu E2E ${unique("t")}`;
    try {
      await openSection(page, "home");
      await page.getByLabel("Titlu principal").fill(title);
      await expect(page.getByText("Modificări nesalvate")).toBeVisible();
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      await page.goto("/ro");
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    } finally {
      await restoreContent(key, before);
    }
  });

  test("a field with no row yet is created by its first save", async ({ page }) => {
    const key = "seo.tagline";
    const before = await contentSnapshot(key);
    const tagline = `Motto E2E ${unique("m")}`;
    try {
      await restoreContent(key, null);
      await openSection(page, "seo");
      await page.getByLabel("Motto").fill(tagline);
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      expect((await contentSnapshot(key))?.value_ro).toBe(tagline);
      await page.goto("/ro");
      await expect(page).toHaveTitle(new RegExp(`^${tagline} · `));
    } finally {
      await restoreContent(key, before);
    }
  });

  test("in English, each field shows the Romanian and an empty one uses it", async ({ page }) => {
    const key = "home.hero_title";
    const before = await contentSnapshot(key);
    const romanian = `Titlu românesc ${unique("r")}`;
    try {
      await putContent(key, romanian, "An English title");
      await openSection(page, "home");
      await page.getByRole("radio", { name: /EN/ }).check({ force: true });

      const field = page.locator('[data-field="home.hero_title"]');
      await expect(field.getByText(romanian)).toBeVisible();
      await field.getByRole("textbox").fill("");
      await expect(field.getByText("Gol: pe site apare textul în română.")).toBeVisible();
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      expect((await contentSnapshot(key))?.value_en).toBeNull();
      await page.goto("/en");
      await expect(page.getByRole("heading", { level: 1, name: romanian })).toBeVisible();
    } finally {
      await restoreContent(key, before);
    }
  });

  test("paragraphs survive from the editor to the page (B6)", async ({ page }) => {
    const key = "home.intro";
    const before = await contentSnapshot(key);
    try {
      await openSection(page, "home");
      const editor = page.locator('[data-field="home.intro"]').getByRole("textbox");
      await editor.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Primul paragraf.");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Al doilea paragraf.");
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      await page.goto("/ro");
      await expect(page.locator("p", { hasText: "Primul paragraf." })).toHaveCount(1);
      await expect(page.locator("p", { hasText: "Al doilea paragraf." })).toHaveCount(1);
    } finally {
      await restoreContent(key, before);
    }
  });

  test("leaving with unsaved changes asks first", async ({ page }) => {
    await openSection(page, "home");
    await page.getByLabel("Titlu principal").fill(`Nesalvat ${unique("n")}`);

    const sidebar = page.getByRole("navigation", { name: "Secțiuni admin" });
    await sidebar.getByRole("link", { name: "Evenimente" }).click();
    const dialog = page.getByRole("dialog", { name: "Pleci fără să salvezi?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Rămân aici" }).click();
    await expect(page).toHaveURL(/\/admin\/content\/home$/);

    await sidebar.getByRole("link", { name: "Evenimente" }).click();
    await dialog.getByRole("button", { name: "Pleacă fără să salvez" }).click();
    await expect(page).toHaveURL(/\/admin\/events$/);
  });
});

test.describe("what the content changes on the site", () => {
  test("a menu label changes the header, the phone menu and the footer together", async ({ page }) => {
    const key = "nav.events";
    const before = await contentSnapshot(key);
    try {
      await putContent(key, "Calendar");
      await page.goto("/ro/contact");
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Calendar", exact: true })
      ).toBeVisible();
      await expect(
        page.locator("footer").getByRole("link", { name: "Calendar", exact: true })
      ).toBeVisible();

      await page.setViewportSize({ width: 390, height: 800 });
      await page.getByRole("button", { name: "Deschide meniul" }).click();
      await expect(
        page.locator("#mobile-menu").getByRole("link", { name: "Calendar", exact: true })
      ).toBeVisible();
    } finally {
      await restoreContent(key, before);
    }
  });

  test("the header shows the name, the logo, or both, as chosen", async ({ page }) => {
    const logo = await contentSnapshot("identity.logo");
    const display = await contentSnapshot("identity.display");
    const wordmark = () => page.getByRole("banner").getByRole("link").first();
    try {
      await putContent("identity.logo", "/mock/hero.webp");

      await putContent("identity.display", "logo");
      await page.goto("/ro/contact");
      await expect(wordmark().locator("img")).toHaveCount(1);
      await expect(wordmark().locator("span")).toHaveCount(0);

      await putContent("identity.display", "both");
      await page.reload();
      await expect(wordmark().locator("img")).toHaveCount(1);
      await expect(wordmark().locator("span")).toHaveCount(1);

      await putContent("identity.display", "name");
      await page.reload();
      await expect(wordmark().locator("img")).toHaveCount(0);
      await expect(wordmark().locator("span")).toHaveCount(1);
    } finally {
      await restoreContent("identity.logo", logo);
      await restoreContent("identity.display", display);
    }
  });

  test("TikTok and LinkedIn addresses become working links", async ({ page }) => {
    const tiktok = await contentSnapshot("contact.tiktok_url");
    const linkedin = await contentSnapshot("contact.linkedin_url");
    try {
      await putContent("contact.tiktok_url", "@flow.e2e");
      await putContent("contact.linkedin_url", "linkedin.com/in/flow-e2e");
      await page.goto("/ro/contact");
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: "TikTok" })).toHaveAttribute(
        "href",
        "https://www.tiktok.com/@flow.e2e"
      );
      await expect(footer.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
        "href",
        "https://linkedin.com/in/flow-e2e"
      );
    } finally {
      await restoreContent("contact.tiktok_url", tiktok);
      await restoreContent("contact.linkedin_url", linkedin);
    }
  });
});

test.describe("frequently asked questions", () => {
  test("a question inserted without a choice starts hidden (B14)", async () => {
    const question = `Implicit E2E ${unique("q")}`;
    try {
      expect((await insertBareFaq(question)).published).toBe(false);
    } finally {
      await deleteFaqsByQuestion(question);
    }
  });

  test("create, publish, reorder and translate a question", async ({ page }) => {
    const question = `Întrebare E2E ${unique("q")}?`;
    const english = `E2E question ${unique("e")}?`;
    try {
      await openSection(page, "faq");
      await page.getByRole("button", { name: "Adaugă o întrebare" }).click();
      const items = page.locator("ol > li");
      const last = items.last();
      await last.getByRole("textbox").first().fill(question);
      await last.getByRole("textbox").nth(1).fill("Un răspuns de test.");
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      // Saved but hidden: not on the home page yet.
      await page.goto("/ro");
      await expect(page.getByText(question)).toHaveCount(0);

      // Publish it and move it to the top.
      await openSection(page, "faq");
      const mine = () => items.filter({ has: page.locator(`input[value="${question}"]`) });
      await mine().getByRole("switch").check();
      while (!(await mine().getByRole("button", { name: /mai sus/ }).isDisabled())) {
        await mine().getByRole("button", { name: /mai sus/ }).click();
      }
      await expect(items.first().getByRole("textbox").first()).toHaveValue(question);

      // And give it English.
      await page.getByRole("radio", { name: /EN/ }).check({ force: true });
      await items.first().getByRole("textbox").first().fill(english);
      await save(page).click();
      await expect(page.getByText("Totul e salvat")).toBeVisible();

      await page.goto("/ro");
      await expect(page.locator("details summary").first()).toContainText(question);
      await page.goto("/en");
      await expect(page.locator("details summary").first()).toContainText(english);
    } finally {
      await deleteFaqsByQuestion(question);
    }
  });
});
