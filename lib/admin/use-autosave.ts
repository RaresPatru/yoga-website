"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminError, adminErrorKey, toAdminError } from "@/lib/admin/db";
import { useLeaveGuard } from "@/lib/admin/use-leave-guard";

/*
 * AUTOSAVE, FOR ANYTHING WITH AN ADDRESS AND A PUBLISH BUTTON
 *
 * Shared by the post editor and the event editor, which save the same way:
 *
 * - A save runs 1.5 seconds after she stops typing, at least every 10 seconds
 *   while she keeps typing, when she switches to another tab or app, on
 *   Ctrl+S, and whenever the editor asks (before Back, Preview and Publish).
 * - One save at a time. A change made during one is saved straight after.
 * - Until the server confirms a save, the latest version is also kept in this
 *   browser (localStorage), and offered back the next time the document is
 *   opened if it never arrived.
 * - A document that does not exist yet is created by the first save the
 *   editor says it may create from (a post with anything in it, an event with
 *   a title and a date).
 * - Where a save goes depends on the document: onto the row while nobody can
 *   see it, into its private changes (content_drafts) once it is live.
 * - The address (slug): one made from the title that another document has is
 *   numbered and saved; one she typed is refused on its own, stays on screen,
 *   and everything else keeps saving. A live document's private changes are
 *   checked by asking, because the unique constraint cannot see
 *   content_drafts.
 * - Leaving with work unsaved saves first, and asks only if that fails.
 */

export type SaveState = "new" | "saving" | "saved" | "unsaved" | "failed";

const IDLE_MS = 1500;
const MAX_WAIT_MS = 10_000;

/** Fields that differ between two versions: what a save has to send. */
export function changedFields<F extends object>(from: F, to: F): Partial<F> {
  const out: Partial<F> = {};
  for (const key of Object.keys(to) as (keyof F)[]) {
    if (from[key] !== to[key]) out[key] = to[key];
  }
  return out;
}

function differs<F extends object>(a: F, b: F): boolean {
  return Object.keys(changedFields(a, b)).length > 0;
}

/** The error a save failed with, if it was the address already being taken. */
export function isSlugTaken(error: unknown): boolean {
  const e = toAdminError(error);
  return e.kind === "duplicate" && e.field === "slug";
}

export interface AutosaveBackup<F> {
  fields: F;
  at: number;
}

export interface AutosaveOptions<F extends { slug: string }> {
  /** Names this kind of document in the browser's backup, such as "blog-editor". */
  backupPrefix: string;
  initialId: string | null;
  /** The version the server holds, its private changes included. */
  initialSaved: F;
  /** Whether the server already holds private changes for it. */
  initialHasDraft: boolean;
  /** The fields as they are on screen now. */
  snapshot: () => F;
  /** Whether the document is live, so saves go to its private changes. */
  isPublished: () => boolean;
  /** Whether the address is made from the title rather than typed by her. */
  slugIsAuto: () => boolean;
  /** For a document that does not exist yet: may this version create it? */
  canCreate: (fields: F) => boolean;
  /**
   * Whether nothing has been written yet. Only needed when `canCreate` asks
   * for more than "something written" (an event wants a title and a date):
   * then a version that cannot create the document yet, but is not blank,
   * counts as unsaved, so leaving asks first. Defaults to `!canCreate`.
   */
  isBlank?: (fields: F) => boolean;
  /** Leaves out what cannot be saved yet, such as an end before its start. */
  prepare?: (fields: F, saved: F) => F;
  /** Creates the document and answers its id. */
  create: (fields: F) => Promise<string>;
  /** Writes changes to a document nobody can see yet. */
  update: (id: string, changes: Partial<F>) => Promise<void>;
  /** Saves the whole edited version of a live document as its private changes. */
  saveDraft: (id: string, fields: F) => Promise<void>;
  slugInUse: (slug: string, exceptId: string) => Promise<boolean>;
  /** After the first save has created the document. */
  onCreated: (id: string) => void;
  /** An address made from the title was numbered because another document had it. */
  onSlugNumbered: (slug: string) => void;
  /** Said under the address when she typed one another document has. */
  slugTakenMessage: string;
  /** Asked when leaving and the last save failed. True to leave anyway. */
  confirmLeave: () => Promise<boolean>;
  t: (key: string) => string;
}

