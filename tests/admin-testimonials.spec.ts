import { test, expect, type Page } from "@playwright/test";
import { deleteTestimonial, seedTestimonial, unique, updateTestimonial } from "./helpers";

/**
 * /admin/testimonials: the three tabs, approving, hiding, her home page
 * selection and its order, a video link, and deleting. Phase 6 of
 * docs/OVERHAUL.md.
 */

const seeded: Awaited<ReturnType<typeof seedTestimonial>>[] = [];
test.afterEach(async () => {
  while (seeded.length) await deleteTestimonial(seeded.pop()!);
});

async function seed(approved: boolean, overrides: Record<string, unknown> = {}) {
  const item = await seedTestimonial(approved, { author_name: `Autor ${unique("a")}`, ...overrides });
  seeded.push(item);
  return item;
}

const tabs = (page: Page) => page.getByRole("navigation", { name: "Testimoniale după stare" });
const cardOf = (page: Page, content: string) => page.getByRole("article").filter({ hasText: content });
const toasts = (page: Page) => page.getByRole("region", { name: "Notificări" });

async function open(page: Page, address = "/admin/testimonials") {
  await page.goto(address);
  await expect(page.getByRole("heading", { level: 1, name: "Testimoniale" })).toBeVisible();
}

test.describe("admin testimonials", () => {
  test("opens on the ones to approve, and approving one publishes it", async ({ page }) => {
    const item = await seed(false);
    await open(page, "/admin/testimonials?tab=pending");
    await expect(tabs(page).getByRole("link", { name: /^De aprobat/ })).toHaveAttribute("aria-current", "page");

    const card = cardOf(page, item.content);
    await expect(card).toBeVisible();
    // Her controls are the video link and the state; the words and the rating are theirs.
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await card.getByRole("button", { name: "Aprobă" }).click();
    await expect(toasts(page)).toContainText("Aprobat. Apare pe site.");
    await expect(cardOf(page, item.content)).toHaveCount(0);

    await tabs(page).getByRole("link", { name: /^Aprobate/ }).click();
    await expect(cardOf(page, item.content)).toBeVisible();
    await page.goto("/ro/testimonials");
    await expect(page.getByText(item.content)).toBeVisible();
  });

  test("hiding takes it off the site without deleting it, and showing brings it back", async ({ page }) => {
    const item = await seed(true);
    await open(page, "/admin/testimonials?tab=approved");
    await cardOf(page, item.content).getByRole("button", { name: "Ascunde" }).click();
    await expect(toasts(page)).toContainText("Ascuns de pe site.");

    await page.goto("/ro/testimonials");
    await expect(page.getByText(item.content)).toHaveCount(0);

    await open(page, "/admin/testimonials?tab=hidden");
    await cardOf(page, item.content).getByRole("button", { name: "Arată din nou" }).click();
    await expect(toasts(page)).toContainText("Apare din nou pe site.");
    await page.goto("/ro/testimonials");
    await expect(page.getByText(item.content)).toBeVisible();
  });

  test("her home page selection shows in her order", async ({ page }) => {
    const first = await seed(true);
    const second = await seed(true);
    await open(page, "/admin/testimonials?tab=approved");

    await cardOf(page, first.content).getByText("Pe pagina principală").click();
    await expect(cardOf(page, first.content).getByRole("switch", { name: "Pe pagina principală" })).toBeChecked();
    await cardOf(page, second.content).getByText("Pe pagina principală").click();
    await expect(cardOf(page, second.content).getByRole("switch", { name: "Pe pagina principală" })).toBeChecked();
    await expect(cardOf(page, second.content).getByRole("button", { name: "Mută mai sus" })).toBeEnabled();

    // The newest choice goes last; one press puts it before the one chosen first.
    const selection = page.getByRole("region", { name: "Pe pagina principală, în ordinea asta" }).getByRole("article");
    const position = async (content: string) =>
      (await selection.allTextContents()).findIndex((text) => text.includes(content));
    await expect.poll(() => position(second.content)).toBe((await position(first.content)) + 1);
    await cardOf(page, second.content).getByRole("button", { name: "Mută mai sus" }).click();
    await expect.poll(async () => (await position(second.content)) < (await position(first.content))).toBe(true);

    await page.goto("/ro");
    const home = page.locator("section", { has: page.getByRole("heading", { name: "Ce spun participanții" }) });
    const order = await home.getByText(/^Testimonial E2E/).allTextContents();
    expect(order.indexOf(second.content)).toBeLessThan(order.indexOf(first.content));
    await expect(home.getByRole("link", { name: "Împărtășește-ți experiența" })).toHaveAttribute("href", "/ro/testimonials/share");
  });

  test("attaches a video link, from a player the site can show", async ({ page }) => {
    const item = await seed(true);
    await open(page, "/admin/testimonials?tab=approved");
    const card = cardOf(page, item.content);

    await card.getByLabel("Link video").fill("https://example.com/video.mp4");
    await card.getByRole("button", { name: "Salvează linkul" }).click();
    await expect(toasts(page)).toContainText("Linkul acesta nu e de pe YouTube");

    await card.getByLabel("Link video").fill("https://vimeo.com/76979871");
    await card.getByRole("button", { name: "Salvează linkul" }).click();
    await expect(toasts(page)).toContainText("Link salvat.");

    await page.goto("/ro/testimonials");
    const publicCard = page.getByRole("article").filter({ hasText: item.content });
    await expect(publicCard.getByRole("button", { name: /Pornește videoul de pe Vimeo/ })).toBeVisible();
  });

  test("deletes after asking", async ({ page }) => {
    const item = await seed(false);
    await open(page);
    await cardOf(page, item.content).getByRole("button", { name: "Șterge" }).click();
    const dialog = page.getByRole("dialog", { name: "Ștergi testimonialul?" });
    await dialog.getByRole("button", { name: "Șterge" }).click();
    await expect(toasts(page)).toContainText("Testimonial șters.");
    await expect(cardOf(page, item.content)).toHaveCount(0);
  });

  test("a hidden one leaves the home page selection", async ({ page }) => {
    const item = await seed(true, { on_home: true, home_order: 1 });
    await updateTestimonial(item.id, { on_home: true, home_order: 1 });
    await open(page, "/admin/testimonials?tab=approved");
    await cardOf(page, item.content).getByRole("button", { name: "Ascunde" }).click();
    await expect(toasts(page)).toContainText("Ascuns de pe site.");
    await open(page, "/admin/testimonials?tab=hidden");
    await expect(cardOf(page, item.content).getByRole("switch")).toHaveCount(0);
  });
});
