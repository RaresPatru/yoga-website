import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { sanitizeArticleHtml, sanitizeHtml } from "../lib/sanitize";
import { EMBED_ORIGINS, embedFromUrl, playerSrc, portraitMaxWidth } from "../lib/embeds";
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
      "https://www.tiktok.com/player/v1/7234567890123456789",
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
      "https://www.tiktok.com/@someone/video/7234567890123456789",
      "https://www.google.com/maps/embed?pb=x",
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

/**
 * lib/embeds.ts: the one list of video players the editor, the sanitizer and
 * the public pages share.
 */
test.describe("video addresses", () => {
  test("each supported address becomes its player, portrait where the video is", () => {
    const cases: [string, string, string][] = [
      ["https://www.youtube.com/watch?v=abc123XYZ", "https://www.youtube-nocookie.com/embed/abc123XYZ", "16 / 9"],
      ["https://youtu.be/abc123XYZ?si=share", "https://www.youtube-nocookie.com/embed/abc123XYZ", "16 / 9"],
      ["https://m.youtube.com/watch?feature=share&v=abc123XYZ", "https://www.youtube-nocookie.com/embed/abc123XYZ", "16 / 9"],
      ["https://www.youtube.com/shorts/abc123XYZ", "https://www.youtube-nocookie.com/embed/abc123XYZ", "9 / 16"],
      ["youtube.com/watch?v=abc123XYZ", "https://www.youtube-nocookie.com/embed/abc123XYZ", "16 / 9"],
      ["https://vimeo.com/123456", "https://player.vimeo.com/video/123456", "16 / 9"],
      ["https://www.instagram.com/p/AbC_123/", "https://www.instagram.com/p/AbC_123/embed", "4 / 5"],
      ["https://www.instagram.com/reel/AbC_123/?igsh=x", "https://www.instagram.com/reel/AbC_123/embed", "9 / 16"],
      ["https://www.instagram.com/reels/AbC_123/", "https://www.instagram.com/reel/AbC_123/embed", "9 / 16"],
      ["https://www.tiktok.com/@flow4ward/video/7234567890123456789", "https://www.tiktok.com/player/v1/7234567890123456789", "9 / 16"],
    ];
    for (const [input, src, aspect] of cases) {
      expect(embedFromUrl(input), input).toMatchObject({ src, aspect });
      // And what the dialog makes, the sanitizer keeps.
      expect(sanitizeHtml(`<iframe src="${src}"></iframe>`), input).toContain(src);
    }
  });

  test("maps, TikTok short links and everything else are refused with a reason", () => {
    expect(embedFromUrl("https://maps.app.goo.gl/abc")).toEqual({ refused: "map" });
    expect(embedFromUrl("https://www.google.com/maps/place/Cluj")).toEqual({ refused: "map" });
    expect(embedFromUrl("https://vm.tiktok.com/ZMabc/")).toEqual({ refused: "tiktok_short" });
    expect(embedFromUrl("https://example.com/video")).toEqual({ refused: "unsupported" });
    expect(embedFromUrl("nu e o adresă")).toEqual({ refused: "not_a_link" });
  });

  test("a pressed video plays from the no-cookie host, and portrait ones are capped in width", () => {
    expect(playerSrc("https://www.youtube.com/embed/abc")).toBe("https://www.youtube-nocookie.com/embed/abc?autoplay=1");
    expect(playerSrc("https://player.vimeo.com/video/1")).toBe("https://player.vimeo.com/video/1?autoplay=1");
    expect(playerSrc("https://www.instagram.com/p/a/embed")).toBe("https://www.instagram.com/p/a/embed");
    expect(portraitMaxWidth("16 / 9")).toBeNull();
    expect(portraitMaxWidth("9 / 16")).toBe("22.5rem");
    expect(portraitMaxWidth("4 / 5")).toBe("32rem");
  });

  test("the page's Content-Security-Policy lets every player load", async ({ request }) => {
    const csp = (await request.get("/ro")).headers()["content-security-policy"] ?? "";
    const frameSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src")) ?? "";
    for (const origin of EMBED_ORIGINS) expect(frameSrc, origin).toContain(origin);
  });

  test("only the preview may be framed, and only by this site", async ({ request }) => {
    const page = (await request.get("/ro")).headers();
    expect(page["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(page["x-frame-options"]).toBe("DENY");
    const preview = (await request.get("/ro/preview/blog/00000000-0000-0000-0000-000000000000")).headers();
    expect(preview["content-security-policy"]).toContain("frame-ancestors 'self'");
    expect(preview["content-security-policy"]).not.toContain("frame-ancestors 'none'");
    expect(preview["x-frame-options"]).toBe("SAMEORIGIN");
    expect(preview["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("videos on public pages", () => {
  const labels = { play: "Play from {provider}", note: "{provider} not contacted" };

  test("become placeholders that remember the player, its shape and its name", () => {
    const out = sanitizeArticleHtml(
      '<p>a</p><div class="relative" style="aspect-ratio:9 / 16;max-width:360px"><iframe src="https://www.instagram.com/reel/AbC/embed" data-aspect="9 / 16" title="Instagram"></iframe></div><p>b</p>',
      labels
    );
    expect(out).not.toContain("<iframe");
    expect(out).toContain('data-embed-src="https://www.instagram.com/reel/AbC/embed"');
    expect(out).toContain("aspect-ratio:9 / 16;max-width:22.5rem;");
    expect(out).toContain("Play from Instagram");
    expect(out).toContain("Instagram not contacted");
    // The wrapper went with the frame, and the words around it stayed.
    expect(out).toMatch(/^<p>a<\/p><figure[^>]*>[\s\S]*<\/figure><p>b<\/p>$/);
  });

  test("read the shape of posts saved before it was on the frame", () => {
    const out = sanitizeArticleHtml(
      '<div style="aspect-ratio:9 / 16;"><iframe src="https://www.youtube.com/embed/abc"></iframe></div>',
      labels
    );
    expect(out).toContain("aspect-ratio:9 / 16;");
  });

  test("are not made for frames the sanitizer drops", () => {
    const out = sanitizeArticleHtml('<iframe src="https://evil.example/embed/x"></iframe><p>ok</p>', labels);
    expect(out).toBe("<p>ok</p>");
  });
});

test.describe("a stored post on its page", () => {
  let slug = "";

  test.afterEach(async () => {
    if (slug) await deletePostBySlug(slug);
  });

  test("arrives sanitized, with its allowed embed waiting to be played", async ({ page }) => {
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
    // The evil frame is gone; the YouTube one is a placeholder until pressed.
    await expect(body.locator("iframe")).toHaveCount(0);
    await expect(body.locator(".embed-facade")).toHaveCount(1);
    await expect(body.locator(".embed-facade")).toHaveAttribute(
      "data-embed-src",
      "https://www.youtube.com/embed/abc123"
    );
    expect(await page.evaluate(() => "__injected" in window)).toBe(false);
  });
});
