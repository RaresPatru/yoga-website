import { test, expect } from "@playwright/test";
import { seedPost, deletePostBySlug, deletePostById } from "./helpers";

test.describe("blog", () => {
  test("list page renders posts and navigates to detail", async ({ page }) => {
    const post = await seedPost();
    const title = `Articol E2E ${post.slug}`;
    try {
      await page.goto("/ro/blog");
      await expect(page.getByRole("heading", { name: "Blog", exact: true })).toBeVisible();
      const card = page.getByRole("link", { name: title });
      await expect(card).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/ro/blog/${post.slug}`));
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("a card shows the cover, subtitle, date and reading time", async ({ page }) => {
    // 450 words: three minutes at 200 a minute.
    const words = Array.from({ length: 450 }, (_, i) => `cuvânt${i}`).join(" ");
    const post = await seedPost({
      subtitle_ro: "Un subtitlu de test",
      cover_url: "/mock/hero.webp",
      content_ro: `<p>${words}</p>`,
    });
    try {
      await page.goto("/ro/blog");
      const card = page.locator(`a[href$="/blog/${post.slug}"]`);
      await expect(card.locator("img")).toHaveCount(1);
      await expect(card).toContainText("Un subtitlu de test");
      await expect(card).toContainText("3 min de citit");
      await expect(card.locator("time")).toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T/);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("without a cover, a card uses the first picture in the text", async ({ page }) => {
    const post = await seedPost({ content_ro: '<p>Text.</p><img src="/mock/spare.webp" alt="x"><p>Mai mult.</p>' });
    try {
      await page.goto("/ro/blog");
      const card = page.locator(`a[href$="/blog/${post.slug}"]`);
      await expect(card.locator("img")).toHaveAttribute("src", /spare\.webp/);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("detail page shows content, byline, back link and a Share button under the title", async ({ page }) => {
    const post = await seedPost({ author: "Autoare E2E", subtitle_ro: "Subtitlul articolului" });
    const title = `Articol E2E ${post.slug}`;
    try {
      await page.goto(`/ro/blog/${post.slug}`);

      const heading = page.getByRole("heading", { level: 1, name: title });
      await expect(heading).toBeVisible();
      await expect(page.getByText("Subtitlul articolului")).toBeVisible();
      await expect(page.getByText("De Autoare E2E")).toBeVisible();
      await expect(page.getByText("1 min de citit")).toBeVisible();
      await expect(page.getByText("Conținut de test E2E.")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Secțiune test" })).toBeVisible();

      // Under the title, not beside it, so a long title keeps the whole line
      // on a phone (audit B24).
      const share = page.getByRole("button", { name: "Distribuie" });
      const titleBox = (await heading.boundingBox())!;
      const shareBox = (await share.boundingBox())!;
      expect(shareBox.y).toBeGreaterThan(titleBox.y + titleBox.height);

      await page.getByRole("link", { name: "Înapoi la blog" }).click();
      await expect(page).toHaveURL(/\/ro\/blog$/);
      await page.goto(`/ro/blog/${post.slug}`);

      // Found by what it says after the click: the button's name follows its
      // text, so a screen reader hears the confirmation (WCAG 2.5.3).
      await page.getByRole("button", { name: "Distribuie" }).click();
      await expect(page.getByRole("button", { name: "Link copiat!" })).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("a long title stays inside a phone's screen", async ({ page }) => {
    const post = await seedPost({ title_ro: `Un-titlu-fără-spații-care-nu-are-unde-să-se-rupă-${"a".repeat(60)}` });
    try {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`/ro/blog/${post.slug}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("English locale shows English title, and the Romanian subtitle when there is no English one", async ({ page }) => {
    const post = await seedPost({ subtitle_ro: "Doar în română" });
    const titleEn = `E2E Post ${post.slug}`;
    try {
      await page.goto(`/en/blog/${post.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: titleEn })).toBeVisible();
      await expect(page.getByText("Doar în română")).toBeVisible();
      await expect(page.getByRole("link", { name: "Back to blog" })).toBeVisible();
      await expect(page.getByText("1 min read")).toBeVisible();
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("the list is split into pages of twelve", async ({ page }) => {
    const seeded = await Promise.all(Array.from({ length: 13 }, () => seedPost()));
    try {
      await page.goto("/ro/blog");
      const cards = page.locator("main ul li a[href*='/blog/']");
      await expect(cards).toHaveCount(12);

      const pages = page.getByRole("navigation", { name: "Pagini" });
      await expect(pages.getByRole("link", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
      await pages.getByRole("link", { name: "Pagina 2" }).click();
      await expect(page).toHaveURL(/\/ro\/blog\?page=2$/);
      await expect(pages.getByRole("link", { name: "Pagina 2" })).toHaveAttribute("aria-current", "page");
      expect(await cards.count()).toBeGreaterThan(0);

      const beyond = await page.goto("/ro/blog?page=999");
      expect(beyond?.status()).toBe(404);
    } finally {
      for (const post of seeded) await deletePostById(post.id);
    }
  });
});

test.describe("videos in a post", () => {
  test("wait for a press, and only then contact the video site, from its no-cookie host", async ({ page }) => {
    const contacted: string[] = [];
    await page.route(/youtube(-nocookie)?\.com|ytimg\.com/, (route) => {
      contacted.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "" });
    });
    const post = await seedPost({
      content_ro:
        '<p>Înainte.</p><div style="aspect-ratio:16 / 9"><iframe src="https://www.youtube.com/embed/abc123" data-aspect="16 / 9" title="YouTube"></iframe></div>',
    });
    try {
      await page.goto(`/ro/blog/${post.slug}`);
      const play = page.getByRole("button", { name: /Pornește videoul de pe YouTube/ });
      await expect(play).toBeVisible();
      await expect(page.locator(".blog-content iframe")).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      expect(contacted, "the page contacted YouTube before anyone pressed play").toEqual([]);

      await play.click();
      const frame = page.locator(".blog-content iframe");
      await expect(frame).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/abc123?autoplay=1");
      await expect(frame).toBeFocused();
      await expect.poll(() => contacted.length).toBeGreaterThan(0);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });

  test("a portrait video keeps its shape and a sensible width", async ({ page }) => {
    const post = await seedPost({
      content_ro:
        '<div style="aspect-ratio:9 / 16"><iframe src="https://www.instagram.com/reel/AbC123/embed" data-aspect="9 / 16"></iframe></div>',
    });
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/ro/blog/${post.slug}`);
      const facade = page.locator(".embed-facade");
      const box = (await facade.boundingBox())!;
      expect(box.height / box.width).toBeCloseTo(16 / 9, 1);
      expect(box.width).toBeLessThanOrEqual(22.5 * 16 + 1);
    } finally {
      await deletePostBySlug(post.slug);
    }
  });
});
