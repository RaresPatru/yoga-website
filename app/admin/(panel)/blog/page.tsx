"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";
import { adminErrorKey } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { listPosts, postStatus, searchable, type ListedPost, type PostStatus } from "@/lib/admin/blog";
import { buttonClasses } from "@/lib/button-styles";
import { cn } from "@/lib/utils";
import { canOptimise } from "@/lib/image-src";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Pagination } from "@/components/ui/pagination";

/**
 * The post list: every post in one of three tabs, searchable and sortable,
 * 25 to a page. Everything that decides what is shown lives in the address
 * (?tab=drafts&q=yoga&sort=title&page=2), so the back button, a refresh and
 * the dashboard's "ciorne" link all land on the same view.
 */

const PER_PAGE = 25;
const TABS = ["all", "published", "drafts", "hidden"] as const;
type Tab = (typeof TABS)[number];
const SORTS = ["edited", "edited_oldest", "published", "published_oldest", "title"] as const;
type Sort = (typeof SORTS)[number];

const TAB_STATUS: Record<Exclude<Tab, "all">, PostStatus> = {
  published: "published",
  drafts: "draft",
  hidden: "hidden",
};

const STATUS_STYLE: Record<PostStatus, string> = {
  published: "bg-success/10 text-success",
  draft: "bg-charcoal/5 text-charcoal-light",
  hidden: "bg-warning/10 text-warning",
};

/** When she last touched it: the post itself, or its unpublished changes. */
function editedAt(post: ListedPost): string {
  return post.draft_updated_at && post.draft_updated_at > post.updated_at ? post.draft_updated_at : post.updated_at;
}

/** "acum 3 zile", "3 days ago". */
function relative(iso: string, locale: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale === "en" ? "en" : "ro", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, "minute");
}

