"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import type { Message } from "@/lib/admin/messages";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { longMoment, shortDay } from "@/components/admin/participants/status-chip";

const TIME_ZONE = "Europe/Bucharest";

/** A moment's calendar day in Bucharest, as YYYY-MM-DD. */
function dayOf(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

/**
 * When a message came, as short as is still clear: the hour today ("14:02"),
 * "ieri" / "yesterday", the day and month this year ("28 sept."), and the
 * year too before that.
 */
export function listDate(iso: string, lang: "ro" | "en", now = new Date()): string {
  const when = new Date(iso);
  const locale = lang === "en" ? "en-GB" : "ro-RO";
  const day = dayOf(when);
  if (day === dayOf(now)) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }).format(when);
  }
  if (day === dayOf(new Date(now.getTime() - 86_400_000))) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day");
  }
  if (day.slice(0, 4) === dayOf(now).slice(0, 4)) {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: TIME_ZONE }).format(when);
  }
  return shortDay(iso, lang);
}

/**
 * One message in the list: who wrote, when, the subject and the first words.
 * An unread one has a rose dot and its sender in bold. The sender's name is
 * a link stretched over the whole row, as on Registrations; the checkbox and
 * the star sit above it, so each does its own thing.
 */
export function MessageRow({
  message,
  lang,
  href,
  open,
  selected,
  inStarredTab,
  onSelect,
  onStar,
  onOpen,
}: {
  message: Message;
  lang: "ro" | "en";
  href: string;
  /** This is the message the letter shows. */
  open: boolean;
  selected: boolean;
  /** In Cu stea, an archived message says so: it lives in the archive. */
  inStarredTab: boolean;
  onSelect: (on: boolean) => void;
  onStar: () => void;
  onOpen: () => void;
}) {
  const { t } = useAdminLocale();
  const unread = !message.readAt;
  const subject = message.subject?.trim();
  const preview = message.message.replace(/\s+/g, " ").trim();
  // Named in full for a screen reader, since the same person may write twice.
  const who = `${message.name}, ${longMoment(message.createdAt, lang)}`;

  return (
    <li
      className={cn(
        "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 transition-colors has-[[data-row-link]:focus-visible]:outline-2 has-[[data-row-link]:focus-visible]:-outline-offset-2 has-[[data-row-link]:focus-visible]:outline-rose-deep",
        // One background each, since cn does not settle conflicting classes:
        // the open one is marked with a bar, a ticked one is tinted, and only
        // the rest light up under the pointer.
        open
          ? "bg-rose/10 shadow-[inset_3px_0_0_var(--color-rose-deep)]"
          : selected
            ? "bg-rose/5"
            : "has-[[data-row-link]:hover]:bg-rose/5"
      )}
    >
      <Checkbox
        className="relative z-10 mt-1"
        aria-label={t("admin.inbox.select").replace("{name}", who)}
        checked={selected}
        onChange={(e) => onSelect(e.target.checked)}
      />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {unread && <span className="h-2 w-2 shrink-0 -translate-y-px self-center rounded-full bg-rose-deep" aria-hidden="true" />}
          <Link
            href={href}
            scroll={false}
            data-row-link
            data-message-link={message.id}
            aria-current={open ? "true" : undefined}
            onClick={onOpen}
            className={cn(
              "min-w-0 flex-1 truncate font-serif text-[1.0625rem] leading-snug text-charcoal after:absolute after:inset-0 focus-visible:outline-none",
              unread && "font-semibold"
            )}
          >
            {unread && <span className="sr-only">{t("admin.inbox.unread_marker")}: </span>}
            {message.name}
            <span className="sr-only">, {subject || t("admin.inbox.no_subject")}, {longMoment(message.createdAt, lang)}</span>
          </Link>
          {message.locale === "en" && (
            <span className="shrink-0 rounded-full bg-sage/15 px-1.5 text-[0.6875rem] font-medium leading-5 text-sage-deep">
              <span aria-hidden="true">EN</span>
              <span className="sr-only">{t("admin.inbox.written_in_english")}</span>
            </span>
          )}
          <time dateTime={message.createdAt} className="shrink-0 text-xs tabular-nums text-charcoal-light">
            {listDate(message.createdAt, lang)}
          </time>
        </div>
        <p className={cn("mt-0.5 truncate text-sm", subject ? (unread ? "font-medium text-charcoal" : "text-charcoal") : "italic text-charcoal-light")}>
          {subject || t("admin.inbox.no_subject")}
        </p>
        <p className="mt-0.5 truncate text-sm text-charcoal-light">{preview}</p>
        {inStarredTab && message.archivedAt && (
          <p className="mt-1.5">
            <span className="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs text-charcoal-light">{t("admin.inbox.archived")}</span>
          </p>
        )}
      </div>
      <button
        type="button"
        aria-pressed={message.starred}
        aria-label={t("admin.inbox.star_row").replace("{name}", who)}
        onClick={onStar}
        className="relative z-10 -mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-full text-charcoal-light/60 transition-colors hover:bg-sage/15 hover:text-charcoal"
      >
        <Star className={cn("h-[1.125rem] w-[1.125rem]", message.starred && "fill-rose-deep text-rose-deep")} aria-hidden="true" />
      </button>
    </li>
  );
}
