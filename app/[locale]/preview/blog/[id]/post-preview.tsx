"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { localisePost } from "@/lib/blog";
import { Article, type ArticleView } from "@/components/blog/article";

/** Words at 200 a minute, at least 1: the database's own rule, for text it has not stored yet. */
function readingMinutes(html: string | null | undefined): number | null {
  if (!html?.trim()) return null;
  const words = html.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

/** The first picture in the text, as the database works it out once saved. */
function firstImage(html: string | null | undefined): string | null {
  return html?.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1] ?? null;
}

type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "ready"; view: ArticleView };

/**
 * Reads the post and its private changes as the signed-in admin and draws the
 * result with the public article's own component. The reading time and first
 * picture are worked out here, because the database computes them only for
 * what is saved on the post itself, not for changes waiting to be published.
 */
export function PostPreview({
  id,
  locale,
  defaultAuthor,
}: {
  id: string;
  locale: string;
  defaultAuthor: string | null;
}) {
  const t = useTranslations("blog");
  const tp = useTranslations("preview");
  const te = useTranslations("embed");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: post } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
      if (!post) {
        if (!cancelled) setState({ kind: "unavailable" });
        return;
      }
      const { data: draft } = await supabase
        .from("content_drafts")
        .select("data")
        .eq("post_id", id)
        .maybeSingle();
      const merged = { ...post, ...((draft?.data as Partial<typeof post> | undefined) ?? {}) };
      const withComputed = {
        ...merged,
        first_image: firstImage(merged.content_ro),
        reading_minutes_ro: readingMinutes(merged.content_ro),
        reading_minutes_en: readingMinutes(merged.content_en),
        // Not published yet: dated today, as it would be if published now.
        published_at: merged.published_at ?? new Date().toISOString(),
      };
      const view = localisePost(withComputed, locale);
      const labels = {
        play: te("play", { provider: "{provider}" }),
        note: te("note", { provider: "{provider}" }),
      };
      if (cancelled) return;
      setState({
        kind: "ready",
        view: {
          ...view,
          author: merged.author?.trim() || defaultAuthor,
          html: view.content ? sanitizeArticleHtml(view.content, labels) : null,
        },
      });
    })().catch(() => {
      if (!cancelled) setState({ kind: "unavailable" });
    });
    return () => {
      cancelled = true;
    };
  }, [id, locale, defaultAuthor, te]);

  if (state.kind === "loading") {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }
  if (state.kind === "unavailable") {
    return <p className="mx-auto max-w-xl px-4 py-24 text-center text-charcoal-light">{tp("unavailable")}</p>;
  }

  return (
    <>
      <p className="flex items-center justify-center gap-2 bg-sage/15 px-4 py-2 text-center text-sm text-sage-deep">
        <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
        {tp("banner")}
      </p>
      <Article
        view={state.view}
        locale={locale}
        labels={{
          back: t("back"),
          by: (author) => t("by", { author }),
          readingTime: (minutes) => t("reading_time", { minutes }),
        }}
      />
    </>
  );
}
