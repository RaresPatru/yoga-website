"use client";

import { Fragment, useId, useSyncExternalStore, type Ref } from "react";
import { Keyboard, X } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  ariaKeys,
  isApplePlatform,
  keyCaps,
  keyText,
  type KeyWords,
  type Shortcut,
  type ShortcutSample,
} from "@/lib/editor-shortcuts";
import { ARTICLE_TYPOGRAPHY } from "@/lib/article-typography";

/** Nothing here can change while the page is open, so there is nothing to
 *  subscribe to. Hoisted so React sees the same function every render. */
const noSubscription = () => () => {};

/**
 * Whether the editor's `Mod` key is ⌘ on this device — the test
 * prosemirror-keymap itself applies, so the labels cannot disagree with the
 * keys. False on the server; the editor is never server-rendered anyway.
 */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => isApplePlatform(navigator.platform),
    () => false
  );
}

function usePopoverSupport(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => "popover" in HTMLElement.prototype,
    () => false
  );
}

type Translate = (key: string) => string;

/**
 * The toolbar button that opens the list of shortcuts, and the list.
 *
 * WHY A POPOVER, WHEN THE PUBLIC SITE AVOIDS THEM
 *
 * The public pages refuse `popover` because `showPopover()` throws below
 * Safari 17, and a visitor arriving from Instagram may be on anything (see
 * the navigation drawer in app/globals.css). The admin has one reader on a
 * browser she keeps current, and this list needs exactly what the top layer
 * gives: it is often taller than the editor it belongs to, and has to sit
 * above everything else on the page without a z-index contest. The browser
 * also handles Escape, dismissing on a click elsewhere, and `aria-expanded`
 * on the button.
 *
 * Where there is no popover support the button is simply not drawn. Every
 * shortcut is still in the toolbar's tooltips.
 *
 * FOCUS
 *
 * Opened with the mouse, focus stays on the button and Tab goes into the
 * list, which is where the browser puts a popover in the tab order. Opened
 * with Ctrl+/ from the editor, focus stays in the editor, so she can keep
 * writing with the list open beside her; Escape closes it. Nothing inside
 * uses `autofocus`, which would pull her out of the sentence she was in.
 */