export function useAutosave<F extends { slug: string }>(options: AutosaveOptions<F>) {
  const [id, setId] = useState(options.initialId);
  const [save, setSave] = useState<SaveState>(options.initialId ? "saved" : "new");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(options.initialHasDraft);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [backup, setBackup] = useState<AutosaveBackup<F> | null>(null);

  /** The version the server holds, to compare against and to send differences from. */
  const saved = useRef<F>(options.initialSaved);
  const idRef = useRef(id);
  const idle = useRef<number | undefined>(undefined);
  const maxWait = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  /** An address she typed that another document has: kept on screen, never sent. */
  const refusedSlug = useRef<string | null>(null);
  // flush and schedule call each other; each reaches the other through a ref.
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const scheduleRef = useRef<() => void>(() => {});
  // The latest options, so a save started by a timer never uses stale ones.
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  const key = (docId: string | null) => `${opts.current.backupPrefix}:${docId ?? "new"}`;
  const writeBackup = (docId: string | null, fields: F) => {
    try {
      localStorage.setItem(key(docId), JSON.stringify({ fields, at: Date.now() }));
    } catch {
      // Private browsing or a full disk: the server copy is what matters.
    }
  };
  const dropBackup = useCallback((docId: string | null) => {
    try {
      localStorage.removeItem(`${opts.current.backupPrefix}:${docId ?? "new"}`);
    } catch {}
  }, []);

  /** What a save would send: the screen, minus what cannot be saved yet. */
  const toSave = (fields: F): F => {
    let out = fields;
    if (refusedSlug.current !== null && out.slug === refusedSlug.current) {
      out = { ...out, slug: saved.current.slug };
    }
    return opts.current.prepare ? opts.current.prepare(out, saved.current) : out;
  };

  const stopTimers = () => {
    window.clearTimeout(idle.current);
    window.clearTimeout(maxWait.current);
    idle.current = maxWait.current = undefined;
  };

  /** Saves what is on screen. Resolves true once the server has it. */
  const flush = useCallback(async (): Promise<boolean> => {
    stopTimers();
    // One save at a time; a change made during it is saved straight after.
    if (inFlight.current) await inFlight.current;

    const run = async (): Promise<boolean> => {
      const o = opts.current;
      const now = toSave(o.snapshot());
      let docId = idRef.current;
      if (!docId && !o.canCreate(now)) {
        // Nothing can be created from this yet: the bar says what it needs.
        setSave("new");
        return o.isBlank ? o.isBlank(now) : true;
      }
      if (docId && !differs(saved.current, now)) {
        setSave("saved");
        return true;
      }

      setSave("saving");
      writeBackup(docId, now);
      try {
        let stored = now;
        const attempt = async (version: F) => {
          if (!docId) {
            docId = await o.create(version);
            idRef.current = docId;
            setId(docId);
            dropBackup(null);
            o.onCreated(docId);
          } else if (o.isPublished()) {
            await o.saveDraft(docId, version);
            setHasDraft(true);
          } else {
            await o.update(docId, changedFields(saved.current, version));
          }
        };

        try {
          if (docId && o.isPublished() && now.slug !== saved.current.slug && (await o.slugInUse(now.slug, docId))) {
            throw new AdminError("duplicate", "slug in use", "slug");
          }
          await attempt(now);
          setSlugError(null);
          refusedSlug.current = null;
        } catch (error) {
          if (!isSlugTaken(error)) throw error;
          if (o.slugIsAuto() && !o.isPublished()) {
            // Made from the title, and another document has it: add a number
            // and carry on, as she never chose it.
            for (let n = 2; n < 20; n++) {
              const candidate = { ...now, slug: `${now.slug}-${n}`.slice(0, 90) };
              try {
                await attempt(candidate);
                stored = candidate;
                o.onSlugNumbered(candidate.slug);
                break;
              } catch (retry) {
                if (!isSlugTaken(retry) || n === 19) throw retry;
              }
            }
          } else {
            // Typed by her: say so, and save everything else.
            setSlugError(o.slugTakenMessage);
            refusedSlug.current = now.slug;
            stored = { ...now, slug: saved.current.slug };
            await attempt(stored);
          }
        }

        saved.current = stored;
        dropBackup(docId);
        const stillDirty = differs(stored, toSave(opts.current.snapshot()));
        setSave(stillDirty ? "unsaved" : "saved");
        setSaveError(null);
        if (stillDirty) scheduleRef.current();
        return !stillDirty;
      } catch (error) {
        setSave("failed");
        setSaveError(o.t(adminErrorKey(toAdminError(error))));
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
    // Everything it reads comes through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const schedule = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => void flushRef.current(), IDLE_MS);
    maxWait.current ??= window.setTimeout(() => void flushRef.current(), MAX_WAIT_MS);
  }, []);

  useEffect(() => {
    flushRef.current = flush;
    scheduleRef.current = schedule;
  });

  /** Something changed on screen: mark it and schedule a save. */
  const changed = useCallback(() => {
    setSave((s) => (s === "saving" ? s : "unsaved"));
    scheduleRef.current();
  }, []);

  /** Stops everything pending, and waits for a save already under way. */
  const settleDown = useCallback(async () => {
    stopTimers();
    await inFlight.current;
  }, []);

  /**
   * The server now holds exactly `fields` (after publishing, or discarding
   * the private changes): nothing is unsaved and nothing is refused.
   */
  const acknowledge = useCallback(
    (fields: F, draft: boolean) => {
      saved.current = fields;
      refusedSlug.current = null;
      setSlugError(null);
      setHasDraft(draft);
      setSave("saved");
      dropBackup(idRef.current);
    },
    [dropBackup]
  );

  // Nothing fires after the editor is gone. Leaving with unsaved work goes
  // through the leave guard below, which saves first.
  useEffect(() => () => stopTimers(), []);

  // Leaving the tab or app saves.
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
  useLeaveGuard(dirty, async () => (await flush()) || opts.current.confirmLeave());

  // A copy in this browser that never reached the server is offered back.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(idRef.current));
      if (!raw) return;
      const found = JSON.parse(raw) as AutosaveBackup<F>;
      if (differs(saved.current, found.fields)) setBackup(found);
      else dropBackup(idRef.current);
    } catch {
      // An unreadable backup is no backup.
    }
    // Once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    /** The document's id, once it exists. */
    id,
    /** Read the latest id inside a callback, where `id` may be a render old. */
    currentId: () => idRef.current,
    save,
    saveError,
    dirty,
    hasDraft,
    slugError,
    clearSlugError: () => setSlugError(null),
    /** The version the server holds. */
    saved,
    flush,
    changed,
    settleDown,
    acknowledge,
    /** A copy from this browser that never reached the server, if any. */
    backup,
    /** Takes the backup off the screen; drops it from the browser when asked. */
    dismissBackup: (forget: boolean) => {
      if (forget) dropBackup(idRef.current);
      setBackup(null);
    },
    /** Forgets the browser's copy, as when the document is deleted. */
    forgetBackup: () => dropBackup(idRef.current),
  };
}