function PostList() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.blog"));
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "all";
  const sort: Sort = (SORTS as readonly string[]).includes(params.get("sort") ?? "") ? (params.get("sort") as Sort) : "edited";
  const query = params.get("q") ?? "";
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);

  /** This view's address with some settings changed. A new filter starts again at page 1. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || (key === "tab" && value === "all") || (key === "sort" && value === "edited") || (key === "page" && value === "1")) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    const search = next.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  // The search box answers as she types, and writes to the address a moment
  // later, replacing rather than adding history entries for every letter.
  const [typed, setTyped] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setTyped(query);
  }
  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => router.replace(hrefWith({ q: typed.trim() || null }), { scroll: false }), 250);
    return () => window.clearTimeout(timer);
    // hrefWith reads the current params; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const { data: posts = [], loading, error } = useAdminData(listPosts);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: posts.length, published: 0, drafts: 0, hidden: 0 };
    for (const post of posts) {
      const status = postStatus(post);
      c[status === "draft" ? "drafts" : status]++;
    }
    return c;
  }, [posts]);

  const shown = useMemo(() => {
    const needle = searchable(typed.trim());
    const filtered = posts.filter((post) => {
      if (tab !== "all" && postStatus(post) !== TAB_STATUS[tab]) return false;
      if (!needle) return true;
      return [post.title_ro, post.title_en, post.subtitle_ro, post.subtitle_en, post.slug].some((field) =>
        searchable(field).includes(needle)
      );
    });
    const collator = new Intl.Collator("ro");
    return filtered.sort((a, b) => {
      switch (sort) {
        case "edited_oldest":
          return editedAt(a).localeCompare(editedAt(b));
        case "published":
          // Never-published posts last, newest publication first.
          return (b.published_at ?? "").localeCompare(a.published_at ?? "");
        case "published_oldest":
          // Never-published posts last here too: they have no date to order by.
          if (!a.published_at || !b.published_at) return Number(!a.published_at) - Number(!b.published_at);
          return a.published_at.localeCompare(b.published_at);
        case "title":
          // Untitled posts last.
          if (!a.title_ro.trim() || !b.title_ro.trim()) return Number(!a.title_ro.trim()) - Number(!b.title_ro.trim());
          return collator.compare(a.title_ro, b.title_ro);
        default:
          return editedAt(b).localeCompare(editedAt(a));
      }
    });
  }, [posts, tab, sort, typed]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const page = Math.min(requestedPage, pageCount);
  const visible = shown.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const tabLabel = (value: Tab) => t(`admin.blog_list.tab_${value}`);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t("admin.blog")}
        actions={
          <Link href="/admin/blog/new" className={buttonClasses({ size: "sm" })}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> {t("admin.new_post")}
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3">
        <nav aria-label={t("admin.blog_list.tabs")} className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
            {TABS.map((value) => (
              <li key={value}>
                <Link
                  href={hrefWith({ tab: value })}
                  aria-current={tab === value ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-full px-3 text-sm transition-colors sm:gap-2 sm:px-4",
                    tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                  )}
                >
                  {tabLabel(value)}
                  <span className={cn("tabular-nums text-xs", tab === value ? "text-cream/75" : "text-charcoal-light/80")}>
                    {counts[value]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("admin.blog_list.search")}</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" aria-hidden="true" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("admin.blog_list.search")}
              className="h-11 w-full rounded-full border border-sage/30 bg-white pl-10 pr-4 text-base text-charcoal placeholder:text-charcoal-light/60 sm:text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-charcoal-light">
            <span className="shrink-0">{t("admin.blog_list.sort")}</span>
            <select
              value={sort}
              onChange={(e) => router.replace(hrefWith({ sort: e.target.value }), { scroll: false })}
              className="admin-select h-11 min-w-0 rounded-full sm:w-72 border border-sage/30 bg-white px-4 text-base text-charcoal sm:text-sm"
            >
              {SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.blog_list.sort_${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">
          {posts.length === 0
            ? t("admin.blog_list.empty")
            : typed.trim()
              ? t("admin.blog_list.empty_search").replace("{query}", typed.trim())
              : t("admin.blog_list.empty_tab").replace("{tab}", tabLabel(tab))}
        </p>
      ) : (
        <ul className="divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
          {visible.map((post) => (
            <PostRow key={post.id} post={post} locale={locale} />
          ))}
        </ul>
      )}

      <Pagination
        className="mt-8"
        page={page}
        pageCount={pageCount}
        href={(p) => hrefWith({ page: String(p) })}
        labels={{
          label: t("pagination.label"),
          previous: t("pagination.previous"),
          next: t("pagination.next"),
          page: (p) => t("pagination.page").replace("{page}", String(p)),
        }}
      />
    </div>
  );
}

function PostRow({ post, locale }: { post: ListedPost; locale: string }) {
  const { t } = useAdminLocale();
  const status = postStatus(post);
  const picture = post.cover_url || post.first_image;
  const title = post.title_ro.trim() || t("admin.blog_list.untitled");

  return (
    <li>
      <Link
        href={`/admin/blog/${post.id}`}
        className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-rose/5 focus-visible:-outline-offset-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
      >
        <span className="relative row-span-2 aspect-[4/3] overflow-hidden rounded-lg bg-sage/10 sm:row-span-1">
          {picture ? (
            <NextImage src={picture} unoptimized={!canOptimise(picture)} alt="" fill sizes="72px" className="object-cover" />
          ) : (
            <FileText className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-sage-deep/60" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate font-serif text-lg leading-snug", post.title_ro.trim() ? "text-charcoal" : "italic text-charcoal-light")}>
            {title}
          </span>
          {post.subtitle_ro && <span className="block truncate text-sm text-charcoal-light">{post.subtitle_ro}</span>}
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal-light sm:col-start-3 sm:flex-col sm:items-end">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 font-medium", STATUS_STYLE[status])}>
              {t(`admin.blog_list.status_${status}`)}
            </span>
            {post.draft_updated_at && (
              <span className="rounded-full bg-rose/10 px-2 py-0.5 font-medium text-rose-deep">
                {t("admin.blog_list.unpublished_changes")}
              </span>
            )}
          </span>
          <span>{t("admin.blog_list.edited").replace("{time}", relative(editedAt(post), locale))}</span>
        </span>
      </Link>
    </li>
  );
}

export default function AdminBlogPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md: keep boundaries
  // around the component that needs one).
  return (
    <Suspense>
      <PostList />
    </Suspense>
  );
}
