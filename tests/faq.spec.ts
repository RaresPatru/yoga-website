import { test, expect, type Locator, type Page } from "@playwright/test";
import { deleteFaqsByQuestion, seedFaq, unique } from "./helpers";

/**
 * The questions on the home page (components/faq-list.tsx).
 *
 * An answer unfolds under its question and folds back; Chromium does it in
 * CSS and every other engine through components/faq-accordion.tsx, so the
 * `chromium` and `mobile` projects each test one of the two. With less
 * motion, it simply opens.
 */

const hydrated = (page: Page) => page.locator("next-route-announcer").waitFor({ state: "attached" });

/**
 * Taps the question and records the height of its box on every frame for
 * `ms`, from inside the page, so no frame is missed between the tap and the
 * first sample.
 */
function toggleAndSample(item: Locator, ms: number): Promise<number[]> {
  return item.evaluate(
    (details, ms) =>
      new Promise<number[]>((resolve) => {
        const samples: number[] = [];
        const start = performance.now();
        details.querySelector("summary")!.click();
        const tick = () => {
          samples.push(Math.round(details.getBoundingClientRect().height));
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolve(samples);
        };
        requestAnimationFrame(tick);
      }),
    ms
  );
}

test.describe("the FAQ", () => {
  let question: string;

  test.beforeEach(async ({ page }) => {
    question = `Întrebare de test ${unique("faq")}?`;
    await seedFaq(question, "Rândul unu\nRândul doi");
    await page.goto("/ro");
    await hydrated(page);
  });

  test.afterEach(async () => {
    await deleteFaqsByQuestion(question);
  });

  const item = (page: Page) => page.locator("details.faq-item", { hasText: question });

  test("an answer unfolds under its question and folds back", async ({ page }) => {
    await item(page).scrollIntoViewIfNeeded();
    const closed = Math.round(await item(page).evaluate((d) => d.getBoundingClientRect().height));

    const opening = await toggleAndSample(item(page), 700);
    const open = opening[opening.length - 1];
    expect(open, "open, it holds the answer").toBeGreaterThan(closed + 20);
    expect(
      opening.some((h) => h > closed + 2 && h < open - 2),
      `it passes through the heights in between: ${opening.join(", ")}`
    ).toBe(true);
    await expect(item(page)).toHaveJSProperty("open", true);
    await expect(item(page).locator(".faq-answer")).toBeVisible();

    const closing = await toggleAndSample(item(page), 700);
    expect(
      closing.some((h) => h > closed + 2 && h < open - 2),
      `and back through them: ${closing.join(", ")}`
    ).toBe(true);
    expect(closing[closing.length - 1]).toBe(closed);
    await expect(item(page)).toHaveJSProperty("open", false);
  });

  /** She types answers in a plain box, so a line break she types is one she means. */
  test("an answer keeps its line breaks", async ({ page }) => {
    await item(page).locator("summary").click();
    await expect(item(page).locator(".faq-answer")).toBeVisible();
    expect(await item(page).locator(".faq-answer").innerText()).toBe("Rândul unu\nRândul doi");
  });

  /**
   * The frame is a plain border: no blur (a blurred element is drawn on a
   * layer of its own, where its clipping and its corners do not always agree)
   * and nothing clipped, in either engine.
   */
  test("the frame is drawn plainly: a border, no blur, nothing clipped", async ({ page }) => {
    const frame = page.locator(".faq-list");
    await expect(frame).toHaveCSS("border-top-width", "1px");
    await expect(frame).toHaveCSS("overflow", "visible");
    const blur = await frame.evaluate((el) => {
      const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return style.backdropFilter || style.webkitBackdropFilter || "none";
    });
    expect(blur).toBe("none");
  });

  test.describe("with less motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("an answer is simply there, and simply gone", async ({ page }) => {
      await item(page).scrollIntoViewIfNeeded();
      const closed = Math.round(await item(page).evaluate((d) => d.getBoundingClientRect().height));
      const opening = await toggleAndSample(item(page), 300);
      const open = opening[opening.length - 1];
      expect(open).toBeGreaterThan(closed + 20);
      expect(opening.every((h) => h === open), `no heights in between: ${opening.join(", ")}`).toBe(true);
      const closing = await toggleAndSample(item(page), 300);
      expect(closing.every((h) => h === closed), `none on the way back either: ${closing.join(", ")}`).toBe(true);
    });
  });
});
