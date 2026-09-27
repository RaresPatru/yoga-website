"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, BadgeCheck, Check, Eye, EyeOff, Trash2 } from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import {
  approveTestimonial,
  deleteTestimonial,
  homeSelection,
  listTestimonials,
  moveOnHome,
  setHidden,
  setOnHome,
  setVideo,
  tabOf,
  type AdminTestimonial,
  type TestimonialTab,
} from "@/lib/admin/testimonials";
import { embedFromUrl } from "@/lib/embeds";
import { reviewHtml } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { Rating } from "@/components/ui/rating";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { eventDay, shortDay } from "@/components/admin/participants/status-chip";

/**
 * Testimonials, in three tabs:
 *
 *   De aprobat  New ones, from participants' personal links. Nothing is on the
 *               site until she approves it.
 *   Aprobate    On the site. The ones she picks for the home page come first,
 *               in her order, with arrows to move them.
 *   Ascunse     Taken off the site without being deleted.
 *
 * The dashboard's "Testimoniale" opens De aprobat (?tab=pending). Each card
 * shows who wrote it (their full name, and the name they chose to show), the
 * event, their rating, words and photo; she can attach a video link. The
 * words, rating and name are theirs, so none of those is editable.
 */

const TABS: readonly TestimonialTab[] = ["pending", "approved", "hidden"];

