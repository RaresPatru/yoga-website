import { test, expect, type Locator, type Page } from "@playwright/test";
import { SHORTCUTS } from "../lib/editor-shortcuts";
import { adminAccessToken, deletePostBySlug, seedPost, unique } from "./helpers";

/**
 * The blog editor's shortcuts, alignment and translation.
 *
 * The first test is the one that keeps the shortcut list honest: it performs
 * every row of lib/editor-shortcuts.ts — each key combination and each thing
 * to type — in a real editor and checks the result. The list is what she will
 * trust, so a TipTap upgrade that drops or renames a shortcut has to fail here
 * rather than in front of her.
 */

/** The part of TipTap's command chain these tests use. */
interface Chain {
  setMeta(key: string, value: unknown): Chain;
  setContent(html: string): Chain;
  focus(position?: "end"): Chain;
  selectAll(): Chain;
  run(): boolean;
}

/** TipTap keeps its instance on the editing element; tests reach it there. */
interface TipTapElement extends HTMLElement {
  editor: { chain(): Chain };
}

/** ProseMirror's key notation as Playwright presses it. `Mod` is Ctrl, or ⌘
 *  on a Mac — the same rule the editor applies. */
function pressable(combo: string): string {
  return combo
    .split(/-(?!$)/)
    .map((part) => (part === "Mod" ? "ControlOrMeta" : part))
    .join("+");
}

const roEditor = (page: Page) => page.getByRole("textbox", { name: "Conținut (RO)", exact: true });
const enEditor = (page: Page) => page.getByRole("textbox", { name: "Conținut (EN)", exact: true });

/**
 * Waits for the translated toolbar as well as the editor: `t()` returns raw
 * keys until the messages load in a client effect, so a Romanian button name
 * is proof the page has hydrated (CLAUDE.md, "a form that does nothing").
 */
async function openNewPost(page: Page): Promise<Locator> {
  await page.goto("/admin/blog");
  await page.getByRole("button", { name: "Articol Nou" }).click();
  await expect(page.getByRole("button", { name: "Îngroșat" }).first()).toBeVisible();
  return roEditor(page);
}

async function openPost(page: Page, slug: string) {
  await page.goto("/admin/blog");
  await page.getByRole("button", { name: `Editează articol: Articol E2E ${slug}` }).click();
  await expect(page.getByRole("button", { name: "Îngroșat" }).first()).toBeVisible();
}

/**
 * Replaces the editor's content and puts the caret at the end, or selects
 * everything. Kept out of the undo history, so an undo in a test undoes only
 * what the test did.
 */
async function reset(editor: Locator, html: string, select = false) {
  await editor.evaluate(
    (el, { html, select }) => {
      const chain = (el as TipTapElement).editor.chain().setMeta("addToHistory", false).setContent(html);
      (select ? chain.focus().selectAll() : chain.focus("end")).run();
    },
    { html, select }
  );
  // TipTap focuses on the next animation frame; a key pressed before then
  // lands on whatever had focus last.
  await expect(editor).toBeFocused();
}

