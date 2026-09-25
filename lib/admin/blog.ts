import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { AdminError, must } from "@/lib/admin/db";

/**
 * Reading and writing blog posts from the admin: the post list, and the
 * editor's autosave and publishing.
 *
 * HOW A POST MOVES
 *
 *   never published  Every save writes straight to the post. Visitors cannot
 *                    see it (the read policy wants `published`).
 *   published        Saves go to the post's row in `content_drafts` instead,
 *                    so visitors keep reading the published version while she
 *                    works. "Publică modificările" copies them onto the post
 *                    in one transaction (publish_post_draft in
 *                    supabase/migrations/20260926000000_blog_editorial.sql).
 *
 * Hiding is not a draft change: the switch applies at once, published or not.
 */

export type PostRow = Database["public"]["Tables"]["blog_posts"]["Row"];

/** A write that returns its row: the row, or an error if none came back. */
function one<T>(row: T | null): T {
  if (!row) throw new AdminError("unknown", "The post was not returned; it may have been deleted.");
  return row;
}

/** The fields the editor writes, in both of the places a save can go. */
export const POST_FIELDS = [
  "slug",
  "title_ro",
  "title_en",
  "subtitle_ro",
  "subtitle_en",
  "content_ro",
  "content_en",
  "cover_url",
  "author",
] as const;

export type PostField = (typeof POST_FIELDS)[number];
export type PostFields = { slug: string; title_ro: string } & {
  [K in Exclude<PostField, "slug" | "title_ro">]: string | null;
};

export function fieldsOf(row: Pick<PostRow, PostField>): PostFields {
  return Object.fromEntries(POST_FIELDS.map((f) => [f, row[f] ?? (f === "slug" || f === "title_ro" ? "" : null)])) as PostFields;
}

/** Fields that differ between two versions: what a save has to send. */
export function changedFields(from: PostFields, to: PostFields): Partial<PostFields> {
  const out: Partial<PostFields> = {};
  for (const f of POST_FIELDS) if (from[f] !== to[f]) (out as Record<string, unknown>)[f] = to[f];
  return out;
}

/** Which tab a post belongs to. Every post is in exactly one. */
export type PostStatus = "published" | "draft" | "hidden";

export function postStatus(post: Pick<PostRow, "published" | "hidden">): PostStatus {
  if (post.hidden) return "hidden";
  return post.published ? "published" : "draft";
}

/**
 * A post's address from its title: lowercase, Romanian letters without their
 * marks (ș to s, ă to a), anything else a hyphen. The same rule as the check on
 * the column, so what this makes is always accepted.
 */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Lowercase and without diacritics, so "respiratie" finds "Respirație". */
