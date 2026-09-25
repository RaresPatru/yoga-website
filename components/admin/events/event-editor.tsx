"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Info, Loader2, Lock } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { adminErrorKey, toAdminError } from "@/lib/admin/db";
import {
  createEvent,
  deleteEvent,
  discardEventDraft,
  endsBeforeStart,
  eventFieldsOf,
  eventPublishProblem,
  eventSlugInUse,
  loadEvent,
  participantsHref,
  publishEventChanges,
  publishNewEvent,
  saveEventDraft,
  setShowInArchive,
  updateEvent,
  type EventFields,
  type EventOverview,
  type EventRow,
  type EventStatus,
  type ParticipantFilter,
} from "@/lib/admin/events";
import { slugify } from "@/lib/admin/blog";
import { isSlugTaken, useAutosave } from "@/lib/admin/use-autosave";
import { TranslationFailed, translateBlocks, translateTexts } from "@/lib/admin/translate";
import { countSentence } from "@/lib/admin/plural";
import { translateDocument } from "@/lib/translate-document";
import { toEditorContent } from "@/lib/blog-editor";
import { CURRENCIES, CURRENCY_SYMBOLS, DEFAULT_CURRENCY } from "@/lib/money";
import { getAuthToken } from "@/lib/get-auth-token";
import { canOptimise } from "@/lib/image-src";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { MediaLibrary } from "@/components/admin/media-library";
import { WhatsappLinkField } from "@/components/admin/whatsapp-link-field";
import { RichTextEditor, useBlogEditor } from "@/components/admin/rich-text-editor";
import { EditorBar } from "@/components/admin/blog/editor-bar";
import { PreviewDialog } from "@/components/admin/blog/preview-dialog";

/*
 * The event editor, in the same frame as the post editor: its own address
 * (/admin/events/new, /admin/events/<id>), the same bar, the same autosave
 * (lib/admin/use-autosave.ts) and the same lifecycle. While an event has never
 * been published every save writes to it; once it is live, saves are private
 * changes until "Publică modificările", and visitors keep seeing what was
 * published.
 *
 * Differences from a post:
 * - A new event is saved once it has a title and a date: an event row cannot
 *   exist without a date, and inventing one would put a false date in the
 *   list.
 * - Once a live event has ended, its date, times, price and places lock: they
 *   are what people booked and paid for. publish_event_draft() enforces it;
 *   the fields here only say so.
 * - Publishing can open seats, so it offers them to the waiting list, and
 *   says how many people were written to.
 */

/** A short random ending for the address of an event that has no title yet. */
function placeholderSlug() {
  return `eveniment-${Math.random().toString(36).slice(2, 8)}`;
}
const PLACEHOLDER_SLUG = /^eveniment-[a-z0-9]{6}$/;

/** The form as she types it: numbers stay text until they are saved. */
interface Form {
  slug: string;
  title_ro: string;
  title_en: string;
  date: string;
  time: string;
  end_date: string;
  end_time: string;
  location: string;
  map_link: string;
  price: string;
  currency: string;
  capacity: string;
  image_url: string;
  whatsapp: string;
}

function formOf(f: EventFields): Form {
  return {
    slug: f.slug,
    title_ro: f.title_ro,
    title_en: f.title_en ?? "",
    date: f.date,
    time: f.time ?? "",
    end_date: f.end_date ?? "",
    end_time: f.end_time ?? "",
    location: f.location ?? "",
    map_link: f.map_link ?? "",
    price: String(f.price ?? 0),
    currency: f.currency || DEFAULT_CURRENCY,
    capacity: f.max_participants === null ? "" : String(f.max_participants),
    image_url: f.image_url ?? "",
    whatsapp: f.whatsapp_group_link ?? "",
  };
}

/**
 * The form as it would be stored. Blank is NULL ("not announced yet"). The
 * price floors at zero; a blank capacity stays NULL and zero stays zero,
 * because both mean sold out (20260918000000_capacity_is_required.sql).
 */
