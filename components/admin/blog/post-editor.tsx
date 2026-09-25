"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Info, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { AdminError, adminErrorKey, toAdminError } from "@/lib/admin/db";
import {
  createPost,
  deletePost,
  discardDraft,
  fieldsOf,
  changedFields,
  isBlank,
  isSlugTaken,
  loadPost,
  slugInUse,
  publishChanges,
  publishNew,
  publishProblem,
  saveDraft,
  setHidden as saveHidden,
  slugify,
  updatePost,
  type PostFields,
  type PostRow,
} from "@/lib/admin/blog";
import { useLeaveGuard } from "@/lib/admin/use-leave-guard";
import { getAuthToken } from "@/lib/get-auth-token";
import { translateTexts } from "@/lib/admin/translate";
import { translateDocument } from "@/lib/translate-document";
import { toEditorContent } from "@/lib/blog-editor";
import { cn } from "@/lib/utils";
import { canOptimise } from "@/lib/image-src";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { useToast } from "@/components/admin/ui/toaster";
import { useConfirm } from "@/components/admin/ui/confirm-dialog";
import { useDocumentTitle } from "@/components/admin/shell/admin-site";
import { MediaLibrary } from "@/components/admin/media-library";
import { RichTextEditor, useBlogEditor } from "@/components/admin/rich-text-editor";
import { EditorBar, type SaveState } from "./editor-bar";
import { PreviewDialog } from "./preview-dialog";

/*
 * AUTOSAVE, IN SHORT
 *
 * A save runs 1.5 seconds after she stops typing, at least every 10 seconds
 * while she keeps typing, when she switches to another tab or app, and before
 * Back, Preview and Publish. Until the server confirms a save, the latest
 * version is also kept in this browser (localStorage), and offered back the
 * next time the post is opened if it never arrived.
 *
 * Where a save goes depends on the post (lib/admin/blog.ts): straight onto a
 * post nobody can see yet, or into private changes on a published one.
 *
 * A new post is created by its first save with anything in it, so opening
 * "Articol nou" and leaving creates nothing. Back with every field still
 * empty deletes a post that was created and never published.
 */
const IDLE_MS = 1500;
const MAX_WAIT_MS = 10_000;

/** A short random ending for the address of a post that has no title yet. */
function placeholderSlug() {
  return `articol-${Math.random().toString(36).slice(2, 8)}`;
}
const PLACEHOLDER_SLUG = /^articol-[a-z0-9]{6}$/;

function backupKey(id: string | null) {
  return `blog-editor:${id ?? "new"}`;
}

interface Backup {
  fields: PostFields;
  at: number;
}

function readBackup(id: string | null): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(id));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(id: string | null, fields: PostFields) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ fields, at: Date.now() }));
  } catch {
    // Private browsing or a full disk: the server copy is what matters.
  }
}

function dropBackup(id: string | null) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {}
}

/** Why a translation failed, when it is something she can act on. */
class TranslationFailed extends Error {
  constructor(readonly reason: "too_long" | "failed") {
    super(`Translation failed: ${reason}`);
  }
}

/** One request for every paragraph of the post; see lib/translate-document.ts. */
async function translateBlocks(texts: string[]): Promise<string[]> {
  const token = await getAuthToken();
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ texts, from: "ro", to: "en" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TranslationFailed(data.code === "too_long" ? "too_long" : "failed");
  return data.translations;
}

/** An editor's content as stored: null when nothing is written in it. */
function htmlOf(editor: Editor | null): string | null {
  return editor && !editor.isEmpty ? editor.getHTML() : null;
}

/** A textarea that grows with what is typed, for the title and subtitle. */
function GrowingText({
  value,
  onChange,
  onEnter,
  className,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  className: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        // A title is one line: Enter moves on to the next field instead.
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter?.();
        }
      }}
      className={cn("block w-full resize-none overflow-hidden bg-transparent focus:outline-none", className)}
      {...rest}
    />
  );
}