export function EditorShortcuts({
  triggerRef,
  triggerClassName,
}: {
  triggerRef?: Ref<HTMLButtonElement>;
  triggerClassName: string;
}) {
  const { t } = useAdminLocale();
  const apple = useApplePlatform();
  const supported = usePopoverSupport();
  const id = useId();

  if (!supported) return null;

  const panelId = `${id}-shortcuts`;
  const titleId = `${id}-shortcuts-title`;
  // `anchor-name` takes a dashed identifier, and useId's output is not one.
  const anchor = `--editor-shortcuts-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const words: KeyWords = { space: t("admin.editor.space") };
  const title = t("admin.editor.shortcuts");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={panelId}
        aria-label={title}
        aria-keyshortcuts={ariaKeys("Mod-/", apple)}
        data-tooltip={`${title} (${keyText("Mod-/", apple, words)})`}
        className={`editor-shortcuts-trigger ${triggerClassName}`}
        style={{ anchorName: anchor }}
      >
        <Keyboard className="h-4 w-4" aria-hidden="true" />
      </button>

      <div
        id={panelId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="editor-shortcuts"
        style={{ positionAnchor: anchor }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-sage/20 px-5 py-3">
          <h2 id={titleId} className="font-serif text-lg text-charcoal">
            {title}
          </h2>
          <button
            type="button"
            popoverTarget={panelId}
            popoverTargetAction="hide"
            aria-label={t("admin.close")}
            className="rounded-full p-1.5 text-charcoal-light transition-colors hover:bg-sage/10 hover:text-charcoal"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Focusable and named, so the list can be scrolled from the keyboard
            in Safari, which does not make scrolling boxes focusable itself. */}
        <div
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
          className="editor-shortcuts-body"
        >
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs text-charcoal-light">
                <th scope="col" className="pb-1 pr-3 font-medium sm:w-[44%]">
                  {t("admin.editor.col_result")}
                </th>
                <th scope="col" className="pb-1 pr-3 font-medium">
                  {t("admin.editor.col_type")}
                </th>
                <th scope="col" className="editor-shortcuts-keys pb-1 font-medium">
                  {t("admin.editor.col_press")}
                </th>
              </tr>
            </thead>
            {SHORTCUT_GROUPS.map((group) => {
              const rows = SHORTCUTS.filter((s) => s.group === group);
              // `data-keys-only` marks what a phone leaves out (globals.css).
              return (
                <tbody key={group} data-keys-only={rows.every((s) => !s.typed) || undefined}>
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={3}
                      className="pb-1 pt-4 text-xs font-medium text-sage-deep"
                    >
                      {t(`admin.editor.group_${group}`)}
                    </th>
                  </tr>
                  {rows.map((s) => (
                    <ShortcutRow key={s.id} shortcut={s} apple={apple} words={words} t={t} />
                  ))}
                </tbody>
              );
            })}
          </table>

          <UndoTip apple={apple} t={t} />
        </div>
      </div>
    </>
  );
}

function ShortcutRow({
  shortcut,
  apple,
  words,
  t,
}: {
  shortcut: Shortcut;
  apple: boolean;
  words: KeyWords;
  t: Translate;
}) {
  return (
    <tr className="border-t border-sage/15" data-keys-only={!shortcut.typed || undefined}>
      <th scope="row" className="py-2 pr-3 align-middle font-normal">
        {/*
          Drawn with the article's own typography (lib/article-typography.ts),
          which the editing area and the public page share, so each row shows
          the result at the size and weight it will really have. Only the
          margins are taken away.
        */}
        <div className={`${ARTICLE_TYPOGRAPHY} prose-headings:my-0 prose-p:my-0 prose-blockquote:my-0 prose-ul:my-0 prose-ol:my-0 prose-li:my-0 prose-hr:mb-0 prose-hr:mt-1.5`}>
          <Sample kind={shortcut.sample} label={t(`admin.editor.${shortcut.id}`)} />
        </div>
        {shortcut.hint && (
          <p className="mt-1 text-xs leading-snug text-charcoal-light">
            {t(`admin.editor.${shortcut.id}_hint`)}
          </p>
        )}
      </th>
      <td className="py-2 pr-3 align-middle">
        {shortcut.typed && (
          // One line, joined by "+": "##" above "Spațiu" read as two separate
          // things, and side by side without the "+" as a choice of either.
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <kbd className="editor-typed">{shortcut.typed.text}</kbd>
            {shortcut.typed.then === "Space" && (
              <>
                <span className="text-xs text-charcoal-light">+</span>
                <kbd className="editor-keycap">{words.space}</kbd>
              </>
            )}
          </span>
        )}
      </td>
      <td className="editor-shortcuts-keys py-2 align-middle">
        {shortcut.keys && (
          <Keys combos={shortcut.keys} apple={apple} words={words} or={t("admin.editor.or")} />
        )}
      </td>
    </tr>
  );
}

/**
 * The result, in the markup the editor would produce.
 *
 * Headings and lists carry `role="presentation"`: they are specimens, and a
 * screen reader user listing the page's headings should not find "Titlu 1"
 * among them. Their words are still read.
 */
function Sample({ kind, label }: { kind: ShortcutSample; label: string }) {
  switch (kind) {
    case "h1":
      return <h1 role="presentation">{label}</h1>;
    case "h2":
      return <h2 role="presentation">{label}</h2>;
    case "h3":
      return <h3 role="presentation">{label}</h3>;
    case "strong":
      return <p><strong>{label}</strong></p>;
    case "em":
      return <p><em>{label}</em></p>;
    case "s":
      return <p><s>{label}</s></p>;
    case "u":
      return <p><u>{label}</u></p>;
    case "code":
      return <p><code>{label}</code></p>;
    case "link":
      // No href: it looks like a link and is not one, so it is neither
      // focusable nor announced as a link.
      return <p><a>{label}</a></p>;
    case "ul":
      return <ul role="presentation"><li>{label}</li></ul>;
    case "ol":
      return <ol role="presentation"><li>{label}</li></ol>;
    case "blockquote":
      return <blockquote><p>{label}</p></blockquote>;
    case "hr":
      return (
        <>
          <p>{label}</p>
          <hr role="presentation" />
        </>
      );
    case "left":
    case "center":
    case "right":
      // The dashed box stands for the width of the page, which is what makes
      // the alignment visible at all.
      return (
        <p className="rounded-md border border-dashed border-sage/50 px-2" style={{ textAlign: kind }}>
          {label}
        </p>
      );
    case "br": {
      // The label is written with its own line break, to show one.
      const [first, ...rest] = label.split("\n");
      return (
        <p>
          {first}
          {rest.length > 0 && (
            <>
              <br />
              {rest.join(" ")}
            </>
          )}
        </p>
      );
    }
    default:
      return <p>{label}</p>;
  }
}

function Keys({
  combos,
  apple,
  words,
  or,
}: {
  combos: readonly string[];
  apple: boolean;
  words: KeyWords;
  or: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {combos.map((combo, i) => (
        <Fragment key={combo}>
          {i > 0 && <span className="text-xs text-charcoal-light">{or}</span>}
          {/* Nested <kbd>: the outer one is the combination, each inner one a
              key — the HTML spec's own way of writing a chord. */}
          <kbd className="inline-flex items-center gap-0.5 font-sans">
            {keyCaps(combo, apple, words).map((cap, j) => (
              <Fragment key={j}>
                {/* Apple prints its chords run together (⇧⌘Z); Windows joins
                    them with "+", which a screen reader also reads out. */}
                {j > 0 && !apple && <span className="text-[0.625rem] text-charcoal-light">+</span>}
                <kbd className="editor-keycap">
                  {cap.spoken ? (
                    <>
                      <span aria-hidden="true">{cap.label}</span>
                      <span className="sr-only">{cap.spoken}</span>
                    </>
                  ) : (
                    cap.label
                  )}
                </kbd>
              </Fragment>
            ))}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * TipTap undoes an automatic format when Backspace is the very next key —
 * `## ` turns back into the three characters, a list back into "1. ". It is
 * the one thing worth knowing about typed shortcuts that is not a shortcut,
 * because they fire on text meant literally too ("1. ianuarie").
 */
function UndoTip({ apple, t }: { apple: boolean; t: Translate }) {
  const [before, after = ""] = t("admin.editor.undo_autoformat").split("{key}");
  return (
    <p className="mt-4 border-t border-sage/15 pt-3 text-xs leading-relaxed text-charcoal-light">
      {before}
      <kbd className="editor-keycap mx-0.5">
        {apple ? (
          <>
            <span aria-hidden="true">⌫</span>
            <span className="sr-only">Delete</span>
          </>
        ) : (
          "Backspace"
        )}
      </kbd>
      {after}
    </p>
  );
}
