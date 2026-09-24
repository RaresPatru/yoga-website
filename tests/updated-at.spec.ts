import { test, expect } from "@playwright/test";
import { deletePostBySlug, seedPost, updatePost } from "./helpers";

/**
 * `updated_at` is stamped by a database trigger on every update
 * (20260924000000_updated_at_triggers.sql). Before it, the admin saves never
 * set the column, so the sitemap told search engines each post had last
 * changed on the day it was created (audit B29).
 */
test("editing a post moves its updated_at, and the sitemap reports the new date", async ({
  request,
}) => {
  const post = await seedPost();
  try {
    const edited = await updatePost(post.slug, { title_ro: "Titlu modificat" });
    expect(new Date(edited.updated_at).getTime()).toBeGreaterThan(
      new Date(edited.created_at).getTime()
    );

    const sitemap = await (await request.get("/sitemap.xml")).text();
    const entry = sitemap.match(
      new RegExp(`<url>(?:(?!</url>)[\\s\\S])*?/ro/blog/${post.slug}</loc>(?:(?!</url>)[\\s\\S])*?</url>`)
    );
    expect(entry, "the post is in the sitemap").not.toBeNull();
    const lastmod = entry![0].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    expect(lastmod && new Date(lastmod).getTime()).toBe(new Date(edited.updated_at).getTime());
  } finally {
    await deletePostBySlug(post.slug);
  }
});
