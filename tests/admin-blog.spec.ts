import { test, expect, type Page } from "@playwright/test";
import {
  deletePostById,
  deletePostBySlug,
  deletePostsTitled,
  draftFor,
  postById,
  seedPost,
  unique,
} from "./helpers";

/**
 * The post list (/admin/blog) and the post editor (/admin/blog/new,
 * /admin/blog/<id>): tabs, search and sort; autosave; a blank post thrown
 * away on Back; Publish staying in the editor; Hidden; changes to a live post
 * staying private until "Publică modificările"; Preview; a taken address.
 *
 * Posts the editor creates are cleaned up by the unique marker in their title.
 */

const status = (page: Page) => page.locator("[data-save-status]");

/** Waits for the editor's own bar, which proves the client has loaded the post. */
async function openEditor(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Îngroșat" }).first()).toBeVisible();
}

const body = (page: Page) => page.getByRole("textbox", { name: "Conținut (RO)", exact: true });

test.describe("the post list", () => {
  const marker = unique("lista");
  const ids: string[] = [];

  test.beforeAll(async () => {
    // Published in March and May, so the two orders by publish date differ.
    const posts = await Promise.all([
      seedPost({ title_ro: `${marker} Alfa publicat`, title_en: `${marker} Sunrise`, published_at: "2026-03-01T09:00:00Z" }),
      seedPost({ title_ro: `${marker} Beta ciornă`, published: false }),
      seedPost({ title_ro: `${marker} Gama ascuns`, hidden: true, published_at: "2026-05-01T09:00:00Z" }),
    ]);
    ids.push(...posts.map((p) => p.id));
  });

  test.afterAll(async () => {
    for (const id of ids) await deletePostById(id);
  });

  const rows = (page: Page) => page.locator("main li a[href^='/admin/blog/']");

  test("each tab holds its posts, and the address remembers the tab and the search", async ({ page }) => {
    await page.goto(`/admin/blog?q=${encodeURIComponent(marker)}`);
    await expect(rows(page)).toHaveCount(3);

    const tabs = page.getByRole("navigation", { name: "Articole după stare" });
    for (const [tab, title] of [
      ["Publicate", "Alfa publicat"],
      ["Ciorne", "Beta ciornă"],
      ["Ascunse", "Gama ascuns"],
    ] as const) {
      await tabs.getByRole("link", { name: new RegExp(`^${tab}`) }).click();
      await expect(tabs.getByRole("link", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-current", "page");
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page)).toContainText(title);
    }
    await expect(page).toHaveURL(/tab=hidden/);
    await expect(page).toHaveURL(new RegExp(`q=${marker}`));

    // The dashboard's link lands on the drafts.
    await page.goto(`/admin/blog?tab=drafts&q=${encodeURIComponent(marker)}`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Beta ciornă");
  });

  test("search reads the English title too, without minding diacritics", async ({ page }) => {
    await page.goto("/admin/blog");
    const search = page.getByPlaceholder("Caută după titlu, subtitlu sau adresă");
    await search.fill(`${marker} sunrise`);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page)).toContainText("Alfa publicat");
    await search.fill(`${marker} beta ciorna`);
    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/q=/);
  });

  test("sorts by title", async ({ page }) => {
    await page.goto(`/admin/blog?q=${encodeURIComponent(marker)}&sort=title`);
    await expect(rows(page)).toHaveCount(3);
    await expect(rows(page).locator(".font-serif")).toHaveText([
      `${marker} Alfa publicat`,
      `${marker} Beta ciornă`,
      `${marker} Gama ascuns`,
    ]);
  });

  test("sorts by publish date either way, with the never-published last", async ({ page }) => {
    const titles = rows(page).locator(".font-serif");
    await page.goto(`/admin/blog?q=${encodeURIComponent(marker)}&sort=published`);
    await expect(titles).toHaveText([`${marker} Gama ascuns`, `${marker} Alfa publicat`, `${marker} Beta ciornă`]);

    await page.getByLabel("Ordine").selectOption({ label: "Data publicării, crescător" });
    await expect(page).toHaveURL(/sort=published_oldest/);
    await expect(titles).toHaveText([`${marker} Alfa publicat`, `${marker} Gama ascuns`, `${marker} Beta ciornă`]);
  });

  test("a row opens the post in its own editor", async ({ page }) => {
    await page.goto(`/admin/blog?q=${encodeURIComponent(marker)}&tab=drafts`);
    await rows(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/admin/blog/${ids[1]}$`));
    await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue(`${marker} Beta ciornă`);
  });
});

test.describe("writing a new post", () => {
  const marker = unique("nou");
  test.afterEach(async () => deletePostsTitled(marker));

  test("saves itself, takes its address from the title, and gets its own URL", async ({ page }) => {
    await openEditor(page, "/admin/blog/new");
    await expect(status(page)).toHaveText(/Se salvează singur/);

    await page.getByLabel("Titlu (RO)", { exact: true }).fill(`${marker} Respirația de dimineață`);
    await body(page).click();
    await page.keyboard.type("Primul paragraf.");

    await expect(status(page)).toHaveText("Salvat");
    await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/);
    const id = page.url().split("/").pop()!;
    const row = await postById(id);
    expect(row?.slug).toBe(`${marker}-respiratia-de-dimineata`);
    expect(row?.published).toBe(false);
    expect(row?.content_ro).toContain("Primul paragraf.");
    await expect(page.getByRole("textbox", { name: "Adresa articolului" })).toHaveValue(`${marker}-respiratia-de-dimineata`);
  });

  test("Back with nothing written leaves nothing behind", async ({ page }) => {
    await openEditor(page, "/admin/blog/new");
    const title = page.getByLabel("Titlu (RO)", { exact: true });
    await title.fill(`${marker} x`);
    await expect(status(page)).toHaveText("Salvat");
    const id = page.url().split("/").pop()!;
    expect(await postById(id)).not.toBeNull();

    await title.fill("");
    // The editor's own Back, in its bar; the sidebar has an "Articole" too.
    await page.getByRole("main").getByRole("link", { name: "Articole", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/blog$/);
    expect(await postById(id)).toBeNull();
  });

  test("Publish checks for text, then publishes and stays in the editor", async ({ page }) => {
    await openEditor(page, "/admin/blog/new");
    await page.getByLabel("Titlu (RO)", { exact: true }).fill(`${marker} De publicat`);
    await expect(status(page)).toHaveText("Salvat");

    const publish = page.getByRole("button", { name: "Publică", exact: true });
    await publish.click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Articolul nu are text încă.");
    await expect(body(page)).toBeFocused();

    await page.keyboard.type("Un text pentru cititori.");
    await publish.click();
    const toasts = page.getByRole("region", { name: "Notificări" });
    await expect(toasts).toContainText("Articol publicat");
    const link = toasts.getByRole("link", { name: "Vezi articolul" });
    await expect(link).toHaveAttribute("href", `/ro/blog/${marker}-de-publicat`);
    await expect(page).toHaveURL(/\/admin\/blog\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("button", { name: "Publicat" })).toBeDisabled();

    await page.goto(`/ro/blog/${marker}-de-publicat`);
    await expect(page.getByRole("heading", { level: 1, name: `${marker} De publicat` })).toBeVisible();
  });
});

test.describe("a published post", () => {
  let slug = "";
  let id = "";

  test.beforeEach(async () => {
    const post = await seedPost();
    slug = post.slug;
    id = post.id;
  });
  test.afterEach(async () => deletePostBySlug(slug));

  test("edits stay private until Publish changes", async ({ page }) => {
    const original = `Articol E2E ${slug}`;
    const changed = `${original} (schimbat)`;
    await openEditor(page, `/admin/blog/${id}`);
    await expect(page.getByRole("button", { name: "Publicat" })).toBeDisabled();

    await page.getByLabel("Titlu (RO)", { exact: true }).fill(changed);
    await expect(status(page)).toHaveText("Salvat");
    expect((await draftFor(id))?.title_ro).toBe(changed);
    expect((await postById(id))?.title_ro).toBe(original);
    // The address does not follow the title once the post is live.
    expect((await draftFor(id))?.slug).toBe(slug);

    const visitor = await page.context().browser()!.newPage();
    await visitor.goto(`/ro/blog/${slug}`);
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(original);

    await page.getByRole("button", { name: "Publică modificările" }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Modificări publicate");
    await expect(page.getByRole("button", { name: "Publicat" })).toBeDisabled();
    expect(await draftFor(id)).toBeNull();

    await visitor.reload();
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(changed);
    await visitor.close();
  });

  test("Discard changes brings back the published version", async ({ page }) => {
    await openEditor(page, `/admin/blog/${id}`);
    await page.getByLabel("Titlu (RO)", { exact: true }).fill("Ceva ce nu rămâne");
    await expect(status(page)).toHaveText("Salvat");

    await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
    await page.getByRole("menuitem", { name: "Renunță la modificări" }).click();
    await page.getByRole("dialog", { name: "Renunți la modificări?" }).getByRole("button", { name: "Renunță la ele" }).click();

    await expect(page.getByLabel("Titlu (RO)", { exact: true })).toHaveValue(`Articol E2E ${slug}`);
    expect(await draftFor(id)).toBeNull();
  });

  test("Hidden takes it off the site at once, and the list files it under Ascunse", async ({ page }) => {
    await openEditor(page, `/admin/blog/${id}`);
    // The input is drawn as a switch and visually hidden; the label is what
    // she presses, so force past the hidden input's size.
    await page.getByRole("switch", { name: "Ascuns" }).check({ force: true });
    await expect.poll(async () => (await postById(id))?.hidden).toBe(true);

    const response = await page.goto(`/ro/blog/${slug}`);
    expect(response?.status()).toBe(404);

    await page.goto(`/admin/blog?tab=hidden&q=${slug}`);
    await expect(page.locator("main li a[href^='/admin/blog/']")).toHaveCount(1);
  });

  test("Preview shows the unpublished version, in either language", async ({ page }) => {
    const changed = `Previzualizat ${slug}`;
    await openEditor(page, `/admin/blog/${id}`);
    await page.getByLabel("Titlu (RO)", { exact: true }).fill(changed);

    await page.getByRole("button", { name: "Previzualizare" }).click();
    const dialog = page.getByRole("dialog", { name: "Previzualizare" });
    const frame = dialog.frameLocator("iframe");
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(changed);
    await expect(frame.getByText("Previzualizare. Vizitatorii nu văd încă versiunea aceasta.")).toBeVisible();

    await dialog.getByText("EN", { exact: true }).click();
    await expect(frame.getByRole("heading", { level: 1 })).toHaveText(`E2E Post ${slug}`);
  });

  test("the preview of an unpublished post shows a visitor nothing", async ({ browser }) => {
    const draft = await seedPost({ published: false });
    const visitor = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    try {
      await visitor.goto(`/ro/preview/blog/${draft.id}`);
      await expect(visitor.getByText("Previzualizarea e doar pentru administrator")).toBeVisible();
      await expect(visitor.getByRole("heading", { level: 1 })).toHaveCount(0);
    } finally {
      await visitor.close();
      await deletePostBySlug(draft.slug);
    }
  });

  test("an address another post has is refused, and everything else still saves", async ({ page }) => {
    const other = await seedPost({ published: false });
    try {
      await openEditor(page, `/admin/blog/${id}`);
      await page.getByRole("textbox", { name: "Adresa articolului" }).fill(other.slug);
      await page.getByLabel("Subtitlu (RO)").fill("Subtitlu păstrat");
      await expect(page.getByRole("alert").filter({ hasText: "Alt articol folosește deja adresa asta" })).toBeVisible();
      await expect.poll(async () => (await draftFor(id))?.subtitle_ro).toBe("Subtitlu păstrat");
      expect((await draftFor(id))?.slug).toBe(slug);
    } finally {
      await deletePostBySlug(other.slug);
    }
  });
});

/**
 * The blog page prints the post's title as the page's <h1>, so a level-one
 * heading in the body gives the document a second one. The Format menu leaves
 * it out; the editor still recognises one in an older post rather than
 * flattening it. Levels 4 to 6 are the opposite case: the editor does not have
 * them, so one that arrives in older content becomes a paragraph.
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
      published: false,
    });
    slug = post.slug;

    await openEditor(page, `/admin/blog/${post.id}`);
    const editor = body(page);

    const format = page.getByRole("button", { name: "Format", exact: true }).first();
    await format.click();
    await expect(page.getByRole("menu", { name: "Format" }).getByRole("menuitemradio")).toHaveText([
      "Text normal",
      "Titlu 2",
      "Titlu 3",
    ]);
    await page.keyboard.press("Escape");

    // Read through toHaveClass so it retries: the icon is redrawn by a render
    // the click does not wait for.
    const triggerIcon = format.locator("svg").first();
    await editor.locator("p").first().click();
    await expect(triggerIcon).toHaveClass(/pilcrow/);
    await editor.locator("h1").first().click();
    await expect(triggerIcon, "an existing H1 is reported as a paragraph").toHaveClass(/heading-?1/);

    // Saving must not be what destroys it: publish, then read the page.
    await page.getByRole("button", { name: "Publică", exact: true }).click();
    await expect(page.getByRole("region", { name: "Notificări" })).toContainText("Articol publicat");

    await page.goto(`/ro/blog/${slug}`);
    await expect(page.locator(".blog-content h1")).toHaveText(legacy);
    await expect(page.locator(".blog-content h4")).toHaveCount(0);
    await expect(page.locator(".blog-content p", { hasText: deep })).toBeVisible();
  });
});