export function searchable(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** A list row: the post without its text, plus when its private changes were last saved. */
export type ListedPost = Pick<
  PostRow,
  | "id"
  | "slug"
  | "title_ro"
  | "title_en"
  | "subtitle_ro"
  | "subtitle_en"
  | "cover_url"
  | "first_image"
  | "published"
  | "hidden"
  | "published_at"
  | "created_at"
  | "updated_at"
> & { draft_updated_at: string | null };

/**
 * Every post, without its text. A solo blog has tens of posts, not
 * thousands, so the list filters, sorts and pages them in the browser, which
 * keeps every tab's count exact without a query per tab.
 */
export async function listPosts(): Promise<ListedPost[]> {
  const rows = must(
    await createClient()
      .from("blog_posts")
      .select(
        "id, slug, title_ro, title_en, subtitle_ro, subtitle_en, cover_url, first_image, published, hidden, published_at, created_at, updated_at, content_drafts(updated_at)"
      )
  );
  return (rows ?? []).map(({ content_drafts, ...post }) => ({
    ...post,
    draft_updated_at: content_drafts?.updated_at ?? null,
  }));
}

/** A post and its private changes, for the editor. Null when there is no such post. */
export async function loadPost(id: string): Promise<{ post: PostRow; draft: Partial<PostFields> | null } | null> {
  const supabase = createClient();
  const post = must(await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle());
  if (!post) return null;
  const draft = must(await supabase.from("content_drafts").select("data").eq("post_id", id).maybeSingle());
  return { post, draft: (draft?.data as Partial<PostFields> | undefined) ?? null };
}

export async function createPost(fields: PostFields, hidden: boolean): Promise<PostRow> {
  return one(
    must(
      await createClient()
        .from("blog_posts")
        .insert({ ...fields, hidden, published: false })
        .select("*")
        .single()
    )
  );
}

/** Writes changes to a post that has never been published. */
export async function updatePost(id: string, changes: Partial<PostFields>): Promise<void> {
  must(await createClient().from("blog_posts").update(changes).eq("id", id));
}

/**
 * Saves the whole edited version of a published post as its private changes.
 * The whole version, not the difference, so the row always says exactly what
 * publishing would produce.
 */
export async function saveDraft(id: string, fields: PostFields): Promise<void> {
  must(
    await createClient()
      .from("content_drafts")
      .upsert({ post_id: id, data: fields }, { onConflict: "post_id" })
  );
}

export async function discardDraft(id: string): Promise<void> {
  must(await createClient().from("content_drafts").delete().eq("post_id", id));
}

export async function setHidden(id: string, hidden: boolean): Promise<void> {
  must(await createClient().from("blog_posts").update({ hidden }).eq("id", id));
}

/** Publishes a post for the first time, with its fields as they are now. */
export async function publishNew(id: string, fields: PostFields): Promise<PostRow> {
  return one(
    must(
      await createClient()
        .from("blog_posts")
        .update({ ...fields, published: true })
        .eq("id", id)
        .select("*")
        .single()
    )
  );
}

/** Publishes a published post's private changes. */
export async function publishChanges(id: string): Promise<PostRow> {
  const supabase = createClient();
  must(await supabase.rpc("publish_post_draft", { p_post_id: id }));
  return one(must(await supabase.from("blog_posts").select("*").eq("id", id).single()));
}

export async function deletePost(id: string): Promise<void> {
  must(await createClient().from("blog_posts").delete().eq("id", id));
}

/** Whether nothing at all has been written: such a post is thrown away on Back. */
export function isBlank(fields: PostFields, placeholderSlug: string): boolean {
  return POST_FIELDS.every((f) => {
    if (f === "slug") return !fields.slug || fields.slug === placeholderSlug;
    if (f === "author") return true; // pre-filled, not written by her
    return !fields[f]?.trim();
  });
}

/**
 * What Publish needs: a title, a valid address and some text. Returns the
 * first thing missing, as a key under admin.blog_editor.
 */
export function publishProblem(fields: PostFields): string | null {
  if (!fields.title_ro.trim()) return "need_title";
  if (!SLUG_PATTERN.test(fields.slug)) return "need_slug";
  if (!fields.content_ro?.trim()) return "need_content";
  return null;
}

/** The error a save failed with, if it was the address already being taken. */
export function isSlugTaken(error: unknown): boolean {
  return error instanceof AdminError && error.kind === "duplicate" && error.field === "slug";
}

/** The blog's default author, from Conținut site; empty when she has not set one. */
export async function defaultAuthor(): Promise<string> {
  const row = must(
    await createClient().from("site_content").select("value_ro").eq("key", "blog.default_author").maybeSingle()
  );
  return row?.value_ro?.trim() ?? "";
}

/**
 * Whether another post already has this address. Only needed for a live
 * post's private changes: they are saved in content_drafts, where the unique
 * constraint on blog_posts.slug cannot see them until publishing.
 */
export async function slugInUse(slug: string, exceptId: string): Promise<boolean> {
  const rows = must(await createClient().from("blog_posts").select("id").eq("slug", slug).neq("id", exceptId).limit(1));
  return (rows ?? []).length > 0;
}
