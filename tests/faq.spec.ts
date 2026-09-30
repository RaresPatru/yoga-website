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
 * Taps the question and returns the heights its box went through, the last
 * being where it came to rest.
 *
 * Two engines, two ways of looking:
 *
 * - Where the script animates it (Safari, Firefox), its animation is paused
 *   half way and measured there. Sampling frame by frame missed the unfold on
 *   CI's Linux WebKit, where a busy page drew three frames in 0.7 s.
 * - Where CSS does it (Chromium), the transition runs on ::details-content,
 *   which Chromium reports neither through getAnimations() nor with
 *   transition events, so the box is read on every frame for 0.6 s. Chromium
 *   draws those frames, on CI too.
 */
function toggle(item: Locator): Promise<number[]> {
  return item.evaluate(async (details) => {
    details.querySelector("summary")!.click();
    const scripted = document
      .getAnimations()
      .filter((animation) => (animation.effect as KeyframeEffect | null)?.target === details);
    if (scripted.length) {
      for (const animation of scripted) {
        animation.pause();
        animation.currentTime = 160;
      }
      const midway = Math.round(details.getBoundingClientRect().height);
      await Promise.all(
        scripted.map((animation) => {
          animation.finish();
          return animation.finished.catch(() => undefined);
        })
      );
      // The script closes the <details> once its animation has finished.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return [midway, Math.round(details.getBoundingClientRect().height)];
    }
    const heights: number[] = [];
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        heights.push(Math.round(details.getBoundingClientRect().height));
        if (performance.now() - start < 600) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return heights;
  });
}

const height = (item: Locator) => item.evaluate((d) => Math.round(d.getBoundingClientRect().height));

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
    const closed = await height(item(page));

    const opening = await toggle(item(page));
    await expect(item(page)).toHaveJSProperty("open", true);
    await expect(item(page).locator(".faq-answer")).toBeVisible();
    const open = await height(item(page));
    expect(open, "open, it holds the answer").toBeGreaterThan(closed + 20);
    expect(
      opening.some((h) => h > closed + 2 && h < open - 2),
      `it passes through the heights in between: ${opening.join(", ")}`
    ).toBe(true);

    const closing = await toggle(item(page));
    expect(
      closing.some((h) => h > closed + 2 && h < open - 2),
      `and back through them: ${closing.join(", ")}`
    ).toBe(true);
    await expect(item(page)).toHaveJSProperty("open", false);
    expect(await height(item(page))).toBe(closed);
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
      const closed = await height(item(page));

      const opening = await toggle(item(page));
      await expect(item(page)).toHaveJSProperty("open", true);
      const open = await height(item(page));
      expect(open).toBeGreaterThan(closed + 20);
      expect(opening.every((h) => h === open), `no heights in between: ${opening.join(", ")}`).toBe(true);

      const closing = await toggle(item(page));
      await expect(item(page)).toHaveJSProperty("open", false);
      expect(closing.every((h) => h === closed), `none on the way back either: ${closing.join(", ")}`).toBe(true);
    });
  });
});
