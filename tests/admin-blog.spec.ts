import { test, expect } from "@playwright/test";
import { deletePostBySlug, seedPost, unique } from "./helpers";

test.describe("admin blog CRUD", () => {
  let slug = "";
  let title = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("creates, edits and deletes a blog post", async ({ page }) => {
    slug = unique("articol-admin");
    title = `Articol Admin ${slug}`;
    const titleEdited = `${title} (modificat)`;

    const cardRow = (headingText: string) =>
      page
        .getByRole("heading", { name: headingText })
        .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]");

    await page.goto("/admin/blog");

    await page.getByRole("button", { name: "Articol Nou" }).click();
    await expect(page.getByRole("heading", { name: "Articol Nou" })).toBeVisible();
    await expect(page.getByRole("button", { name: "→ EN" }).first()).toBeVisible();

    await page.getByLabel("Titlu (RO)").fill(title);
    await page.getByLabel("Titlu (EN)").fill(`Admin Post ${slug}`);
    await page.getByLabel("Slug").fill(slug);
    await page.getByRole("textbox", { name: "Conținut (RO)", exact: true }).click();
    await page.keyboard.type("Conținut articol de test E2E.");
    await page.getByText("Publicat", { exact: true }).click();
    await page.getByRole("button", { name: "Salvează" }).click();

    await expect(page).toHaveURL(/\/admin\/blog$/);
    await expect(cardRow(title)).toBeVisible();
    await expect(cardRow(title).getByText("Publicat", { exact: true })).toBeVisible();

    await cardRow(title).getByRole("button").first().click();
    await page.getByLabel("Titlu (RO)").fill(titleEdited);
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(cardRow(titleEdited)).toBeVisible();

    page.on("dialog", (d) => d.accept());
    await cardRow(titleEdited).getByRole("button").nth(1).click();
    await expect(cardRow(titleEdited)).toHaveCount(0);
  });
});

/**
 * The blog page prints the post's title as the page's <h1>, so a level-one
 * heading in the body gives the document a second one and the two compete to
 * answer "what is this page about".
 *
 * Both halves of the fix are tested here, because only doing the first half is
 * the tempting mistake: taking H1 out of TipTap's schema as well as out of the
 * menu would have flattened the heading in every post that already had one, on
 * open, silently. There was one such post in production when this changed.
 *
 * Levels 4 to 6 are the opposite case: the editor does not have them at all, so
 * one that arrives in pasted or older content becomes a paragraph — its words
 * kept, its level dropped.
 */
test.describe("blog editor heading levels", () => {
  let slug = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("offers H2 and H3 only, keeps an older H1, and turns an H4 into a paragraph", async ({ page }) => {
    const legacy = "Titlu vechi de nivel unu";
    const deep = "Subtitlu de nivel patru";
    const post = await seedPost({
      content_ro: `<h1>${legacy}</h1><h4>${deep}</h4><p>Un paragraf.</p>`,
    });
    slug = post.slug;

    await page.goto("/admin/blog");
    await page
      .getByRole("heading", { name: `Articol E2E ${slug}` })
      .locator("xpath=ancestor::div[contains(@class,'flex items-center justify-between')]")
      .getByRole("button")
      .first()
      .click();
    const editor = page.getByRole("textbox", { name: "Conținut (RO)", exact: true });
    await expect(editor).toBeVisible();

    // The Romanian editor's; the English one below has its own.
    const format = page.getByRole("button", { name: "Format" }).first();
    await format.click();
    const menu = page.locator("div.absolute.left-0.top-full");
    await expect(menu.getByRole("button")).toHaveText([
      "Text normal",
      "Titlu 2",
      "Titlu 3",
    ]);
    await format.click();

    /*
     * The trigger draws whatever format the caret is in, and that is the half
     * of this that is easy to get wrong: drop H1 from the list the trigger
     * searches as well as from the menu, and the editor labels an existing
     * level-one heading "Paragraph" — which is a lie, and one that invites her
     * to leave it alone.
     *
     * Read through toHaveClass rather than getAttribute so it retries. The icon
     * is redrawn by a React render that the click does not wait for, and a bare
     * read catches the icon from before the caret moved.
     */
    const triggerIcon = format.locator("svg").first();
    await editor.locator("p").first().click();
    await expect(triggerIcon).toHaveClass(/pilcrow/);
    await editor.locator("h1").first().click();
    await expect(triggerIcon, "an existing H1 is reported as a paragraph").toHaveClass(
      /heading-?1/
    );

    // Saving must not be what destroys it. The editor lives at the same URL as
    // the list, so the URL cannot say the save finished; the editor closing
    // can, because the page only leaves it once the update has returned.
    await page.getByRole("button", { name: "Salvează" }).click();
    await expect(editor).toHaveCount(0);

    await page.goto(`/ro/blog/${slug}`);
    await expect(page.locator(".blog-content h1")).toHaveText(legacy);
    // The level the editor does not have is gone; the words it held are not.
    await expect(page.locator(".blog-content h4")).toHaveCount(0);
    await expect(page.locator(".blog-content p", { hasText: deep })).toBeVisible();
  });
});
