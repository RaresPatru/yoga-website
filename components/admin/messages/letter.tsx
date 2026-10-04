"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { Archive, ArchiveRestore, ChevronLeft, MailBadge, Reply, Star, Trash2, X } from "lucide-react";
import { adminErrorKey, type AdminError } from "@/lib/admin/db";
import { replyHref, type Message } from "@/lib/admin/messages";
import { buttonClasses } from "@/lib/button-styles";
import { cn } from "@/lib/utils";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useAdminSite } from "@/components/admin/shell/admin-site";
import { longMoment } from "@/components/admin/participants/status-chip";

/**
 * One message, read in full: the letter view of the Mesaje page.
 *
 * On a wide screen it is a pane beside the list (LetterPane); narrower, it
 * covers the screen as a modal <dialog> (LetterScreen), with an arrow back to
 * the list. Both draw the same letter: who wrote and when, the subject, their
 * words with their own line breaks, and "Răspunde prin email".
 */

export type LetterAction = "star" | "unstar" | "archive" | "inbox" | "unread" | "delete";

interface LetterState {
  /** Undefined while it loads, null when there is no such message. */
  message: Message | null | undefined;
  error: AdminError | null;
  busy: boolean;
  onAction: (action: LetterAction) => void;
  onClose: () => void;
}

const iconButton =
  "flex h-11 w-11 items-center justify-center rounded-full text-charcoal-light transition-colors hover:bg-sage/15 hover:text-charcoal disabled:opacity-50";

