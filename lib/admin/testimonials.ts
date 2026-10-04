import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";
import { must } from "@/lib/admin/db";

/**
 * Reading and changing testimonials from the admin (/admin/testimonials).
 * Every write goes through her own session, so the admin-only policies on
 * `testimonials` decide; nothing here needs the server.
 *
 * What she can change is deliberately small: whether it is published, hidden
 * or on the home page (and where), and a video link. The words, the rating
 * and the name are the participant's, and a verified testimonial she could
 * rewrite would not be one.
 */

export type TestimonialTab = "pending" | "approved" | "hidden";

export interface AdminTestimonial {
  id: string;
  content: string;
  rating: number | null;
  author_name: string | null;
  video_url: string | null;
  photo_url: string | null;
  approved: boolean;
  hidden: boolean;
  on_home: boolean;
  home_order: number | null;
  source: string;
  locale: string | null;
  created_at: string;
  event_title_ro: string | null;
  event_date: string | null;
  registrations: { full_name: string } | null;
  events: { id: string; title_ro: string; date: string } | null;
}

export function tabOf(t: Pick<AdminTestimonial, "approved" | "hidden">): TestimonialTab {
  if (t.hidden) return "hidden";
  return t.approved ? "approved" : "pending";
}

export async function listTestimonials(): Promise<AdminTestimonial[]> {
  const rows = must(
    await createClient()
      .from("testimonials")
      .select(
        "id, content, rating, author_name, video_url, photo_url, approved, hidden, on_home, home_order, source, locale, created_at, event_title_ro, event_date, registrations(full_name), events(id, title_ro, date)"
      )
      .order("created_at", { ascending: false })
  );
  return (rows ?? []) as AdminTestimonial[];
}

async function update(id: string, changes: Database["public"]["Tables"]["testimonials"]["Update"]) {
  must(await createClient().from("testimonials").update(changes).eq("id", id));
}

export const approveTestimonial = (id: string) => update(id, { approved: true });

/** Hidden testimonials leave the home page too, so showing one again does not surprise her there. */
export const setHidden = (id: string, hidden: boolean) =>
  update(id, hidden ? { hidden: true, on_home: false, home_order: null } : { hidden: false });

/** Onto the home page at the end of her selection, or off it. */
export async function setOnHome(id: string, onHome: boolean, all: AdminTestimonial[]) {
  if (!onHome) return update(id, { on_home: false, home_order: null });
  const last = Math.max(0, ...all.filter((t) => t.on_home).map((t) => t.home_order ?? 0));
  return update(id, { on_home: true, home_order: last + 1 });
}

/**
 * Moves one testimonial a place up or down the home page selection. The
 * selection is renumbered 1, 2, 3… as it is saved, so gaps left by removals
 * or equal numbers never make a move do nothing.
 */
export async function moveOnHome(id: string, direction: -1 | 1, all: AdminTestimonial[]) {
  const order = homeSelection(all).map((t) => t.id);
  const from = order.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  for (const [index, key] of order.entries()) await update(key, { home_order: index + 1 });
}

export function homeSelection(all: AdminTestimonial[]): AdminTestimonial[] {
  return all
    .filter((t) => t.on_home && !t.hidden && t.approved)
    .sort((a, b) => (a.home_order ?? Infinity) - (b.home_order ?? Infinity) || a.created_at.localeCompare(b.created_at));
}

export const setVideo = (id: string, url: string | null) => update(id, { video_url: url });

/** Deletes it, and its photo if the site stored one. */
export async function deleteTestimonial(item: Pick<AdminTestimonial, "id" | "photo_url">) {
  const supabase = createClient();
  must(await supabase.from("testimonials").delete().eq("id", item.id));
  const path = item.photo_url?.match(/\/storage\/v1\/object\/public\/media\/(testimonials\/[\w-]+\.webp)$/)?.[1];
  if (path) {
    const { error } = await supabase.storage.from("media").remove([path]);
    if (error) console.error("The testimonial's photo was not removed:", error);
  }
}