function Testimonials() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.testimonials"));
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const params = useSearchParams();
  const pathname = usePathname();
  const tab: TestimonialTab = (TABS as readonly string[]).includes(params.get("tab") ?? "")
    ? (params.get("tab") as TestimonialTab)
    : "pending";

  const { data: all = [], loading, error, reload } = useAdminData(listTestimonials);
  const counts = useMemo(() => {
    const c: Record<TestimonialTab, number> = { pending: 0, approved: 0, hidden: 0 };
    for (const item of all) c[tabOf(item)]++;
    return c;
  }, [all]);

  const home = homeSelection(all);
  const inTab = all.filter((item) => tabOf(item) === tab);
  const others = tab === "approved" ? inTab.filter((item) => !home.includes(item)) : inTab;

  const card = (item: AdminTestimonial) => (
    <TestimonialCard key={item.id} item={item} all={all} lang={lang} reload={reload} home={home} />
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={t("admin.testimonials")} />

      <nav aria-label={t("admin.reviews.tabs")} className="-mx-1 mb-6 overflow-x-auto px-1">
        <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
          {TABS.map((value) => (
            <li key={value}>
              <Link
                href={value === "pending" ? pathname : `${pathname}?tab=${value}`}
                aria-current={tab === value ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors",
                  tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                )}
              >
                {t(`admin.reviews.tab_${value}`)}
                <span className={cn("tabular-nums text-xs", tab === value ? "text-cream/75" : "text-charcoal-light/80")}>
                  {counts[value]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {loading && !all.length ? (
        <div className="flex justify-center py-10" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : inTab.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">
          {t(`admin.reviews.empty_${tab}`)}
        </p>
      ) : tab === "approved" ? (
        <div className="space-y-10">
          <section aria-labelledby="home-selection">
            <h2 id="home-selection" className="font-serif text-xl text-charcoal">
              {t("admin.reviews.home_title")}
            </h2>
            {home.length ? (
              <ol className="mt-4 space-y-4">{home.map((item) => <li key={item.id}>{card(item)}</li>)}</ol>
            ) : (
              <p className="mt-2 text-sm text-charcoal-light">{t("admin.reviews.home_hint")}</p>
            )}
          </section>
          {others.length > 0 && (
            <section aria-labelledby="home-others">
              <h2 id="home-others" className="font-serif text-xl text-charcoal">
                {t("admin.reviews.others_title")}
              </h2>
              <ul className="mt-4 space-y-4">{others.map((item) => <li key={item.id}>{card(item)}</li>)}</ul>
            </section>
          )}
        </div>
      ) : (
        <ul className="space-y-4">{inTab.map((item) => <li key={item.id}>{card(item)}</li>)}</ul>
      )}
    </div>
  );
}

function TestimonialCard({
  item,
  all,
  home,
  lang,
  reload,
}: {
  item: AdminTestimonial;
  all: AdminTestimonial[];
  home: AdminTestimonial[];
  lang: "ro" | "en";
  reload: () => void;
}) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [video, setVideoInput] = useState(item.video_url ?? "");
  const [lastSaved, setLastSaved] = useState(item.video_url ?? "");
  if ((item.video_url ?? "") !== lastSaved) {
    setLastSaved(item.video_url ?? "");
    setVideoInput(item.video_url ?? "");
  }

  const name = item.author_name || "";
  const fullName = item.registrations?.full_name ?? name;
  const event = item.events
    ? { title: item.events.title_ro, date: item.events.date, id: item.events.id as string | null }
    : item.event_title_ro
      ? { title: item.event_title_ro, date: item.event_date ?? "", id: null }
      : null;
  const position = home.findIndex((h) => h.id === item.id);

  /** Runs one change, says so, and reloads the list; a failure says why. */
  const act = async (change: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await change();
      toast.success(done);
      reload();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setBusy(false);
    }
  };

  const saveVideo = () => {
    const value = video.trim();
    if (value && "refused" in embedFromUrl(value)) {
      toast.error(t("admin.reviews.video_error"));
      return;
    }
    const url = value ? (value.startsWith("http") ? value : `https://${value}`) : null;
    void act(() => setVideo(item.id, url), t(url ? "admin.reviews.video_saved" : "admin.reviews.video_removed"));
  };

  const remove = async () => {
    const { confirmed } = await confirm({
      title: t("admin.reviews.delete_title"),
      body: t("admin.reviews.delete_body"),
      confirmLabel: t("admin.reviews.delete"),
      tone: "danger",
    });
    if (confirmed) await act(() => deleteTestimonial(item), t("admin.reviews.deleted"));
  };

  const action =
    "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <article
      aria-label={fullName}
      className="rounded-2xl border border-sage/25 bg-warm-white p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        {item.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element -- the admin shows the stored file as it is
          <img
            src={item.photo_url}
            alt={t("admin.reviews.photo_alt").replace("{name}", fullName)}
            className="h-32 w-32 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="break-words font-serif text-xl text-charcoal">{fullName}</h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                item.source === "participant" ? "text-sage-deep" : "text-charcoal-light"
              )}
            >
              {item.source === "participant" && <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              {t(item.source === "participant" ? "admin.reviews.verified" : "admin.reviews.imported")}
            </span>
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-charcoal-light">
            {name && name !== fullName && <p>{t("admin.reviews.shown_as").replace("{name}", name)}</p>}
            {event && (
              <p>
                {event.id ? (
                  <Link href={`/admin/events/${event.id}`} className="underline decoration-sage/50 underline-offset-2 hover:text-rose-deep">
                    {t("admin.reviews.about").replace("{event}", event.title).replace("{date}", eventDay(event.date, lang))}
                  </Link>
                ) : (
                  t("admin.reviews.about").replace("{event}", event.title).replace("{date}", eventDay(event.date, lang))
                )}
              </p>
            )}
            <p>{t("admin.reviews.written").replace("{date}", shortDay(item.created_at, lang))}</p>
          </div>
          <Rating value={item.rating} locale={lang} className="mt-3" />
          <div
            className="mt-3 break-words text-charcoal [&_p+p]:mt-3"
            dangerouslySetInnerHTML={{ __html: reviewHtml(item.content) }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-sage/20 pt-4">
        <label className="min-w-0 flex-1 basis-64 text-sm text-charcoal-light">
          <span className="mb-1 block font-medium">{t("admin.reviews.video")}</span>
          <input
            type="url"
            inputMode="url"
            value={video}
            onChange={(e) => setVideoInput(e.target.value)}
            placeholder="https://"
            aria-describedby={`${item.id}-video-hint`}
            className="h-10 w-full rounded-full border border-sage/30 bg-white px-4 text-base text-charcoal sm:text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || video.trim() === (item.video_url ?? "")}
          onClick={saveVideo}
          className={cn(action, "border border-sage/30 bg-white text-charcoal hover:bg-sage/10")}
        >
          {t("admin.reviews.video_save")}
        </button>
        <p id={`${item.id}-video-hint`} className="basis-full text-xs text-charcoal-light">
          {t("admin.reviews.video_hint")}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!item.approved && !item.hidden && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => approveTestimonial(item.id), t("admin.reviews.approved_done"))}
            className={cn(action, "bg-rose-deep text-white hover:bg-rose-deeper")}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t("admin.reviews.approve")}
          </button>
        )}
        {item.approved && !item.hidden && (
          <label className={cn(action, "cursor-pointer text-charcoal hover:bg-sage/15")}>
            <input
              type="checkbox"
              role="switch"
              checked={item.on_home}
              disabled={busy}
              onChange={(e) => act(() => setOnHome(item.id, e.target.checked, all), t("admin.toast.saved"))}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="relative h-6 w-11 shrink-0 rounded-full bg-sage/30 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-rose-deep peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep"
            />
            {t("admin.reviews.on_home")}
          </label>
        )}
        {position >= 0 && (
          <>
            <button
              type="button"
              disabled={busy || position === 0}
              onClick={() => act(() => moveOnHome(item.id, -1, all), t("admin.toast.saved"))}
              aria-label={t("admin.reviews.move_up")}
              data-tooltip={t("admin.reviews.move_up")}
              className={cn(action, "w-10 justify-center px-0 text-charcoal hover:bg-sage/15")}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={busy || position === home.length - 1}
              onClick={() => act(() => moveOnHome(item.id, 1, all), t("admin.toast.saved"))}
              aria-label={t("admin.reviews.move_down")}
              data-tooltip={t("admin.reviews.move_down")}
              className={cn(action, "w-10 justify-center px-0 text-charcoal hover:bg-sage/15")}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(
              () => setHidden(item.id, !item.hidden),
              t(item.hidden ? "admin.reviews.shown_done" : "admin.reviews.hidden_done")
            )
          }
          className={cn(action, "text-charcoal hover:bg-sage/15")}
        >
          {item.hidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          {t(item.hidden ? "admin.reviews.show" : "admin.reviews.hide")}
        </button>
        <button type="button" disabled={busy} onClick={remove} className={cn(action, "ml-auto text-error hover:bg-error/10")}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("admin.reviews.delete")}
        </button>
      </div>
    </article>
  );
}

export default function AdminTestimonialsPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md).
  return (
    <Suspense>
      <Testimonials />
    </Suspense>
  );
}