export function PostEditor({
  initial,
  defaultAuthor,
}: {
  /** The post and its private changes; null for a new post. */
  initial: { post: PostRow; draft: Partial<PostFields> | null } | null;
  /** The blog's default author from Conținut site, pre-filled into a new post. */
  defaultAuthor: string;
}) {
  const { t } = useAdminLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const ids = useId();

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const serverFields: PostFields = useMemo(() => {
    if (!initial) {
      return {
        slug: placeholderSlug(),
        title_ro: "",
        title_en: null,
        subtitle_ro: null,
        subtitle_en: null,
        content_ro: null,
        content_en: null,
        cover_url: null,
        author: defaultAuthor || null,
      };
    }
    return { ...fieldsOf(initial.post), ...(initial.draft ?? {}) };
    // Read once: the editor owns the fields from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [postId, setPostId] = useState<string | null>(initial?.post.id ?? null);
  const [published, setPublished] = useState(initial?.post.published ?? false);
  const [hidden, setHiddenState] = useState(initial?.post.hidden ?? false);
  const [hasDraft, setHasDraft] = useState(Boolean(initial?.draft));
  const [publishedSlug, setPublishedSlug] = useState(initial?.post.slug ?? "");
  const [fields, setFields] = useState<Omit<PostFields, "content_ro" | "content_en">>(() => {
    const rest: Partial<PostFields> = { ...serverFields };
    delete rest.content_ro;
    delete rest.content_en;
    return rest as Omit<PostFields, "content_ro" | "content_en">;
  });
  const [slugTouched, setSlugTouched] = useState(
    () =>
      Boolean(initial?.post.published) ||
      (Boolean(initial) && !PLACEHOLDER_SLUG.test(serverFields.slug) && serverFields.slug !== slugify(serverFields.title_ro))
  );
  const [slugError, setSlugError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>(initial ? "saved" : "new");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ro" | "en">("ro");
  const [spell, setSpell] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [retranslating, setRetranslating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [barHeight, setBarHeight] = useState(56);

  /** The version the server holds, to compare against and to send differences from. */
  const saved = useRef<PostFields>(serverFields);
  const placeholder = useRef(PLACEHOLDER_SLUG.test(serverFields.slug) ? serverFields.slug : placeholderSlug());
  const idle = useRef<number | undefined>(undefined);
  const maxWait = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  /** An address she typed that another post has: kept on screen, never sent. */
  const refusedSlug = useRef<string | null>(null);
  const withoutRefusedSlug = (fields: PostFields): PostFields =>
    fields.slug === refusedSlug.current ? { ...fields, slug: saved.current.slug } : fields;
  const barRef = useRef<HTMLDivElement>(null);
  const englishRef = useRef<HTMLDivElement>(null);
  // flush and schedule call each other; each reaches the other through a ref.
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const scheduleRef = useRef<() => void>(() => {});

  // Refs the save reads, so an old closure never saves stale settings.
  const postIdRef = useRef(postId);
  const publishedRef = useRef(published);
  const hiddenRef = useRef(hidden);
  const slugTouchedRef = useRef(slugTouched);
  useEffect(() => {
    postIdRef.current = postId;
    publishedRef.current = published;
    hiddenRef.current = hidden;
    slugTouchedRef.current = slugTouched;
  });


  useDocumentTitle(t(postId ? "admin.blog_editor.edit_title" : "admin.blog_editor.new_title"));

  const roLabelId = `${ids}-ro`;
  const enLabelId = `${ids}-en`;

  // Changes flow in through `changed()`, which every field and both editors
  // call. It is a ref so the editors, created once, always call the latest.
  const changedRef = useRef<() => void>(() => {});
  const roEditor = useBlogEditor({
    content: serverFields.content_ro ?? "",
    lang: "ro-RO",
    spellcheck: spell,
    labelId: roLabelId,
    onChange: () => changedRef.current(),
  });
  const enEditor = useBlogEditor({
    content: toEditorContent(serverFields.content_en),
    lang: "en",
    spellcheck: spell,
    labelId: enLabelId,
    onChange: () => changedRef.current(),
  });

  /** Everything as it stands in the editor right now. */
  const snapshot = useCallback(
    (): PostFields => ({ ...fields, content_ro: htmlOf(roEditor), content_en: htmlOf(enEditor) }),
    [fields, roEditor, enEditor]
  );
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  // ---------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------

  /** Saves what is on screen. Resolves true once the server has it. */
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(idle.current);
    window.clearTimeout(maxWait.current);
    idle.current = maxWait.current = undefined;
    // One save at a time; a change made during it is saved straight after.
    if (inFlight.current) {
      await inFlight.current;
    }

    const run = async (): Promise<boolean> => {
      const now = withoutRefusedSlug(snapshotRef.current());
      let id = postIdRef.current;
      if (!id && isBlank(now, placeholder.current)) return true;
      if (id && Object.keys(changedFields(saved.current, now)).length === 0) {
        setSave("saved");
        return true;
      }

      setSave("saving");
      writeBackup(id, now);
      try {
        let stored = now;
        const attempt = async (version: PostFields) => {
          if (!id) {
            const row = await createPost(version, hiddenRef.current);
            id = row.id;
            postIdRef.current = row.id;
            setPostId(row.id);
            dropBackup(null);
            // The address becomes the post's own, without reloading the page.
            window.history.replaceState(null, "", `/admin/blog/${row.id}`);
          } else if (publishedRef.current) {
            await saveDraft(id, version);
            setHasDraft(true);
          } else {
            await updatePost(id, changedFields(saved.current, version));
          }
        };

        try {
          // A live post's changes wait in content_drafts, where the unique
          // address cannot be checked by the database until publishing.
          if (id && publishedRef.current && now.slug !== saved.current.slug && (await slugInUse(now.slug, id))) {
            throw new AdminError("duplicate", "slug in use", "slug");
          }
          await attempt(now);
          setSlugError(null);
          refusedSlug.current = null;
        } catch (error) {
          if (!isSlugTaken(error)) throw error;
          if (!slugTouchedRef.current && !publishedRef.current) {
            // An address made from the title that another post already has:
            // add a number and carry on, as she never chose it.
            for (let n = 2; n < 20; n++) {
              const candidate = { ...now, slug: `${now.slug}-${n}`.slice(0, 90) };
              try {
                await attempt(candidate);
                stored = candidate;
                setFields((f) => ({ ...f, slug: candidate.slug }));
                break;
              } catch (retry) {
                if (!isSlugTaken(retry) || n === 19) throw retry;
              }
            }
          } else {
            // An address she typed: say so, and save everything else. The
            // address stays in the field, remembered as refused, so it does not
            // count as unsaved and is not sent again until she changes it.
            setSlugError(t("admin.blog_editor.slug_taken"));
            refusedSlug.current = now.slug;
            stored = { ...now, slug: saved.current.slug };
            await attempt(stored);
          }
        }

        saved.current = stored;
        dropBackup(id);
        const current = withoutRefusedSlug(snapshotRef.current());
        const stillDirty = Object.keys(changedFields(stored, current)).length > 0;
        setSave(stillDirty ? "unsaved" : "saved");
        setSaveError(null);
        if (stillDirty) scheduleRef.current();
        return !stillDirty;
      } catch (error) {
        setSave("failed");
        setSaveError(t(adminErrorKey(toAdminError(error))));
        // Try again after the usual pause; her work is in the browser.
        idle.current = window.setTimeout(() => void flushRef.current(), MAX_WAIT_MS);
        return false;
      }
    };

    const promise = run();
    inFlight.current = promise;
    try {
      return await promise;
    } finally {
      if (inFlight.current === promise) inFlight.current = null;
    }
  }, [t]);

  const schedule = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => void flush(), IDLE_MS);
    maxWait.current ??= window.setTimeout(() => void flush(), MAX_WAIT_MS);
  }, [flush]);
  useEffect(() => {
    flushRef.current = flush;
    scheduleRef.current = schedule;
  });

  const changed = useCallback(() => {
    setSave((s) => (s === "saving" ? s : "unsaved"));
    schedule();
  }, [schedule]);
  useEffect(() => {
    changedRef.current = changed;
  });

  /** Updates one field and schedules a save. */
  const setField = <K extends keyof typeof fields>(key: K, value: (typeof fields)[K]) => {
    setFields((f) => {
      const next = { ...f, [key]: value };
      // The address follows the title until she sets it herself or the post
      // goes live, after which shared links depend on it.
      if (key === "title_ro" && !slugTouchedRef.current && !publishedRef.current) {
        next.slug = slugify(String(value)) || placeholder.current;
      }
      return next;
    });
    changed();
  };

  // Nothing fires after the editor is gone. Leaving with unsaved work goes
  // through the leave guard below, which saves first.
  useEffect(
    () => () => {
      window.clearTimeout(idle.current);
      window.clearTimeout(maxWait.current);
    },
    []
  );

  // Leaving the tab or app saves; closing it with unsaved work asks.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  // Ctrl+S / ⌘S saves now, rather than opening the browser's "save page".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const dirty = save === "unsaved" || save === "saving" || save === "failed";
  useLeaveGuard(dirty, async () => {
    if (await flush()) return true;
    const { confirmed } = await confirm({
      title: t("admin.cms.leave_title"),
      body: t("admin.blog_editor.leave_body"),
      confirmLabel: t("admin.cms.leave_confirm"),
      cancelLabel: t("admin.cms.leave_cancel"),
      tone: "danger",
    });
    return confirmed;
  });

  // A copy in this browser that never reached the server is offered back.
  useEffect(() => {
    const found = readBackup(postIdRef.current);
    if (!found) return;
    const differs = Object.keys(changedFields(saved.current, found.fields)).length > 0;
    if (differs) setBackup(found);
    else dropBackup(postIdRef.current);
  }, []);

  const restoreBackup = () => {
    if (!backup) return;
    const { content_ro, content_en, ...rest } = backup.fields;
    setFields(rest);
    roEditor?.commands.setContent(content_ro ?? "", { emitUpdate: false });
    enEditor?.commands.setContent(toEditorContent(content_en), { emitUpdate: false });
    setBackup(null);
    changed();
  };

  // The toolbar sticks under this bar, whose height changes as it wraps.
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
    const now = snapshotRef.current();
    const id = postIdRef.current;
    if (!published && isBlank(now, placeholder.current)) {
      // Nothing was written: leave nothing behind.
      if (id) {
        try {
          await deletePost(id);
        } catch (error) {
          toast.error(t(adminErrorKey(toAdminError(error))));
          return;
        }
      }
      dropBackup(id);
      window.clearTimeout(idle.current);
      window.clearTimeout(maxWait.current);
      router.push("/admin/blog");
      return;
    }
    if (await flush()) {
      router.push("/admin/blog");
      return;
    }
    const { confirmed } = await confirm({
      title: t("admin.cms.leave_title"),
      body: t("admin.blog_editor.leave_body"),
      confirmLabel: t("admin.cms.leave_confirm"),
      cancelLabel: t("admin.cms.leave_cancel"),
      tone: "danger",
    });
    if (confirmed) router.push("/admin/blog");
  };

  const problemField: Record<string, () => void> = {
    need_title: () => document.getElementById(`${ids}-title`)?.focus(),
    need_slug: () => document.getElementById(`${ids}-slug`)?.focus(),
    need_content: () => roEditor?.commands.focus(),
  };

  const publish = async () => {
    const now = snapshotRef.current();
    const problem = publishProblem(now);
    if (problem) {
      setMode("ro");
      toast.error(t(`admin.blog_editor.${problem}`));
      window.setTimeout(() => problemField[problem]?.(), 0);
      return;
    }
    setPublishing(true);
    try {
      if (!(await flush())) return;
      const id = postIdRef.current!;
      const row = published ? await publishChanges(id) : await publishNew(id, now);
      saved.current = fieldsOf(row);
      setPublished(true);
      setHasDraft(false);
      setSlugTouched(true);
      setPublishedSlug(row.slug);
      setSave("saved");
      toast.success(t(published ? "admin.blog_editor.changes_published_toast" : "admin.blog_editor.published_toast"), {
        label: t("admin.blog_editor.view_article"),
        href: `/ro/blog/${row.slug}`,
        external: true,
      });
    } catch (error) {
      const e = toAdminError(error);
      toast.error(isSlugTaken(e) ? t("admin.blog_editor.slug_taken") : t(adminErrorKey(e)));
    } finally {
      setPublishing(false);
    }
  };

  const discard = async () => {
    const { confirmed } = await confirm({
      title: t("admin.blog_editor.discard_title"),
      body: t("admin.blog_editor.discard_body"),
      confirmLabel: t("admin.blog_editor.discard_confirm"),
      tone: "danger",
    });
    if (!confirmed || !postId) return;
    window.clearTimeout(idle.current);
    window.clearTimeout(maxWait.current);
    idle.current = maxWait.current = undefined;
    await inFlight.current;
    try {
      await discardDraft(postId);
      const fresh = await loadPost(postId);
      if (!fresh) return;
      const clean = fieldsOf(fresh.post);
      saved.current = clean;
      const { content_ro, content_en, ...rest } = clean;
      setFields(rest);
      roEditor?.commands.setContent(content_ro ?? "", { emitUpdate: false });
      enEditor?.commands.setContent(toEditorContent(content_en), { emitUpdate: false });
      setHasDraft(false);
      setSlugError(null);
      setSave("saved");
      dropBackup(postId);
      toast.success(t("admin.blog_editor.discarded"));
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const remove = async () => {
    const { confirmed } = await confirm({
      title: t("admin.confirm_delete_post"),
      body: fields.title_ro || t("admin.blog_list.untitled"),
      confirmLabel: t("admin.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    window.clearTimeout(idle.current);
    window.clearTimeout(maxWait.current);
    await inFlight.current;
    try {
      if (postId) await deletePost(postId);
      dropBackup(postId);
      toast.success(t("admin.toast.deleted"));
      router.push("/admin/blog");
    } catch (error) {
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const toggleHidden = async (next: boolean) => {
    setHiddenState(next);
    if (!postId) return;
    try {
      await saveHidden(postId, next);
    } catch (error) {
      setHiddenState(!next);
      toast.error(t(adminErrorKey(toAdminError(error))));
    }
  };

  const openPreview = async () => {
    await flush();
    setPreviewVersion((v) => v + 1);
    setPreviewOpen(true);
  };

  /** Fills every English field that is empty while its Romanian is not. */
  const translateMissing = async () => {
    if (!roEditor || !enEditor) return;
    setTranslating(true);
    try {
      const keys = (["title", "subtitle"] as const).filter(
        (k) => fields[`${k}_ro`]?.trim() && !fields[`${k}_en`]?.trim()
      );
      const texts = await translateTexts(keys.map((k) => fields[`${k}_ro`]!.trim()));
      setFields((f) => {
        const next = { ...f };
        keys.forEach((k, i) => (next[`${k}_en`] = texts[i]));
        return next;
      });
      if (!roEditor.isEmpty && enEditor.isEmpty) {
        const translated = await translateDocument(roEditor, translateBlocks);
        if (!enEditor.isDestroyed) enEditor.commands.setContent(translated, { emitUpdate: false });
      }
      changed();
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

  /**
   * Replaces the English text with a fresh translation of the Romanian,
   * keeping its formatting. English she corrected by hand is asked about
   * first, and the replacement is one step in the editor's history, so Undo
   * brings her version back.
   */
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
    // Typing into the English editor now would be overwritten in a moment.
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

  const english = (() => {
    const pairs: [string | null | undefined, string | null | undefined][] = [
      [fields.title_ro, fields.title_en],
      [fields.subtitle_ro, fields.subtitle_en],
      [roEditor?.isEmpty ? "" : "x", enEditor?.isEmpty ? "" : "x"],
    ];
    const withRomanian = pairs.filter(([ro]) => ro?.trim());
    return { total: withRomanian.length, filled: withRomanian.filter(([, en]) => en?.trim()).length };
  })();

  const firstImage = roEditor?.getHTML().match(/<img[^>]*\ssrc="([^"]+)"/)?.[1] ?? null;
  const en = mode === "en";
  // Under the admin top bar and, on a computer, this editor's own bar (on a
  // phone that bar does not stick; see EditorBar).
  const stickyTop = "calc(4rem + var(--editor-bar-h))";
  const publishState = !published ? "publish" : hasDraft || dirty ? "publish_changes" : "published";

  return (
    <div
      style={{ "--bar-measured": `${barHeight}px` } as React.CSSProperties}
      className="[--editor-bar-h:0px] sm:[--editor-bar-h:var(--bar-measured)]"
    >
      <EditorBar
        ref={barRef}
        onBack={() => void back()}
        save={save}
        saveError={saveError}
        mode={mode}
        onMode={setMode}
        english={english}
        onTranslateMissing={() => void translateMissing()}
        translating={translating}
        canTranslate={english.filled < english.total}
        onPreview={() => void openPreview()}
        canPreview={Boolean(postId)}
        publish={publishState}
        publishing={publishing}
        onPublish={() => void publish()}
        canDiscard={published && (hasDraft || dirty)}
        onDiscard={() => void discard()}
        canDelete={Boolean(postId)}
        onDelete={() => void remove()}
      />

      {backup && (
        <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 text-charcoal">
            <strong className="font-medium">{t("admin.blog_editor.restore_title")}.</strong>{" "}
            {t("admin.blog_editor.restore_body")}
          </p>
          <button type="button" onClick={restoreBackup} className="rounded-full bg-charcoal px-4 py-2 text-cream">
            {t("admin.blog_editor.restore")}
          </button>
          <button
            type="button"
            onClick={() => {
              dropBackup(postId);
              setBackup(null);
            }}
            className="rounded-full px-3 py-2 text-charcoal-light hover:bg-sage/15"
          >
            {t("admin.blog_editor.restore_drop")}
          </button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* The page she writes on, set like the published article. No
            overflow-hidden here: it would stop the toolbar sticking. */}
        <div className="min-w-0 rounded-2xl border border-sage/25 bg-warm-white shadow-[0_20px_40px_-28px_rgb(0_0_0/0.25)]">
          <div className="px-5 pt-5 sm:px-8 sm:pt-8">
            <CoverField
              cover={fields.cover_url}
              firstImage={firstImage}
              onPick={() => setCoverOpen(true)}
              onRemove={() => setField("cover_url", null)}
            />

            {en && fields.title_ro.trim() && (
              <p className="mt-6 text-sm text-charcoal-light">
                {t("admin.blog_editor.in_romanian").replace("{text}", fields.title_ro)}
              </p>
            )}
            <label htmlFor={`${ids}-title`} className="sr-only">
              {t("admin.blog_editor.title")} ({en ? "EN" : "RO"})
            </label>
            <GrowingText
              id={`${ids}-title`}
              lang={en ? "en" : "ro"}
              spellCheck={spell}
              value={(en ? fields.title_en : fields.title_ro) ?? ""}
              onChange={(v) => setField(en ? "title_en" : "title_ro", en ? v || null : v)}
              onEnter={() => document.getElementById(`${ids}-subtitle`)?.focus()}
              placeholder={en ? fields.title_ro || t("admin.blog_editor.title_placeholder") : t("admin.blog_editor.title_placeholder")}
              className={cn(
                "font-serif text-3xl leading-tight text-charcoal placeholder:text-charcoal-light/40 md:text-5xl md:leading-[1.1]",
                en && fields.title_ro.trim() ? "mt-1" : "mt-6"
              )}
            />

            {en && fields.subtitle_ro?.trim() && (
              <p className="mt-4 text-sm text-charcoal-light">
                {t("admin.blog_editor.in_romanian").replace("{text}", fields.subtitle_ro)}
              </p>
            )}
            <label htmlFor={`${ids}-subtitle`} className="sr-only">
              {t("admin.blog_editor.subtitle")} ({en ? "EN" : "RO"})
            </label>
            <GrowingText
              id={`${ids}-subtitle`}
              lang={en ? "en" : "ro"}
              spellCheck={spell}
              value={(en ? fields.subtitle_en : fields.subtitle_ro) ?? ""}
              onChange={(v) => setField(en ? "subtitle_en" : "subtitle_ro", v || null)}
              onEnter={() => (en ? enEditor : roEditor)?.commands.focus("start")}
              placeholder={
                en ? fields.subtitle_ro || t("admin.blog_editor.subtitle_placeholder") : t("admin.blog_editor.subtitle_placeholder")
              }
              className="mt-3 mb-6 text-lg leading-relaxed text-charcoal-light placeholder:text-charcoal-light/40 md:text-xl"
            />
          </div>

          <div hidden={en}>
            <RichTextEditor
              editor={roEditor}
              label={t("admin.content_ro")}
              labelId={roLabelId}
              stickyTop={stickyTop}
              spellcheck={{ on: spell, onToggle: () => setSpell((s) => !s), romanian: true }}
            />
          </div>
          <div hidden={!en} ref={englishRef}>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 sm:px-8">
              <details className="min-w-0 flex-1 text-sm text-charcoal-light">
                <summary className="cursor-pointer select-none py-1 font-medium text-charcoal">
                  {t("admin.blog_editor.romanian_text")}
                </summary>
                <div
                  className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-sage/20 bg-cream/60 px-4 py-2 [&_p]:my-2"
                  // The Romanian editor's own output: HTML it produced, shown
                  // here only to her, for reference.
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
              label={t("admin.content_en")}
              labelId={enLabelId}
              stickyTop={stickyTop}
              busy={retranslating}
              spellcheck={{ on: spell, onToggle: () => setSpell((s) => !s), romanian: false }}
            />
          </div>
        </div>

        <aside
          aria-labelledby={`${ids}-details`}
          className="space-y-5 rounded-2xl border border-sage/25 bg-warm-white p-5 lg:sticky"
          style={{ top: `calc(${stickyTop} + 1rem)` }}
        >
          <h2 id={`${ids}-details`} className="font-serif text-lg text-charcoal">
            {t("admin.blog_editor.details")}
          </h2>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <label htmlFor={`${ids}-slug`} className="text-sm font-medium text-charcoal-light">
                {t("admin.blog_editor.slug")}
              </label>
              <button
                type="button"
                aria-label={t("admin.blog_editor.slug_what")}
                aria-describedby={`${ids}-slug-help`}
                data-tooltip={t("admin.blog_editor.slug_help")}
                className="flex h-6 w-6 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span id={`${ids}-slug-help`} hidden>
                {t("admin.blog_editor.slug_help")}
              </span>
            </div>
            <div
              className={cn(
                "flex items-center rounded-xl border bg-white px-3 focus-within:border-rose-deep/60",
                slugError ? "border-error" : "border-sage/30"
              )}
            >
              <span className="shrink-0 text-sm text-charcoal-light/70" aria-hidden="true">
                /blog/
              </span>
              <input
                id={`${ids}-slug`}
                value={fields.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlugError(null);
                  setField("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"));
                }}
                onBlur={() => {
                  if (!fields.slug.trim()) {
                    setSlugTouched(false);
                    setField("slug", slugify(fields.title_ro) || placeholder.current);
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
            {published && publishedSlug && fields.slug !== publishedSlug && !slugError && (
              <p className="text-xs text-charcoal-light">/blog/{publishedSlug} →  /blog/{fields.slug}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${ids}-author`} className="text-sm font-medium text-charcoal-light">
              {t("admin.blog_editor.author")}
            </label>
            <input
              id={`${ids}-author`}
              value={fields.author ?? ""}
              onChange={(e) => setField("author", e.target.value || null)}
              placeholder={defaultAuthor}
              aria-describedby={`${ids}-author-hint`}
              className="w-full rounded-xl border border-sage/30 bg-white px-3 py-2.5 text-base text-charcoal placeholder:text-charcoal-light/50 sm:text-sm"
            />
            {!fields.author?.trim() && (
              <p id={`${ids}-author-hint`} className="text-xs text-charcoal-light">
                {defaultAuthor
                  ? t("admin.blog_editor.author_default").replace("{name}", defaultAuthor)
                  : t("admin.blog_editor.author_none")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm font-medium text-charcoal">{t("admin.blog_editor.hidden")}</span>
              <input
                type="checkbox"
                role="switch"
                checked={hidden}
                onChange={(e) => void toggleHidden(e.target.checked)}
                aria-describedby={`${ids}-hidden-hint`}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-6 w-11 shrink-0 rounded-full bg-sage/30 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-rose-deep peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep"
              />
            </label>
            <p id={`${ids}-hidden-hint`} className="text-xs leading-relaxed text-charcoal-light">
              {t("admin.blog_editor.hidden_hint")}
            </p>
          </div>
        </aside>
      </div>

      <MediaLibrary
        open={coverOpen}
        filterType="image"
        onClose={() => setCoverOpen(false)}
        onSelect={(url) => {
          setField("cover_url", url);
          setCoverOpen(false);
        }}
      />
      {postId && (
        <PreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          postId={postId}
          version={previewVersion}
        />
      )}
    </div>
  );
}

/**
 * The cover: the picture at the top of the article and on its card. Without
 * one the card uses the first picture in the text, and the field says so,
 * showing that picture faintly.
 */
function CoverField({
  cover,
  firstImage,
  onPick,
  onRemove,
}: {
  cover: string | null;
  firstImage: string | null;
  onPick: () => void;
  onRemove: () => void;
}) {
  const { t } = useAdminLocale();
  if (cover) {
    return (
      <div className="group relative aspect-[3/2] overflow-hidden rounded-2xl bg-sage/10">
        <NextImage src={cover} unoptimized={!canOptimise(cover)} alt={t("admin.blog_editor.cover")} fill sizes="(max-width: 1024px) 100vw, 48rem" className="object-cover" />
        <div className="absolute bottom-3 right-3 flex gap-2">
          <button type="button" onClick={onPick} className="rounded-full bg-white/90 px-4 py-2 text-sm text-charcoal shadow hover:bg-white">
            {t("admin.blog_editor.cover_change")}
          </button>
          <button type="button" onClick={onRemove} className="rounded-full bg-white/90 px-4 py-2 text-sm text-error shadow hover:bg-white">
            {t("admin.blog_editor.cover_remove")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-sage/50 p-3">
      {firstImage && (
        <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg opacity-70">
          <NextImage src={firstImage} unoptimized={!canOptimise(firstImage)} alt="" fill sizes="64px" className="object-cover" />
        </span>
      )}
      <button
        type="button"
        onClick={onPick}
        className="flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm text-charcoal shadow-sm ring-1 ring-sage/30 hover:ring-rose-deep/40"
      >
        <ImagePlus className="h-4 w-4 text-sage-deep" aria-hidden="true" />
        {t("admin.blog_editor.cover_add")}
      </button>
      <p className="min-w-0 flex-1 text-xs text-charcoal-light">
        {firstImage ? t("admin.blog_editor.cover_auto") : t("admin.blog_editor.cover_none")}
      </p>
    </div>
  );
}