test.describe("blog editor shortcuts", () => {
  test("every shortcut in the list does what the list says", async ({ page }) => {
    const editor = await openNewPost(page);

    for (const row of SHORTCUTS) {
      const check = row.check;
      if (!check) continue;
      // Every result holds the word the row starts from or types, except a
      // divider, which holds nothing.
      const result = () =>
        check.expect === "hr"
          ? editor.locator("hr")
          : editor.locator(check.expect).filter({ hasText: /text/i });

      for (const combo of row.keys ?? []) {
        await test.step(`${row.id}: ${combo}`, async () => {
          await reset(editor, check.start ?? "<p>Text</p>", check.select);
          await page.keyboard.press(pressable(combo));
          await expect(result()).toHaveCount(1);
        });
      }

      const typed = row.typed;
      if (typed) {
        await test.step(`${row.id}: typing ${typed.text}`, async () => {
          await reset(editor, "");
          await page.keyboard.type(typed.text);
          if (typed.then) {
            await page.keyboard.press(typed.then);
            await page.keyboard.type("Text");
          }
          await expect(result()).toHaveCount(1);
        });

        // The list's closing promise: Backspace straight after gives back
        // what was typed. Checked where it is hardest to keep, at the end of
        // the post — see the trailingNode note in lib/blog-editor.ts.
        await test.step(`${row.id}: Backspace undoes ${typed.text}`, async () => {
          await reset(editor, "");
          await page.keyboard.type(typed.text);
          if (typed.then) await page.keyboard.press(typed.then);
          await expect(editor.locator(check.expect)).toHaveCount(1);
          await page.keyboard.press("Backspace");
          await expect(editor.locator(check.expect)).toHaveCount(0);
          await expect(editor).toContainText(typed.text);
        });
      }
    }
  });

  test("the list opens from its button or Ctrl+/, and leaves the caret where it was", async ({ page }) => {
    const editor = await openNewPost(page);
    const list = page.getByRole("dialog", { name: "Scurtături" });

    await page.getByRole("button", { name: "Scurtături" }).first().click();
    await expect(list).toBeVisible();
    // One row per shortcut, named by its result.
    await expect(list.locator('th[scope="row"]')).toHaveCount(SHORTCUTS.length);
    // Exact, and anchored: Titlu 1's note mentions Titlu 2.
    await expect(list.getByRole("rowheader", { name: "Titlu 2", exact: true })).toBeVisible();
    // The keys this machine's editor listens for, not another platform's.
    const mod = process.platform === "darwin" ? "Command" : "Ctrl";
    await expect(list.getByRole("row", { name: /^Titlu 2\b/ })).toContainText(mod);
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();

    // From the keyboard she stays in her sentence and can keep typing.
    await reset(editor, "<p>Text</p>");
    await page.keyboard.press("ControlOrMeta+/");
    await expect(list).toBeVisible();
    await page.keyboard.type(" more");
    await expect(editor).toContainText("Text more");
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();

    // A click anywhere else closes it too. Not on the editor: the list may be
    // lying over the middle of it.
    await page.getByRole("button", { name: "Scurtături" }).first().click();
    await expect(list).toBeVisible();
    await page.getByRole("heading", { name: "Articol Nou" }).click();
    await expect(list).toBeHidden();
  });

  test("Ctrl+K opens the link dialog, as the Link button's tooltip says", async ({ page }) => {
    const editor = await openNewPost(page);
    await reset(editor, "<p>Text</p>", true);
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("heading", { name: "Adaugă link" })).toBeVisible();
  });

  test("an address followed by a space becomes a link", async ({ page }) => {
    const editor = await openNewPost(page);
    await reset(editor, "");
    await page.keyboard.type("Detalii pe https://example.com ");
    await expect(editor.locator('a[href="https://example.com"]')).toHaveText("https://example.com");
  });

  test("line breaks, sub-items, undo and redo", async ({ page }) => {
    const editor = await openNewPost(page);

    await reset(editor, "<p>Text</p>");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("more");
    // ProseMirror parks its own <br> in empty paragraphs; those are not hers.
    await expect(editor.locator("p br:not(.ProseMirror-trailingBreak)")).toHaveCount(1);

    await reset(editor, "<ul><li><p>Unu</p></li><li><p>Doi</p></li></ul>");
    await page.keyboard.press("Tab");
    await expect(editor.locator("ul ul li")).toHaveText("Doi");
    await page.keyboard.press("Shift+Tab");
    await expect(editor.locator("ul ul")).toHaveCount(0);

    await reset(editor, "<p>Text</p>");
    await page.keyboard.type(" nou");
    await page.keyboard.press("ControlOrMeta+z");
    await expect(editor).toHaveText("Text");
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(editor).toHaveText("Text nou");
    await page.keyboard.press("ControlOrMeta+z");
    await page.keyboard.press("ControlOrMeta+y");
    await expect(editor).toHaveText("Text nou");
  });
});

test.describe("blog editor alignment", () => {
  let slug = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("text centred in the editor is centred on the published post", async ({ page }) => {
    slug = unique("aliniere");
    const editor = await openNewPost(page);

    await page.getByLabel("Titlu (RO)").fill(`Aliniere ${slug}`);
    await page.getByLabel("Slug").fill(slug);
    await editor.click();
    await page.keyboard.type("Un rând centrat");
    const centre = page.getByRole("button", { name: "Aliniere la centru" }).first();
    await centre.click();
    await expect(centre).toHaveAttribute("aria-pressed", "true");
    await expect(editor.locator('p[style*="text-align: center"]')).toHaveText("Un rând centrat");

    await page.getByText("Publicat", { exact: true }).click();
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(editor).toHaveCount(0);

    await page.goto(`/ro/blog/${slug}`);
    // Through the sanitizer and the CSP, which both have to let the style
    // attribute through for this to hold.
    await expect(page.locator(".blog-content p", { hasText: "Un rând centrat" })).toHaveCSS(
      "text-align",
      "center"
    );
  });
});

