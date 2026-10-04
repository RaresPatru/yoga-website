import { test, expect, type Page } from "@playwright/test";

/**
 * "Înapoi sus" (components/layout/back-to-top.tsx): a round button that
 * appears once the first screen has scrolled away, comes and goes with the
 * top bar, and takes the page back to its top: smoothly, or at once for
 * someone who asked for less motion.
 */

const hydrated = (page: Page) => page.locator("next-route-announcer").waitFor({ state: "attached" });

const button = (page: Page) => page.getByRole("button", { name: "Înapoi sus" });

/**
 * Presses the button and returns how it asked the browser to scroll.
 *
 * The scroll itself is the browser's; what the button decides is where to
 * and whether smoothly, so that is what is checked, with where the page ends
 * up. Watching the glide frame by frame is at the mercy of how many frames a
 * busy page gets drawn, which on CI's Linux WebKit was three in 0.7 s.
 */
function press(page: Page): Promise<ScrollToOptions[]> {
  return page.evaluate(() => {
    const asked: ScrollToOptions[] = [];
    const scrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((...args: [ScrollToOptions] | [number, number]) => {
      if (typeof args[0] === "object") asked.push(args[0]);
      return (scrollTo as (...a: unknown[]) => void)(...args);
    }) as typeof window.scrollTo;
    document.querySelector<HTMLButtonElement>(".back-to-top")!.click();
    window.scrollTo = scrollTo;
    return asked;
  });
}

/** Scrolled past the first screen, with the top bar (and so the button) showing. */
async function pastTheFirstScreen(page: Page) {
  await page.evaluate(() => window.scrollTo(0, Math.round(innerHeight * 1.5)));
  await expect(page.locator("header")).not.toHaveAttribute("data-hidden");
  await expect(button(page)).toBeVisible();
}

test.describe("Înapoi sus", () => {
  test("waits for the first screen to scroll away", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await expect(button(page)).toBeHidden();
    // Out of the keyboard's reach while it is hidden, too.
    const focusable = () =>
      page.evaluate(() => {
        const el = document.querySelector<HTMLButtonElement>(".back-to-top")!;
        el.focus();
        const took = document.activeElement === el;
        el.blur();
        return took;
      });
    expect(await focusable()).toBe(false);
    await pastTheFirstScreen(page);
    expect(await focusable()).toBe(true);
  });

  /** Reading downwards the bar leaves, and the button with it; scrolling up brings both. */
  test("comes and goes with the top bar", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await pastTheFirstScreen(page);
    // The bar holds for a moment after introducing itself, then yields to reading.
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.scrollBy(0, 400));
    await expect(page.locator("header")).toHaveAttribute("data-hidden", "");
    await expect(button(page)).toBeHidden();
    await page.evaluate(() => window.scrollBy(0, -200));
    await expect(page.locator("header")).not.toHaveAttribute("data-hidden");
    await expect(button(page)).toBeVisible();
  });

  test("glides back to the top and hands the keyboard the start of the page", async ({ page }) => {
    await page.goto("/ro");
    await hydrated(page);
    await pastTheFirstScreen(page);

    expect(await press(page)).toEqual([{ top: 0, behavior: "smooth" }]);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");
    await expect(button(page)).toBeHidden();
  });

  test("never shows on a page shorter than two screens", async ({ page }) => {
    await page.goto("/ro/pagina-care-nu-exista");
    await hydrated(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    await expect(button(page)).toBeHidden();
  });

  test.describe("with less motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("goes to the top at once", async ({ page }) => {
      await page.goto("/ro");
      await hydrated(page);
      await pastTheFirstScreen(page);
      expect(await press(page)).toEqual([{ top: 0, behavior: "auto" }]);
      // "auto" with nothing smoothing it is a jump: there on the next line.
      expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    });
  });
});
