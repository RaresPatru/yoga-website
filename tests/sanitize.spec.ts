import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { sanitizeHtml } from "../lib/sanitize";
import { deletePostBySlug, seedPost } from "./helpers";

/**
 * The sanitizer every piece of stored HTML passes through before it is
 * rendered with dangerouslySetInnerHTML: blog posts, event descriptions, and
 * her About and home-page copy.
 *
 * The first block pins what it keeps and what it removes, by calling
 * sanitizeHtml directly in the test runner's own Node process. The second
 * renders a stored post through the production server.
 */
test.describe("the sanitizer's package", () => {
  /**
   * Vercel's functions will not require() an ES module, even on Node 24,
   * which can. jsdom loads its dependencies with require(), and from jsdom 27
   * one of them, @exodus/bytes, is ES-module-only: every page that sanitizes
   * then answers 500 on Vercel while `next start` serves it happily here.
   * That happened in production in August 2026 and again on a preview in
   * September; see "isomorphic-dompurify stays on 2.x" in docs/DECISIONS.md.
   *
   * Switching that one Node feature off reproduces Vercel's error exactly, so
   * an upgrade that would take the site down fails here first. If Node ever
   * drops the flag, this fails with "bad option" rather than passing quietly.
   */
  test("loads without require() of ES modules, as Vercel's functions demand", () => {
    const load = spawnSync(
      process.execPath,
      ["--no-experimental-require-module", "-e", "require('isomorphic-dompurify')"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(load.status, `isomorphic-dompurify cannot load the way Vercel loads it:\n${load.stderr}`).toBe(0);
  });
});

test.describe("sanitizeHtml", () => {
  test("keeps the formatting the editor produces, unchanged", () => {
    const editorHtml =
      '<h2>Secțiune</h2><h3>Subsecțiune</h3><p>Text <strong>aldin</strong> <em>cursiv</em> ' +
      '<s>tăiat</s> <code>cod</code> <a href="https://example.com" rel="noopener noreferrer nofollow">link</a></p>' +
      "<ul><li><p>unu</p></li></ul><ol><li><p>doi</p></li></ol><blockquote><p>citat</p></blockquote>" +
      '<pre><code class="language-js">x &lt; y</code></pre><hr><p><br></p>' +
      '<img src="https://abc.supabase.co/storage/v1/object/public/media/a.jpg" alt="Poză">';
    expect(sanitizeHtml(editorHtml)).toBe(editorHtml);
  });

  test("removes scripts, event handlers and script URLs", () => {
    const out = sanitizeHtml(
      '<p onclick="alert(1)">păstrat</p><img src="x" onerror="alert(1)"><script>alert(1)</script>' +
        '<a href="javascript:alert(1)">a</a><a href="JaVaScRiPt:alert(1)">b</a>' +
        '<a href="data:text/html,<script>alert(1)</script>">c</a><svg onload="alert(1)"></svg>' +
        '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'
    );
    expect(out).not.toMatch(/<script|<svg|onerror|onclick|onload|javascript:|data:text/i);
    expect(out).toContain("<p>păstrat</p>");
  });

  test("keeps embeds from the providers the editor offers", () => {
    for (const src of [
      "https://www.youtube.com/embed/abc123",
      "https://youtube.com/embed/abc123",
      "https://www.youtube-nocookie.com/embed/abc123",
      "https://player.vimeo.com/video/123",
      "https://www.instagram.com/p/AbC_123/embed",
      "https://www.instagram.com/reel/AbC/embed/",
    ]) {
      const frame = `<iframe src="${src}" allow="autoplay" allowfullscreen="true" title="Video" loading="lazy"></iframe>`;
      expect(sanitizeHtml(frame), src).toBe(frame);
    }
  });

  test("drops every other frame, including lookalike and insecure hosts", () => {
    for (const src of [
      "https://evil.example/embed/x",
      "https://youtube.com.attacker.example/embed/x",
      "https://www.youtube.com.attacker.example/embed/x",
      "http://www.youtube.com/embed/abc",
      "//www.youtube.com/embed/abc",
      "",
    ]) {
      expect(sanitizeHtml(`<p>a</p><iframe src="${src}"></iframe>`), src).toBe("<p>a</p>");
    }
  });

  test("strips srcdoc from a frame it keeps", () => {
    expect(
      sanitizeHtml(
        '<iframe src="https://www.youtube.com/embed/abc" srcdoc="<script>alert(1)</script>"></iframe>'
      )
    ).toBe('<iframe src="https://www.youtube.com/embed/abc"></iframe>');
  });

  test("keeps audio and video with their controls", () => {
    const media = "https://abc.supabase.co/storage/v1/object/public/media";
    const out = sanitizeHtml(
      `<video src="${media}/v.mp4" controls poster="${media}/p.jpg" preload="metadata" playsinline></video>` +
        `<audio src="${media}/a.mp3" controls></audio>`
    );
    expect(out).toContain(`<video src="${media}/v.mp4" controls="" poster="${media}/p.jpg"`);
    expect(out).toContain('preload="metadata" playsinline=""');
    expect(out).toContain(`<audio src="${media}/a.mp3" controls=""></audio>`);
  });

  test("removes elements that redirect the page or load from elsewhere", () => {
    expect(
      sanitizeHtml(
        '<p>a</p><meta http-equiv="refresh" content="0;url=https://evil.example">' +
          '<base href="https://evil.example/"><link rel="stylesheet" href="https://evil.example/x.css">' +
          '<object data="https://evil.example/x"></object><embed src="https://evil.example/x">'
      )
    ).toBe("<p>a</p>");
  });

  test("escapes text that only looks like markup", () => {
    expect(sanitizeHtml("2 < 3 and 5 > 4 & so on")).toBe("2 &lt; 3 and 5 &gt; 4 &amp; so on");
  });
});

test.describe("a stored post on its page", () => {
  let slug = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("arrives sanitized, with its allowed embed intact", async ({ page }) => {
    // The embed only has to exist, not play: nothing leaves the machine.
    await page.route(/^https:\/\/(www\.)?youtube\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "" })
    );

    const post = await seedPost({
      content_ro:
        "<p>Paragraf păstrat.</p>" +
        // An image that cannot load, so a surviving onerror would run; and a
        // script in server-rendered HTML runs as the page parses.
        '<img src="https://invalid.invalid/x.png" onerror="window.__injected = 1">' +
        "<script>window.__injected = 2</script>" +
        '<iframe src="https://evil.example/embed/x"></iframe>' +
        '<iframe src="https://www.youtube.com/embed/abc123" title="Video"></iframe>',
    });
    slug = post.slug;

    await page.goto(`/ro/blog/${slug}`);
    const body = page.locator(".blog-content");
    await expect(body.getByText("Paragraf păstrat.")).toBeVisible();
    await expect(body.locator("script")).toHaveCount(0);
    await expect(body.locator("[onerror]")).toHaveCount(0);
    await expect(body.locator("iframe")).toHaveCount(1);
    await expect(body.locator("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/abc123"
    );
    expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  });
});