function fieldsOfForm(form: Form, descriptionRo: string | null, descriptionEn: string | null): EventFields {
  const capacity = form.capacity.trim();
  return {
    slug: form.slug,
    title_ro: form.title_ro,
    title_en: form.title_en || null,
    description_ro: descriptionRo,
    description_en: descriptionEn,
    date: form.date,
    time: form.time || null,
    end_date: form.end_date || null,
    end_time: form.end_time || null,
    location: form.location || null,
    map_link: form.map_link.trim() || null,
    price: Math.max(0, Math.trunc(Number(form.price) || 0)),
    currency: form.currency,
    max_participants: capacity === "" ? null : Math.max(0, Math.trunc(Number(capacity) || 0)),
    image_url: form.image_url || null,
    whatsapp_group_link: form.whatsapp || null,
  };
}

/** An editor's content as stored: null when nothing is written in it. */
function htmlOf(editor: Editor | null): string | null {
  return editor && !editor.isEmpty ? editor.getHTML() : null;
}

function Section({
  id,
  title,
  children,
  bare = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  /** No inner padding, for the description's editor, which draws its own. */
  bare?: boolean;
}) {
  return (
    // No overflow-hidden: it would stop the description's toolbar sticking.
    <section aria-labelledby={id} className={cn("rounded-2xl border border-sage/25 bg-warm-white", !bare && "p-5 sm:p-6")}>
      <h2 id={id} className={cn("font-serif text-lg text-charcoal", bare ? "px-5 pb-4 pt-5 sm:px-6 sm:pt-6" : "mb-4")}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const STATUS_STYLE: Record<EventStatus, string> = {
  draft: "bg-charcoal/5 text-charcoal-light",
  upcoming: "bg-success/10 text-success",
  ongoing: "bg-sage/20 text-sage-deep",
  ended_pending: "bg-warning/10 text-warning",
  archived: "bg-charcoal/5 text-charcoal-light",
};

const NUMBERS: { filter: ParticipantFilter; column: keyof EventOverview }[] = [
  { filter: "waitlist", column: "waiting" },
  { filter: "pending", column: "pending_payments" },
  { filter: "refund_requested", column: "refund_requested" },
  { filter: "offers", column: "offers_open" },
  { filter: "refunded", column: "refunded" },
];

export function EventEditor({
  initial,
}: {
  /** The event, its private changes and its numbers; null for a new event. */
  initial: { event: EventRow; draft: Partial<EventFields> | null; overview: EventOverview | null } | null;
}) {
  const { t, locale } = useAdminLocale();
  const lang: "ro" | "en" = locale === "en" ? "en" : "ro";
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const ids = useId();

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const serverFields: EventFields = useMemo(() => {
    if (!initial) {
      return eventFieldsOf({ slug: placeholderSlug(), price: 0, currency: DEFAULT_CURRENCY });
    }
    return eventFieldsOf({ ...initial.event, ...(initial.draft ?? {}) });
    // Read once: the editor owns the fields from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<Form>(() => formOf(serverFields));
  const [published, setPublished] = useState(initial?.event.published ?? false);
  const [endsAt, setEndsAt] = useState(initial?.event.ends_at ?? null);
  const [showInArchive, setShowInArchiveState] = useState(initial?.event.show_in_archive ?? true);
  const [publishedSlug, setPublishedSlug] = useState(initial?.event.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(
    () =>
      Boolean(initial?.event.published) ||
      (Boolean(initial) && !PLACEHOLDER_SLUG.test(serverFields.slug) && serverFields.slug !== slugify(serverFields.title_ro))
  );
  const [mode, setMode] = useState<"ro" | "en">("ro");
  const [spell, setSpell] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [barHeight, setBarHeight] = useState(56);
  // When the editor opened: whether the event has ended is read against this,
  // so the fields do not lock or unlock under her hands mid-render.
  const [openedAt] = useState(() => Date.now());

  const placeholder = useRef(PLACEHOLDER_SLUG.test(serverFields.slug) ? serverFields.slug : placeholderSlug());
  const barRef = useRef<HTMLDivElement>(null);
  const englishRef = useRef<HTMLDivElement>(null);
  const roLabelId = `${ids}-ro`;
  const enLabelId = `${ids}-en`;

  const changedRef = useRef<() => void>(() => {});
  const roEditor = useBlogEditor({
    content: serverFields.description_ro ?? "",
    lang: "ro-RO",
    spellcheck: spell,
    labelId: roLabelId,
    onChange: () => changedRef.current(),
  });
  const enEditor = useBlogEditor({
    content: toEditorContent(serverFields.description_en),
    lang: "en",
    spellcheck: spell,
    labelId: enLabelId,
    onChange: () => changedRef.current(),
  });

  /** Everything as it stands in the editor right now. */
  const snapshot = (): EventFields => fieldsOfForm(form, htmlOf(roEditor), htmlOf(enEditor));

  const isBlank = (f: EventFields) =>
    !f.title_ro.trim() && !f.title_en?.trim() && !f.description_ro && !f.description_en && !f.location && !f.image_url;

  /** Set once the event exists: leaving before then loses it whole, and the question says so. */
  const createdId = useRef<string | null>(initial?.event.id ?? null);
  const confirmLeave = async () =>
    (
      await confirm({
        title: t("admin.cms.leave_title"),
        body: t(createdId.current ? "admin.blog_editor.leave_body" : "admin.event_editor.leave_new"),
        confirmLabel: t("admin.cms.leave_confirm"),
        cancelLabel: t("admin.cms.leave_cancel"),
        tone: "danger",
      })
    ).confirmed;

  const autosave = useAutosave<EventFields>({
    backupPrefix: "event-editor",
    initialId: initial?.event.id ?? null,
    initialSaved: serverFields,
    initialHasDraft: Boolean(initial?.draft),
    snapshot,
    isPublished: () => published,
    slugIsAuto: () => !slugTouched,
    canCreate: (f) => Boolean(f.title_ro.trim() && f.date),
    isBlank,
    // An end before its start is not sent: the database would refuse the whole
    // save, and the field already says what is wrong. The rest keeps saving.
    prepare: (f, saved) =>
      endsBeforeStart(f)
        ? { ...f, date: saved.date || f.date, time: saved.time, end_date: saved.end_date, end_time: saved.end_time }
        : f,
    create: (f) => createEvent(f, showInArchive),
    update: updateEvent,
    saveDraft: saveEventDraft,
    slugInUse: eventSlugInUse,
    // The address becomes the event's own, without reloading the page.
    onCreated: (id) => {
      createdId.current = id;
      window.history.replaceState(null, "", `/admin/events/${id}`);
    },
    onSlugNumbered: (slug) => setForm((f) => ({ ...f, slug })),
    slugTakenMessage: t("admin.event_editor.slug_taken"),
    confirmLeave,
    t,
  });
  const eventId = autosave.id;
  const { dirty, hasDraft, slugError } = autosave;
  useEffect(() => {
    changedRef.current = autosave.changed;
  });

  useDocumentTitle(t(eventId ? "admin.event_editor.edit_title" : "admin.event_editor.new_title"));

  /** Updates one field and schedules a save. */
  const setField = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // The address follows the title until she sets it herself or the event
      // goes live, after which shared links depend on it.
      if (key === "title_ro" && !slugTouched && !published) {
        next.slug = slugify(String(value)) || placeholder.current;
      }
      return next;
    });
    autosave.changed();
  };

  const restoreBackup = () => {
    const found = autosave.backup;
    if (!found) return;
    setForm(formOf(found.fields));
    roEditor?.commands.setContent(found.fields.description_ro ?? "", { emitUpdate: false });
    enEditor?.commands.setContent(toEditorContent(found.fields.description_en), { emitUpdate: false });
    autosave.dismissBackup(false);
    autosave.changed();
  };

  // The description's toolbar sticks under the bar, whose height changes as it wraps.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  const back = async () => {
    if (!published && isBlank(snapshot())) {
      // Nothing was written: leave nothing behind.
      await autosave.settleDown();
      const id = autosave.currentId();
      if (id) {
        try {
          await deleteEvent(id);
        } catch (error) {
          toast.error(t(adminErrorKey(toAdminError(error))));
          return;
        }
      }
      autosave.forgetBackup();
      router.push("/admin/events");
      return;
    }
    if ((await autosave.flush()) || (await confirmLeave())) router.push("/admin/events");
  };

  /**
   * Offers any seats that are free to the waiting list. Asked after every
   * publish: the route counts the seats itself, so a publish that opened none
   * emails nobody, and one that did emails the front of the queue, in order.
   */
  const offerSeats = async (id: string) => {
    try {
      const response = await fetch("/api/admin/events/notify-waiting-list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getAuthToken()}` },
        body: JSON.stringify({ eventId: id }),
      });
      const { notified } = await response.json();
      // Email went out in her name: she is told how many.
      if (notified > 0) toast.info(t("admin.waiting_list_notified").replace("{count}", String(notified)));
    } catch (error) {
      // Not a failed publish: the event is published. Publishing again retries.
      console.error("Waiting list notification failed:", error);
    }
  };

  const problemField: Record<string, () => void> = {
    need_title: () => document.getElementById(`${ids}-title`)?.focus(),
    need_slug: () => document.getElementById(`${ids}-slug`)?.focus(),
    need_date: () => document.getElementById(`${ids}-date`)?.focus(),
    need_end: () => document.getElementById(`${ids}-end-date`)?.focus(),
  };

  const publish = async () => {
    const now = snapshot();
    const problem = eventPublishProblem(now);
    if (problem) {
      setMode("ro");
      toast.error(problem === "need_end" ? t("admin.end_before_start") : t(`admin.event_editor.${problem}`));
      window.setTimeout(() => problemField[problem]?.(), 0);
      return;
    }
    setPublishing(true);
    try {
      if (!(await autosave.flush())) return;
      const id = autosave.currentId()!;
      const row = published ? await publishEventChanges(id) : await publishNewEvent(id, now);
      autosave.acknowledge(eventFieldsOf(row), false);
      setForm(formOf(eventFieldsOf(row)));
      setPublished(true);
      setSlugTouched(true);
      setPublishedSlug(row.slug);
      setEndsAt(row.ends_at);
      toast.success(
        t(published ? "admin.event_editor.changes_published_toast" : "admin.event_editor.published_toast"),
        { label: t("admin.event_editor.view_event"), href: `/ro/events/${row.slug}`, external: true }
      );
      await offerSeats(id);
    } catch (error) {
      const e = toAdminError(error);
      toast.error(isSlugTaken(e) ? t("admin.event_editor.slug_taken") : t(adminErrorKey(e)));
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    const { confirmed } = await confirm({
      title: t("admin.blog_editor.discard_title"),
      body: t("admin.event_editor.discard_body"),
      confirmLabel: t("admin.blog_editor.discard_confirm"),
      tone: "danger",
    });
    if (!confirmed || !eventId) return;
    await autosave.settleDown();
    try {
      await discardEventDraft(eventId);
      const fresh = await loadEvent(eventId);
      if (!fresh) return;
      const clean = eventFieldsOf(fresh.event);
      setForm(formOf(clean));
      roEditor?.commands.setContent(clean.description_ro ?? "", { emitUpdate: false });
      enEditor?.commands.setContent(toEditorContent(clean.description_en), { emitUpdate: false });
      autosave.acknowledge(clean, false);
      toast.success(t("admin.blog_editor.discarded"));
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const remove = async () => {
    const booked = initial?.overview?.taken ?? 0;
    const { confirmed } = await confirm({
      title: t("admin.confirm_delete_event"),
      body:
        (form.title_ro || t("admin.events_list.untitled")) +
        (booked > 0 ? `\n\n${t("admin.event_editor.delete_with_bookings").replace("{count}", String(booked))}` : ""),
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    await autosave.settleDown();
    try {
      if (eventId) await deleteEvent(eventId);
      autosave.forgetBackup();
      toast.success(t("admin.toast.deleted"));
      router.push("/admin/events");
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const toggleArchive = async (next: boolean) => {
    setShowInArchiveState(next);
    if (!eventId) return;
    try {
      await setShowInArchive(eventId, next);
    } catch (error) {
      setShowInArchiveState(!next);
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const openPreview = async () => {
    await autosave.flush();
    setPreviewVersion((v) => v + 1);
    setPreviewOpen(true);
  };

  /** Fills the English title and description where they are empty and the Romanian is not. */
  const translateMissing = async () => {
    if (!roEditor || !enEditor) return;
    setTranslating(true);
    try {
      if (form.title_ro.trim() && !form.title_en.trim()) {
        const [title] = await translateTexts([form.title_ro.trim()]);
        setForm((f) => ({ ...f, title_en: title }));
      }
      if (!roEditor.isEmpty && enEditor.isEmpty) {
        const translated = await translateDocument(roEditor, translateBlocks);
        if (!enEditor.isDestroyed) enEditor.commands.setContent(translated, { emitUpdate: false });
      }
      autosave.changed();
    } catch (error) {
      toast.error(
        error instanceof TranslationFailed && error.reason === "too_long"
          ? t("admin.editor.translate_too_long")
          : t("admin.translate_error")
      );
    } finally {
      setTranslating(false);
    }
  };

  /** A fresh translation of the Romanian description, asked about first when there is English already. */
  const retranslate = async () => {
    if (!roEditor || !enEditor || roEditor.isEmpty) return;
    if (!enEditor.isEmpty) {
      const { confirmed } = await confirm({
        title: t("admin.editor.translate_replace_title"),
        body: t("admin.editor.translate_replace"),
        confirmLabel: t("admin.editor.translate_replace_confirm"),
      });
      if (!confirmed) return;
    }
    setRetranslating(true);
    enEditor.setEditable(false);
    try {
      const translated = await translateDocument(roEditor, translateBlocks);
      if (enEditor.isDestroyed) return;
      enEditor.commands.setContent(translated);
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      englishRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    } catch (error) {
      toast.error(
        error instanceof TranslationFailed && error.reason === "too_long"
          ? t("admin.editor.translate_too_long")
          : t("admin.translate_error")
      );
    } finally {
      if (!enEditor.isDestroyed) enEditor.setEditable(true);
      setRetranslating(false);
    }
  };

  // ---------------------------------------------------------------------
  // What the screen shows
  // ---------------------------------------------------------------------

  const en = mode === "en";
  const english = (() => {
    const pairs: [string, string][] = [
      [form.title_ro, form.title_en],
      [roEditor?.isEmpty ? "" : "x", enEditor?.isEmpty ? "" : "x"],
    ];
    const withRomanian = pairs.filter(([ro]) => ro.trim());
    return { total: withRomanian.length, filled: withRomanian.filter(([, e]) => e.trim()).length };
  })();

  // Locked once a live event has ended: what people booked and paid for.
  const locked = published && endsAt !== null && Date.parse(endsAt) <= openedAt;
  const endError = endsBeforeStart(fieldsOfForm(form, null, null)) ? t("admin.end_before_start") : undefined;
  const stickyTop = "calc(var(--admin-header-h) + var(--editor-bar-h))";
  const publishState = !published ? "publish" : hasDraft || dirty ? "publish_changes" : "published";
  const overview = initial?.overview ?? null;
  const status = (overview?.status as EventStatus | undefined) ?? (published ? "upcoming" : "draft");
  const inputClass =
    "w-full rounded-xl border border-sage/30 bg-white px-3 py-2.5 text-base text-charcoal placeholder:text-charcoal-light/50 disabled:cursor-not-allowed disabled:bg-sage/5 disabled:text-charcoal-light sm:text-sm";

  return (
    <div
      style={{ "--bar-measured": `${barHeight}px` } as React.CSSProperties}
      className="[--editor-bar-h:0px] sm:[--editor-bar-h:var(--bar-measured)]"
    >
      <EditorBar
        ref={barRef}
        onBack={() => void back()}
        back={{ href: "/admin/events", label: t("admin.event_editor.back") }}
        newStatus={t("admin.event_editor.status_new")}
        deleteLabel={t("admin.event_editor.delete")}
        save={autosave.save}
        saveError={autosave.saveError}
        mode={mode}
        onMode={setMode}
        english={english}
        onTranslateMissing={() => void translateMissing()}
        translating={translating}
        canTranslate={english.filled < english.total}
        onPreview={() => void openPreview()}
        canPreview={Boolean(eventId)}
        publish={publishState}
        publishing={publishing}
        onPublish={() => void publish()}
        canDiscard={published && (hasDraft || dirty)}
        onDiscard={() => void discard()}
        canDelete={Boolean(eventId)}
        onDelete={() => void remove()}
      />

      {autosave.backup && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-charcoal">
            <strong className="font-medium">{t("admin.blog_editor.restore_title")}.</strong> {t("admin.blog_editor.restore_body")}
          </p>
          <button type="button" onClick={restoreBackup} className="rounded-full bg-charcoal px-4 py-2 text-cream">
            {t("admin.blog_editor.restore")}
          </button>
          <button
            type="button"
            onClick={() => autosave.dismissBackup(true)}
            className="rounded-full px-3 py-2 text-charcoal-light hover:bg-sage/15"
          >
            {t("admin.blog_editor.restore_drop")}
          </button>
        </div>
      )}

      {locked && (
        <p className="mb-5 flex items-start gap-2 rounded-2xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-charcoal">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-sage-deep" aria-hidden="true" />
          {t("admin.event_editor.locked")}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-6">
          <Section id={`${ids}-basics`} title={t("admin.event_editor.basics")}>
            {en && form.title_ro.trim() && (
              <p className="mb-1.5 text-sm text-charcoal-light">
                {t("admin.blog_editor.in_romanian").replace("{text}", form.title_ro)}
              </p>
            )}
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-title`} className="text-sm font-medium text-charcoal-light">
                {t("admin.blog_editor.title")} ({en ? "EN" : "RO"})
              </label>
              <input
                id={`${ids}-title`}
                lang={en ? "en" : "ro"}
                spellCheck={spell}
                value={en ? form.title_en : form.title_ro}
                onChange={(e) => setField(en ? "title_en" : "title_ro", e.target.value)}
                placeholder={en ? form.title_ro || t("admin.event_editor.title_placeholder") : t("admin.event_editor.title_placeholder")}
                className={cn(inputClass, "font-serif text-xl sm:text-xl")}
              />
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label htmlFor={`${ids}-slug`} className="text-sm font-medium text-charcoal-light">
                  {t("admin.event_editor.slug")}
                </label>
                <button
                  type="button"
                  aria-label={t("admin.event_editor.slug_what")}
                  aria-describedby={`${ids}-slug-help`}
                  data-tooltip={t("admin.event_editor.slug_help")}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <span id={`${ids}-slug-help`} hidden>
                  {t("admin.event_editor.slug_help")}
                </span>
              </div>
              <div
                className={cn(
                  "flex items-center rounded-xl border bg-white px-3 focus-within:border-rose-deep/60",
                  slugError ? "border-error" : "border-sage/30"
                )}
              >
                <span className="shrink-0 text-sm text-charcoal-light/70" aria-hidden="true">
                  /events/
                </span>
                <input
                  id={`${ids}-slug`}
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    autosave.clearSlugError();
                    setField("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"));
                  }}
                  onBlur={() => {
                    if (!form.slug.trim()) {
                      setSlugTouched(false);
                      setField("slug", slugify(form.title_ro) || placeholder.current);
                    }
                  }}
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={slugError ? `${ids}-slug-error` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent py-2.5 pl-0.5 text-base text-charcoal focus:outline-none sm:text-sm"
                />
              </div>
              {slugError && (
                <p id={`${ids}-slug-error`} role="alert" className="text-sm text-error">
                  {slugError}
                </p>
              )}
              {published && publishedSlug && form.slug !== publishedSlug && !slugError && (
                <p className="text-xs text-charcoal-light">
                  /events/{publishedSlug} → /events/{form.slug}
                </p>
              )}
            </div>
          </Section>

          {/*
            Start and end as two pairs rather than four equal boxes, so the
            grouping is visible before anything is read. Only the start date is
            required: she books a venue months ahead, and the fields she cannot
            answer yet stay empty rather than inventing an hour.
          */}
          <Section id={`${ids}-when`} title={t("admin.event_editor.when")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id={`${ids}-date`}
                label={t("admin.date")}
                type="date"
                required
                disabled={locked}
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
              />
              <Input
                label={t("admin.time")}
                type="time"
                disabled={locked}
                value={form.time}
                onChange={(e) => setField("time", e.target.value)}
                hint={t("admin.time_hint")}
              />
              <Input
                id={`${ids}-end-date`}
                label={t("admin.end_date")}
                type="date"
                disabled={locked}
                min={form.date || undefined}
                value={form.end_date}
                onChange={(e) => setField("end_date", e.target.value)}
                error={endError}
                hint={t("admin.end_date_hint")}
              />
              <Input
                label={t("admin.end_time")}
                type="time"
                disabled={locked}
                value={form.end_time}
                onChange={(e) => setField("end_time", e.target.value)}
                hint={t("admin.end_time_hint")}
              />
            </div>
          </Section>

          <Section id={`${ids}-where`} title={t("admin.event_editor.where")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t("admin.location")} value={form.location} onChange={(e) => setField("location", e.target.value)} />
              <Input
                label={t("admin.map_link")}
                value={form.map_link}
                onChange={(e) => setField("map_link", e.target.value)}
                inputMode="url"
                placeholder="https://maps.app.goo.gl/..."
                hint={t("admin.map_link_hint")}
              />
            </div>
          </Section>

          <Section id={`${ids}-price`} title={t("admin.event_editor.price_places")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Price and its currency read as one field, so they sit in one box. */}
              <div className="space-y-1.5">
                <label htmlFor={`${ids}-price-input`} className="text-sm font-medium text-charcoal-light">
                  {t("admin.price")}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`${ids}-price-input`}
                    type="number"
                    // The browser's own guard rails: the spinner will not go
                    // below zero. The rule is the database's CHECK.
                    min={0}
                    step={1}
                    inputMode="numeric"
                    disabled={locked}
                    value={form.price}
                    onChange={(e) => setField("price", e.target.value)}
                    className={cn(inputClass, "min-w-0 flex-1")}
                  />
                  <select
                    value={form.currency}
                    disabled={locked}
                    onChange={(e) => setField("currency", e.target.value)}
                    aria-label={t("admin.currency")}
                    className="w-24 shrink-0 rounded-xl border border-sage/30 bg-white px-2 py-2.5 text-sm text-charcoal disabled:bg-sage/5"
                  >
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>
                        {code} {CURRENCY_SYMBOLS[code]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* How many can book on the website, the only place anyone
                  books. Blank or 0 closes booking and leaves the waiting list;
                  raising it and publishing offers the new seats to the queue. */}
              <Input
                label={t("admin.max_participants")}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={locked}
                hint={t("admin.max_participants_hint")}
                value={form.capacity}
                onChange={(e) => setField("capacity", e.target.value)}
              />
            </div>
          </Section>

          <Section id={`${ids}-photo`} title={t("admin.event_editor.photo")}>
            <PhotoField
              url={form.image_url}
              onPick={() => setPhotoOpen(true)}
              onRemove={() => setField("image_url", "")}
            />
          </Section>

          <Section id={`${ids}-description`} title={t("admin.event_editor.description")} bare>
            <div hidden={en}>
              <RichTextEditor
                editor={roEditor}
                label={t("admin.description_ro")}
                labelId={roLabelId}
                stickyTop={stickyTop}
                spellcheck={{ on: spell, onToggle: () => setSpell((s) => !s), romanian: true }}
              />
            </div>
            <div hidden={!en} ref={englishRef}>
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 sm:px-6">
                <details className="min-w-0 flex-1 text-sm text-charcoal-light">
                  <summary className="cursor-pointer select-none py-1 font-medium text-charcoal">
                    {t("admin.blog_editor.romanian_text")}
                  </summary>
                  <div
                    className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-sage/20 bg-cream/60 px-4 py-2 [&_p]:my-2"
                    // The Romanian editor's own output, shown only to her, for reference.
                    dangerouslySetInnerHTML={{ __html: roEditor?.getHTML() ?? "" }}
                  />
                </details>
                <button
                  type="button"
                  onClick={() => void retranslate()}
                  disabled={retranslating || !roEditor || roEditor.isEmpty}
                  className="flex h-10 items-center gap-1.5 rounded-full border border-sage/30 bg-white px-4 text-sm text-charcoal-light hover:border-rose/40 hover:text-rose-deep disabled:opacity-50"
                >
                  {retranslating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  {retranslating ? t("admin.translating") : t("admin.blog_editor.retranslate")}
                </button>
              </div>
              <RichTextEditor
                editor={enEditor}
                label={t("admin.description_en")}
                labelId={enLabelId}
                stickyTop={stickyTop}
                busy={retranslating}
                spellcheck={{ on: spell, onToggle: () => setSpell((s) => !s), romanian: false }}
              />
            </div>
          </Section>

          <Section id={`${ids}-whatsapp`} title={t("admin.event_editor.whatsapp")}>
            <WhatsappLinkField value={form.whatsapp} onChange={(url) => setField("whatsapp", url)} />
          </Section>
        </div>

        <aside
          aria-labelledby={`${ids}-state`}
          className="space-y-5 rounded-2xl border border-sage/25 bg-warm-white p-5 lg:sticky"
          style={{ top: `calc(${stickyTop} + 1rem)` }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={`${ids}-state`} className="font-serif text-lg text-charcoal">
              {t("admin.event_editor.state")}
            </h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
              {t(`admin.events_list.status_${status}`)}
            </span>
          </div>

          {eventId && overview && (
            <div>
              <p className="text-sm text-charcoal">
                {overview.capacity
                  ? t("admin.events_list.seats")
                      .replace("{taken}", String(overview.taken ?? 0))
                      .replace("{capacity}", String(overview.capacity))
                  : t("admin.events_list.seats_closed").replace("{taken}", String(overview.taken ?? 0))}
              </p>
              <ul className="mt-3 space-y-1" aria-label={t("admin.events_list.numbers")}>
                {NUMBERS.map((n) => {
                  const value = Number(overview[n.column] ?? 0);
                  return (
                    <li key={n.filter}>
                      <Link
                        href={participantsHref(eventId, n.filter)}
                        className={cn(
                          "flex min-h-9 items-center rounded-lg px-2 text-sm transition-colors hover:bg-rose/5",
                          value > 0 ? "text-charcoal" : "text-charcoal-light/70"
                        )}
                      >
                        {countSentence(t, lang, `admin.event_numbers.${n.filter}`, value)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link
                href={participantsHref(eventId)}
                className="mt-2 inline-block text-sm text-rose-deep underline underline-offset-2"
              >
                {t("admin.event_editor.all_participants")}
              </Link>
            </div>
          )}

          <div className="space-y-1.5 border-t border-sage/20 pt-4">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-medium text-charcoal">{t("admin.event_editor.archive")}</span>
              <input
                type="checkbox"
                role="switch"
                checked={showInArchive}
                onChange={(e) => void toggleArchive(e.target.checked)}
                aria-describedby={`${ids}-archive-hint`}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-6 w-11 shrink-0 rounded-full bg-sage/30 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-rose-deep peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep"
              />
            </label>
            <p id={`${ids}-archive-hint`} className="text-xs leading-relaxed text-charcoal-light">
              {t("admin.event_editor.archive_hint")}
            </p>
          </div>
        </aside>
      </div>

      <MediaLibrary
        open={photoOpen}
        filterType="image"
        onClose={() => setPhotoOpen(false)}
        onSelect={(url) => {
          setField("image_url", url);
          setPhotoOpen(false);
        }}
      />
      {eventId && (
        <PreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          path={`events/${eventId}`}
          version={previewVersion}
        />
      )}
    </div>
  );
}

/** The event's photograph, from the media library, shaped as the page shows it (16:9). */
function PhotoField({ url, onPick, onRemove }: { url: string; onPick: () => void; onRemove: () => void }) {
  const { t } = useAdminLocale();
  if (url) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-sage/10">
        <NextImage src={url} unoptimized={!canOptimise(url)} alt={t("admin.event_editor.photo")} fill sizes="(max-width: 1024px) 100vw, 40rem" className="object-cover" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button type="button" onClick={onPick} className="rounded-full bg-white/90 px-4 py-2 text-sm text-charcoal shadow hover:bg-white">
            {t("admin.event_editor.photo_change")}
          </button>
          <button type="button" onClick={onRemove} className="rounded-full bg-white/90 px-4 py-2 text-sm text-error shadow hover:bg-white">
            {t("admin.event_editor.photo_remove")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-sage/50 p-3">
      <button
        type="button"
        onClick={onPick}
        className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm text-charcoal shadow-sm ring-1 ring-sage/30 hover:ring-rose-deep/40"
      >
        <ImagePlus className="h-4 w-4 text-sage-deep" aria-hidden="true" />
        {t("admin.event_editor.photo_add")}
      </button>
      <p className="min-w-0 flex-1 text-xs text-charcoal-light">{t("admin.event_editor.photo_none")}</p>
    </div>
  );
}