test.describe("blog editor translation", () => {
  let slug = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  /**
   * The translator is replaced by a stand-in that prefixes each block with
   * "EN ", so the test checks the one thing that is this code's job — the
   * structure around the words — and never calls Google.
   */
  async function fakeTranslator(page: Page) {
    const requests: string[][] = [];
    await page.route("**/api/translate", async (route) => {
      const body = route.request().postDataJSON() as { texts?: string[] };
      requests.push(body.texts ?? []);
      await route.fulfill({ json: { translations: (body.texts ?? []).map((html) => `EN ${html}`) } });
    });
    // Embeds load from YouTube; nothing here needs them to.
    await page.route(/youtube(-nocookie)?\.com/, (route) => route.fulfill({ body: "" }));
    return requests;
  }

  test("→ EN translates paragraph by paragraph and keeps every piece of formatting", async ({ page }) => {
    const post = await seedPost({
      content_ro: [
        "<h2>Despre respirație</h2>",
        '<p>Respiră <strong>adânc</strong> și <em>încet</em>. Detalii <a href="https://example.com/r">aici</a>.</p>',
        '<p style="text-align: center">Un gând centrat</p>',
        "<ul><li><p>Apă</p></li><li><p>Prosop</p></li></ul>",
        "<blockquote><p>Un citat</p></blockquote>",
        "<hr>",
        '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>',
        "<p></p>",
      ].join(""),
      content_en: null,
    });
    slug = post.slug;
    const requests = await fakeTranslator(page);

    await openPost(page, slug);
    const en = enEditor(page);
    // The content's → EN; the first one on the page is the title's.
    await page.getByRole("button", { name: "→ EN" }).nth(1).click();

    await expect(en.locator("h2")).toHaveText("EN Despre respirație");
    await expect(en.locator("p strong")).toHaveText("adânc");
    await expect(en.locator("p em")).toHaveText("încet");
    await expect(en.locator('a[href="https://example.com/r"]')).toHaveText("aici");
    await expect(en.locator('p[style*="text-align: center"]')).toHaveText("EN Un gând centrat");
    await expect(en.locator("ul > li")).toHaveText(["EN Apă", "EN Prosop"]);
    await expect(en.locator("blockquote p")).toHaveText("EN Un citat");
    await expect(en.locator("hr")).toHaveCount(1);
    await expect(en.locator('iframe[src="https://www.youtube-nocookie.com/embed/abc123"]')).toHaveCount(1);

    // One request, one text per block with words in it, and only inline markup
    // in any of them: the structure never leaves the page.
    expect(requests).toHaveLength(1);
    expect(requests[0]).toHaveLength(6);
    expect(requests[0].join("")).not.toMatch(/<(p|h\d|ul|ol|li|blockquote|hr|iframe|div)\b/);
    expect(requests[0][1]).toContain("<strong>adânc</strong>");

    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(en).toHaveCount(0);
    await page.goto(`/en/blog/${slug}`);
    await expect(page.locator(".blog-content h2")).toHaveText("EN Despre respirație");
    await expect(page.locator(".blog-content ul > li")).toHaveCount(2);
  });

  test("replacing English that is already there is asked first, and Desfă brings it back", async ({ page }) => {
    const post = await seedPost({ content_ro: "<p>Bună</p>", content_en: "<p>My own English</p>" });
    slug = post.slug;
    const requests = await fakeTranslator(page);

    await openPost(page, slug);
    const en = enEditor(page);
    await expect(en).toHaveText("My own English");
    const translate = page.getByRole("button", { name: "→ EN" }).nth(1);

    const question = page.getByRole("dialog", { name: "Înlocuiești textul în engleză?" });

    await translate.click();
    await question.getByRole("button", { name: "Anulează" }).click();
    await expect(question).toBeHidden();
    await expect(en).toHaveText("My own English");
    expect(requests).toHaveLength(0);

    await translate.click();
    await expect(question).toContainText("Desfă");
    await question.getByRole("button", { name: "Înlocuiește" }).click();
    await expect(en).toHaveText("EN Bună");

    // The English editor's own Desfă: the second one on the page.
    await page.getByRole("button", { name: "Desfă" }).nth(1).click();
    await expect(en).toHaveText("My own English");
  });

  test("English saved as plain text before the editor existed opens as paragraphs", async ({ page }) => {
    const post = await seedPost({
      content_en: "First paragraph.\n\nSecond paragraph,\nwith a line break.",
    });
    slug = post.slug;

    await openPost(page, slug);
    const paragraphs = enEditor(page).locator("p");
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.nth(1).locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(1);
  });

  test("an untouched English editor saves as no English, so the page falls back to Romanian", async ({ page }) => {
    const post = await seedPost({ content_ro: "<p>Doar în română.</p>", content_en: null });
    slug = post.slug;

    await openPost(page, slug);
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(enEditor(page)).toHaveCount(0);

    await page.goto(`/en/blog/${slug}`);
    await expect(page.locator(".blog-content")).toHaveText("Doar în română.");
  });

  test("the translation route refuses what it cannot translate, before asking Google", async ({ request }) => {
    const token = await adminAccessToken();
    const send = (data: unknown) =>
      request.post("/api/translate", { headers: { Authorization: `Bearer ${token}` }, data });

    expect((await send({ texts: "nu e o listă" })).status()).toBe(400);
    expect((await send({ texts: [] })).status()).toBe(400);
    expect((await send({ texts: ["Bună", ""] })).status()).toBe(400);
    expect((await send({ text: "Bună", from: "fr" })).status()).toBe(400);

    const long = await send({ texts: ["a".repeat(5001)] });
    expect(long.status()).toBe(400);
    expect((await long.json()).code).toBe("too_long");
    const tooMuch = await send({ texts: Array.from({ length: 13 }, () => "a".repeat(5000)) });
    expect(tooMuch.status()).toBe(400);
    expect((await tooMuch.json()).code).toBe("too_long");

    expect((await request.post("/api/translate", { data: { texts: ["Bună"] } })).status()).toBe(401);
  });
});
