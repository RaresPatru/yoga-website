"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Ellipsis,
  MailOpen,
  Search,
  Star,
  StarOff,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useSelection } from "@/lib/admin/use-selection";
import { countSentence } from "@/lib/admin/plural";
import {
  INBOX_TABS,
  PER_PAGE,
  allMatchingIds,
  changeMessages,
  deleteMessages,
  listMessages,
  loadMessage,
  markOpened,
  type InboxFilters,
  type InboxTab,
  type Message,
  type MessageChange,
} from "@/lib/admin/messages";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination } from "@/components/ui/pagination";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { PageHeader } from "@/components/admin/ui/page-header";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useToast } from "@/components/admin/ui/toaster";
import { SelectionBar, selectionButton } from "@/components/admin/ui/selection-bar";
import { LetterPane, LetterScreen, type LetterAction } from "@/components/admin/messages/letter";
import { MessageRow } from "@/components/admin/messages/message-row";

/**
 * What people wrote through the contact form: /admin/messages.
 *
 *   Primite  Everything not archived, newest first. New messages land here.
 *   Cu stea  The ones she starred to come back to, wherever they are.
 *   Arhivă   Put away, and kept until she deletes them.
 *
 * "Necitite" narrows any tab to the messages she has not opened, and the
 * dashboard's "mesaje necitite" opens Primite with it on (?filter=unread).
 * The search finds a name, an address, or words in the subject or the text,
 * with or without accents.
 *
 * The whole view is in the address (?tab=archive&filter=unread&q=retreat
 * &page=2), and ?m=<id> opens one message: beside the list from 1280px wide,
 * over the whole screen below that. Opening a message marks it read.
 *
 * She can tick messages, or everyone matching, and archive, star, mark or
 * delete them together from the bar at the bottom.
 */

const WIDE = "(min-width: 80rem)";

/** Whether the letter fits beside the list. False on the server, which cannot know. */
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false
  );
}

/** The bar's first action on each tab; the others are in its "Mai multe" menu. */
const FIRST: Record<InboxTab, MessageChange> = { inbox: "archive", starred: "unstar", archive: "inbox" };
const MORE: Record<InboxTab, MessageChange[]> = {
  inbox: ["read", "unread", "star", "unstar"],
  starred: ["read", "unread", "archive", "inbox"],
  archive: ["read", "unread", "star", "unstar"],
};
const CHANGE_ICON: Record<MessageChange, LucideIcon> = {
  archive: Archive,
  inbox: ArchiveRestore,
  star: Star,
  unstar: StarOff,
  read: MailOpen,
  unread: MailOpen,
};

/** What the letter's own actions say once done. Starring says nothing: the star shows it. */
const LETTER_DONE: Partial<Record<LetterAction, string>> = {
  archive: "admin.inbox.archived_one",
  inbox: "admin.inbox.inbox_one",
  unread: "admin.inbox.unread_one",
  delete: "admin.inbox.deleted_one",
};