/** Star, archive, mark unread and delete: the letter's own actions. */
function LetterActions({ message, busy, onAction }: Pick<LetterState, "busy" | "onAction"> & { message: Message }) {
  const { t } = useAdminLocale();
  const archived = Boolean(message.archivedAt);
  return (
    <div role="group" aria-label={t("admin.inbox.actions")} className="flex items-center gap-0.5">
      {/*
        A toggle with a name that stays put and `aria-pressed` for its state,
        like the sidebar's; the tooltip says what pressing it will do.
      */}
      <button
        type="button"
        disabled={busy}
        aria-pressed={message.starred}
        aria-label={t("admin.inbox.star")}
        data-tooltip={t(message.starred ? "admin.inbox.unstar_hint" : "admin.inbox.star_hint")}
        onClick={() => onAction(message.starred ? "unstar" : "star")}
        className={iconButton}
      >
        <Star className={cn("h-5 w-5", message.starred && "fill-rose-deep text-rose-deep")} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={t(archived ? "admin.inbox.to_inbox" : "admin.inbox.archive")}
        data-tooltip={t(archived ? "admin.inbox.to_inbox" : "admin.inbox.archive")}
        onClick={() => onAction(archived ? "inbox" : "archive")}
        className={iconButton}
      >
        {archived ? <ArchiveRestore className="h-5 w-5" aria-hidden="true" /> : <Archive className="h-5 w-5" aria-hidden="true" />}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={t("admin.inbox.mark_unread")}
        data-tooltip={t("admin.inbox.mark_unread")}
        onClick={() => onAction("unread")}
        className={iconButton}
      >
        <MailBadge className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label={t("admin.inbox.delete")}
        data-tooltip={t("admin.inbox.delete")}
        onClick={() => onAction("delete")}
        className={cn(iconButton, "hover:bg-error/10 hover:text-error")}
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** A message's text as they wrote it: a blank line starts a paragraph, a single line break stays one. */
function Paragraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="max-w-[65ch] space-y-4 break-words text-base leading-relaxed text-charcoal">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

/** Who wrote, when, what about, what they said, and the way to answer. */
function LetterContent({ message, headingId, headingRef }: { message: Message; headingId: string; headingRef?: RefObject<HTMLHeadingElement | null> }) {
  const { t, locale } = useAdminLocale();
  const { siteName } = useAdminSite();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const subject = message.subject?.trim();

  return (
    <>
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 break-words font-serif text-2xl leading-snug text-charcoal focus:outline-none sm:text-[1.75rem]"
        >
          {message.name}
        </h2>
        <time dateTime={message.createdAt} className="shrink-0 text-sm text-charcoal-light">
          {longMoment(message.createdAt, lang)}
        </time>
      </header>
      <p className="mt-1 break-all text-sm text-charcoal-light">{message.email}</p>
      {message.locale === "en" && (
        <p className="mt-3 inline-flex rounded-full bg-sage/15 px-3 py-1 text-xs font-medium text-sage-deep">
          {t("admin.inbox.written_in_english")}
        </p>
      )}

      <div className="mt-6 border-t border-sage/25 pt-6">
        {subject && <p className="mb-4 break-words font-serif text-xl leading-snug text-charcoal">{subject}</p>}
        <Paragraphs text={message.message} />
      </div>

      <div className="mt-8">
        <a
          href={replyHref(message, siteName, longMoment(message.createdAt, message.locale))}
          className={buttonClasses({ size: "md", className: "gap-2" })}
        >
          <Reply className="h-4 w-4" aria-hidden="true" />
          {t("admin.inbox.reply")}
        </a>
        <p className="mt-2 text-xs text-charcoal-light">{t("admin.inbox.reply_hint")}</p>
      </div>
    </>
  );
}

function Loading() {
  const { t } = useAdminLocale();
  return (
    <div className="flex justify-center py-16" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      <span className="sr-only">{t("admin.loading")}</span>
    </div>
  );
}

/** What stands in for a letter that is loading, missing or failed to load. */
function LetterFallback({ message, error, headingId }: { message: Message | null | undefined; error: AdminError | null; headingId: string }): ReactNode {
  const { t } = useAdminLocale();
  if (error) {
    return (
      <p id={headingId} role="alert" className="py-8 text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (message === undefined) return <Loading />;
  return (
    <p id={headingId} className="py-8 text-charcoal-light">
      {t("admin.inbox.not_found")}
    </p>
  );
}

/**
 * The letter beside the list, on a wide screen. It sticks below the top bar
 * and scrolls on its own, so a long list scrolls past it without taking the
 * message she is reading out of view.
 */
export function LetterPane({
  message,
  error,
  busy,
  onAction,
  onClose,
  focusOnOpenRef,
}: LetterState & {
  /** Moves focus to the sender's name once it shows: she opened it from the list. */
  focusOnOpenRef: RefObject<boolean>;
}) {
  const { t } = useAdminLocale();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (message && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      headingRef.current?.focus();
    }
  }, [message, focusOnOpenRef]);

  return (
    <article
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onClose();
      }}
      className="admin-letter-pane rounded-2xl border border-sage/25 bg-warm-white"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-2xl border-b border-sage/20 bg-warm-white/95 px-3 py-1.5 backdrop-blur-md">
        {message ? <LetterActions message={message} busy={busy} onAction={onAction} /> : <span />}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("admin.inbox.close")}
          data-tooltip={t("admin.inbox.close")}
          data-tooltip-end
          className={iconButton}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 pb-8 pt-6 xl:px-8">
        {message ? (
          <LetterContent message={message} headingId={headingId} headingRef={headingRef} />
        ) : (
          <LetterFallback message={message} error={error} headingId={headingId} />
        )}
      </div>
    </article>
  );
}

/**
 * The letter over the whole screen, below the wide layout. A modal <dialog>:
 * the browser keeps focus inside it and closes it on Escape, and the arrow at
 * the top goes back to the list. Its address (?m=<id>) means the phone's own
 * back gesture closes it too.
 */
export function LetterScreen({ message, error, busy, onAction, onClose }: LetterState) {
  const { t } = useAdminLocale();
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Reading starts at the letter: focus goes to the sender's name once it
  // shows. Left to itself, the dialog focuses its first button, and a tap that
  // opened a message would find a ring drawn round the back arrow.
  useEffect(() => {
    if (!message || focused.current) return;
    focused.current = true;
    headingRef.current?.focus();
  }, [message]);

  return (
    <dialog ref={dialogRef} aria-labelledby={headingId} onClose={onClose} className="admin-letter">
      <div className="sticky top-0 z-10 border-b border-sage/20 bg-warm-white/95 px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="flex h-11 items-center gap-1 rounded-full pl-2 pr-3 text-sm font-medium text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            {t("admin.inbox.back")}
          </button>
          {message && <LetterActions message={message} busy={busy} onAction={onAction} />}
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-8">
        {message ? (
          <LetterContent message={message} headingId={headingId} headingRef={headingRef} />
        ) : (
          <LetterFallback message={message} error={error} headingId={headingId} />
        )}
      </div>
    </dialog>
  );
}