function Inbox() {
  const { t, locale } = useAdminLocale();
  useDocumentTitle(t("admin.messages"));
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const wide = useWide();

  const tab: InboxTab = (INBOX_TABS as readonly string[]).includes(params.get("tab") ?? "")
    ? (params.get("tab") as InboxTab)
    : "inbox";
  const unreadOnly = params.get("filter") === "unread";
  const query = params.get("q") ?? "";
  const requestedPage = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const openId = params.get("m");

  /** This view's address with some settings changed. A new filter starts again at page 1. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const isDefault =
        value === null || value === "" || (key === "tab" && value === "inbox") || (key === "page" && value === "1");
      if (isDefault) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes) && !("m" in changes)) next.delete("page");
    const search = next.toString();
    return search ? `${pathname}?${search}` : pathname;
  };

  // The search answers a moment after she stops typing, replacing the address
  // rather than adding a history entry per letter.
  const [typed, setTyped] = useState(query);
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setTyped(query);
  }
  useEffect(() => {
    if (typed === query) return;
    const timer = window.setTimeout(() => router.replace(hrefWith({ q: typed.trim() || null }), { scroll: false }), 300);
    return () => window.clearTimeout(timer);
    // hrefWith reads the current params; re-running on them would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed]);

  const filters: InboxFilters = useMemo(() => ({ tab, unread: unreadOnly, q: query }), [tab, unreadOnly, query]);
  const listKey = `${tab}|${unreadOnly}|${query}`;
  const { data, setData, loading, error, reload } = useAdminData(
    () => listMessages(filters, requestedPage),
    `${listKey}|${requestedPage}`
  );
  const selection = useSelection(listKey);
  const [working, setWorking] = useState(false);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(requestedPage, pageCount);
  const pageIds = rows.map((r) => r.id);
  const pageSelected = pageIds.filter((id) => selection.ids.has(id)).length;
  const selectedCount = selection.allMatching ? total : selection.ids.size;

  // The open message: its own fresh copy, or the list's while that loads.
  const { data: opened, error: letterError, reload: reloadLetter } = useAdminData(
    async () => (openId ? { id: openId, message: await loadMessage(openId) } : null),
    openId ?? ""
  );
  const fresh = opened && opened.id === openId ? opened.message : undefined;
  const letter: Message | null | undefined = !openId
    ? null
    : fresh !== undefined
      ? fresh
      : rows.find((r) => r.id === openId);
  const [letterBusy, setLetterBusy] = useState(false);

  // Opening a message marks it read, and the list and the dashboard's count
  // follow. With "Necitite" on, it leaves the list then; the letter stays.
  const readNow = letter && !letter.readAt ? letter.id : null;
  useEffect(() => {
    if (!readNow) return;
    let current = true;
    markOpened(readNow).then(
      () => {
        if (!current) return;
        reloadLetter();
        reload();
      },
      (failure: unknown) => {
        if (current) toast.error(t(adminErrorKey(toAdminError(failure))));
      }
    );
    return () => {
      current = false;
    };
    // Once per message: the rest are stable or read at the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readNow]);

  // Focus follows the letter: to the sender's name when she opens one from
  // the list beside it (the full-screen letter moves focus itself), and, when
  // it closes, back to its row, or to the first row if an action took it off
  // the list. Only after the keyboard: that is where focus would otherwise
  // fall to the start of the page, and a tap has no use for a focus ring.
  const focusLetter = useRef(false);
  const returnFocusTo = useRef<string | null>(null);
  const usingKeyboard = useRef(false);
  useEffect(() => {
    const keyboard = () => {
      usingKeyboard.current = true;
    };
    const pointer = () => {
      usingKeyboard.current = false;
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  useEffect(() => {
    if (openId) {
      returnFocusTo.current = openId;
      return;
    }
    const id = returnFocusTo.current;
    returnFocusTo.current = null;
    if (!id || !usingKeyboard.current) return;
    const row =
      document.querySelector<HTMLElement>(`[data-message-link="${CSS.escape(id)}"]`) ??
      document.querySelector<HTMLElement>("[data-message-link]");
    row?.focus();
  }, [openId]);

  const closeLetter = () => router.replace(hrefWith({ m: null }), { scroll: false });

  const onLetterAction = async (action: LetterAction) => {
    if (!letter) return;
    if (action === "delete") {
      const { confirmed } = await confirm({
        title: t("admin.inbox.delete_one_title").replace("{name}", letter.name),
        body: t("admin.inbox.delete_one_body"),
        confirmLabel: t("admin.inbox.delete_forever"),
        tone: "danger",
      });
      if (!confirmed) return;
    }
    setLetterBusy(true);
    try {
      if (action === "delete") await deleteMessages([letter.id]);
      else await changeMessages([letter.id], action);
      const done = LETTER_DONE[action];
      if (done) toast.success(t(done));
      // Starring keeps it open. Anything else takes it out of the view she
      // was reading it in, or marks it for later: back to the list.
      if (action === "star" || action === "unstar") reloadLetter();
      else closeLetter();
      reload();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setLetterBusy(false);
    }
  };

  /** Stars or unstars one row, showing it at once and putting it back if the save fails. */
  const toggleStar = async (message: Message) => {
    const starred = !message.starred;
    setData((current) =>
      current && { ...current, rows: current.rows.map((r) => (r.id === message.id ? { ...r, starred } : r)) }
    );
    try {
      await changeMessages([message.id], starred ? "star" : "unstar");
      if (openId === message.id) reloadLetter();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      reload();
    }
  };

  /** Everything ticked: the rows, or every message that matched when the list was read. */
  const chosenIds = async (): Promise<string[]> => {
    if (!selection.allMatching) return [...selection.ids];
    return data?.asOf ? allMatchingIds(filters, data.asOf) : [];
  };

  const applyChange = async (change: MessageChange) => {
    setWorking(true);
    try {
      const ids = await chosenIds();
      const count = await changeMessages(ids, change);
      toast.success(t(`admin.inbox.done_${change}`).replace("{count}", String(count)));
      selection.clear();
      reload();
      if (openId && ids.includes(openId)) reloadLetter();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setWorking(false);
    }
  };

  const deleteChosen = async () => {
    const { confirmed } = await confirm({
      title: countSentence(t, lang, "admin.inbox.delete_title", selectedCount),
      body: t("admin.inbox.delete_body"),
      confirmLabel: t("admin.inbox.delete_forever"),
      tone: "danger",
    });
    if (!confirmed) return;
    setWorking(true);
    try {
      const ids = await chosenIds();
      const count = await deleteMessages(ids);
      toast.success(t("admin.inbox.deleted").replace("{count}", String(count)));
      selection.clear();
      if (openId && ids.includes(openId)) closeLetter();
      reload();
    } catch (failure) {
      toast.error(t(adminErrorKey(toAdminError(failure))));
    } finally {
      setWorking(false);
    }
  };

  const tabLabel = (value: InboxTab) => t(`admin.inbox.tab_${value}`);
  const searching = Boolean(query.trim());
  const empty = searching
    ? t("admin.inbox.empty_search").replace("{query}", query.trim())
    : unreadOnly
      ? t("admin.inbox.empty_unread")
      : t(`admin.inbox.empty_${tab}`);
  const FirstIcon = CHANGE_ICON[FIRST[tab]];
  const sideBySide = wide && (rows.length > 0 || Boolean(openId));

  return (
    <div className="pb-24">
      <PageHeader title={t("admin.messages")} />

      <div className="mb-5 flex flex-col gap-3">
        <nav aria-label={t("admin.inbox.tabs")} className="-mx-1 overflow-x-auto px-1">
          <ul className="flex w-max gap-1 rounded-full border border-sage/25 bg-warm-white p-1">
            {INBOX_TABS.map((value) => (
              <li key={value}>
                <Link
                  href={hrefWith({ tab: value, m: null })}
                  aria-current={tab === value ? "page" : undefined}
                  scroll={false}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-colors",
                    tab === value ? "bg-charcoal text-cream" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                  )}
                >
                  {tabLabel(value)}
                  <span className={cn("tabular-nums text-xs", tab === value ? "text-cream/75" : "text-charcoal-light/80")}>
                    {data?.counts[value] ?? "–"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <search className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("admin.inbox.search")}</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" aria-hidden="true" />
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={t("admin.inbox.search")}
              className="h-11 w-full rounded-full border border-sage/30 bg-white pl-10 pr-4 text-base text-charcoal placeholder:text-charcoal-light/60 sm:text-sm"
            />
          </label>
          {/*
            A toggle rather than a link: it narrows whatever tab she is on, and
            says how many unread messages that tab holds either way.
          */}
          <button
            type="button"
            aria-pressed={unreadOnly}
            onClick={() => router.replace(hrefWith({ filter: unreadOnly ? null : "unread" }), { scroll: false })}
            className={cn(
              "inline-flex h-11 w-max shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
              unreadOnly
                ? "border-rose-deep bg-rose-deep text-white hover:bg-rose-deeper"
                : "border-sage/30 bg-white text-charcoal hover:bg-sage/10"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", unreadOnly ? "bg-white" : "bg-rose-deep")} aria-hidden="true" />
            {t("admin.inbox.unread")}
            <span className={cn("tabular-nums text-xs", unreadOnly ? "text-white/80" : "text-charcoal-light")}>
              {data ? data.unread : "–"}
            </span>
          </button>
        </search>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-10" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
          <span className="sr-only">{t("admin.loading")}</span>
        </div>
      ) : error ? (
        <p role="alert" className="text-error">
          {t(adminErrorKey(error))}
        </p>
      ) : (
        <div className={cn(sideBySide && "grid grid-cols-[minmax(0,23rem)_minmax(0,1fr)] items-start gap-6")}>
          <div className="min-w-0">
            {rows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sage/40 px-6 py-10 text-center text-charcoal-light">
                <p>{empty}</p>
                {(searching || unreadOnly) && (
                  <Link
                    href={hrefWith({ q: null, filter: null })}
                    scroll={false}
                    className="mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-rose-deep hover:bg-rose/10"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" /> {t("admin.inbox.show_all")}
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-sage/25 bg-warm-white">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-sage/20 px-4 py-2.5 text-sm text-charcoal-light">
                  <Checkbox
                    label={t("admin.inbox.select_page")}
                    checked={pageSelected === pageIds.length}
                    indeterminate={pageSelected > 0 && pageSelected < pageIds.length}
                    onChange={(e) => selection.setMany(pageIds, e.target.checked)}
                  />
                  {pageSelected === pageIds.length && total > rows.length && (
                    <p className="text-sm">
                      {selection.allMatching ? (
                        t("admin.inbox.all_selected").replace("{count}", String(total))
                      ) : (
                        <>
                          {t("admin.inbox.all_on_page").replace("{count}", String(rows.length))}{" "}
                          <button
                            type="button"
                            onClick={() => selection.setAllMatching(true)}
                            className="font-medium text-rose-deep underline underline-offset-2"
                          >
                            {t("admin.inbox.select_all").replace("{count}", String(total))}
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>
                {/* role="list": Safari drops a list's semantics once its bullets are styled away. */}
                <ul role="list" aria-label={t("admin.inbox.list")} className="divide-y divide-sage/20">
                  {rows.map((message) => (
                    <MessageRow
                      key={message.id}
                      message={message}
                      lang={lang}
                      href={hrefWith({ m: message.id, page: page > 1 ? String(page) : null })}
                      open={message.id === openId}
                      selected={selection.allMatching || selection.ids.has(message.id)}
                      inStarredTab={tab === "starred"}
                      onSelect={(on) => selection.toggle(message.id, on)}
                      onStar={() => void toggleStar(message)}
                      onOpen={() => {
                        focusLetter.current = wide;
                      }}
                    />
                  ))}
                </ul>
              </div>
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

          {sideBySide &&
            (openId ? (
              <LetterPane
                key={openId}
                message={letter}
                error={fresh === undefined && !letter ? letterError : null}
                busy={letterBusy}
                onAction={(action) => void onLetterAction(action)}
                onClose={closeLetter}
                focusOnOpenRef={focusLetter}
              />
            ) : (
              <div className="admin-letter-pane flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-sage/40 px-6 py-16 text-center text-sm text-charcoal-light">
                {t("admin.inbox.pick")}
              </div>
            ))}
        </div>
      )}

      {!wide && openId && (
        <LetterScreen
          key={openId}
          message={letter}
          error={fresh === undefined && !letter ? letterError : null}
          busy={letterBusy}
          onAction={(action) => void onLetterAction(action)}
          onClose={closeLetter}
        />
      )}

      <SelectionBar count={selectedCount} countLabel={t("admin.inbox.selected")} onClear={selection.clear}>
        <button type="button" disabled={working} onClick={() => void applyChange(FIRST[tab])} className={selectionButton()}>
          <FirstIcon className="h-4 w-4" aria-hidden="true" />
          {t(`admin.inbox.bulk_${FIRST[tab]}`)}
        </button>
        <MenuButton
          label={t("admin.inbox.more")}
          side="top"
          items={MORE[tab].map((change) => ({
            id: change,
            label: t(`admin.inbox.bulk_${change}`),
            disabled: working,
            onSelect: () => void applyChange(change),
          }))}
          triggerClassName={selectionButton()}
          trigger={
            <>
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
              {t("admin.inbox.more")}
            </>
          }
        />
        <button type="button" disabled={working} onClick={() => void deleteChosen()} className={selectionButton(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t("admin.inbox.delete")}
        </button>
      </SelectionBar>
    </div>
  );
}

export default function AdminMessagesPage() {
  // useSearchParams needs a boundary of its own (CLAUDE.md).
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
