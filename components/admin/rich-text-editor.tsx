"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  Info,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  PlaySquare,
  Redo2,
  TextQuote,
  Undo2,
  X,
} from "lucide-react";
import { MediaLibrary, VideoUrlDialog } from "@/components/admin/media-library";
import { LinkDialog } from "@/components/admin/link-dialog";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { EditorShortcuts, useApplePlatform } from "@/components/admin/editor-shortcuts";
import {
  ESCAPE_REQUEST,
  LINK_REQUEST,
  SHORTCUTS_REQUEST,
  blogEditorExtensions,
} from "@/lib/blog-editor";
import { ariaKeys, keyText, shortcut } from "@/lib/editor-shortcuts";

export type SpellcheckLang = "ro" | "en" | "off";

/**
 * A TipTap editor for a blog post body, configured the same way for both
 * languages (see blogEditorExtensions for why they must match).
 *
 * `content` is read once, when the editor is created. `labelId` names the
 * editing area for assistive technology, and for tests: it is a
 * contenteditable <div>, which a <label> cannot point at.
 */
export function useBlogEditor({
  content,
  lang,
  spellcheck,
  labelId,
}: {
  content: string;
  lang: string;
  spellcheck: boolean;
  labelId: string;
}) {
  const extensions = useMemo(() => blogEditorExtensions(), []);
  /*
   * Memoised, because useEditor compares options by identity on every render
   * and re-applies them when they differ — which replaces the editing area's
   * attributes wholesale. That is also why `role` is repeated here: TipTap adds
   * role="textbox" only when it creates the editor, so leaving it out would
   * drop it the first time the spellcheck toggle changed anything.
   */
  const editorProps = useMemo(
    () => ({
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        class: "prose prose-sm max-w-none focus:outline-none min-h-[280px] px-4 py-3 cursor-text",
        spellcheck: spellcheck ? "true" : "false",
        lang,
      },
    }),
    [labelId, lang, spellcheck]
  );

  return useEditor({
    extensions,
    content,
    editorProps,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
  });
}

/**
 * Every format the editor can be *in*, in document order.
 *
 * This list answers "what is the caret sitting in", which is what the Format
 * button shows. What she may switch to is `OFFERED_FORMATS` below, and the two
 * are deliberately not the same list.
 */
const FORMATS = [
  { level: 0, id: "paragraph", icon: Pilcrow },
  { level: 1, id: "heading1", icon: Heading1 },
  { level: 2, id: "heading2", icon: Heading2 },
  { level: 3, id: "heading3", icon: Heading3 },
] as const;

/**
 * What the Format menu offers — everything above except Heading 1.
 *
 * WHY H1 IS RECOGNISED BUT NOT OFFERED
 *
 * The blog page already prints the post's title as the page's <h1>
 * (app/[locale]/blog/[slug]/page.tsx), so a level-1 heading in the body gives
 * the document a second one. A page with two <h1>s gives a screen reader and a
 * crawler two competing answers to "what is this about", and the one they pick
 * is not the title. H2 is the first level a body heading can honestly be.
 *
 * It stays in the list above rather than being deleted, because posts written
 * before this change contain one, and TipTap's schema keeps level 1 (see
 * HEADING_LEVELS) so that heading loads, survives a save, and reads here as
 * "Titlu 1" instead of being mislabelled a paragraph.
 *
 * Typing `# ` still makes one, and on 23 September Rares decided that is fine:
 * the shortcut list shows it, with a note saying why Titlu 2 is usually the
 * better choice. The menu stays as it is.
 */
const OFFERED_FORMATS = FORMATS.filter((format) => format.level !== 1);

const ALIGN_BUTTONS = [
  { id: "align_left", value: "left", icon: AlignLeft },
  { id: "align_center", value: "center", icon: AlignCenter },
  { id: "align_right", value: "right", icon: AlignRight },
] as const;

function toolbarButtonClass(active?: boolean) {
  return `flex items-center justify-center rounded-lg p-2 text-sm transition-all duration-150 ${
    active
      ? "bg-rose/15 text-rose-deep shadow-sm"
      : "text-charcoal-light hover:scale-105 hover:bg-rose/5 hover:text-charcoal active:scale-95"
  }`;
}

/**
 * A toolbar button. `label` is its accessible name; `tooltip` adds the
 * keyboard shortcut for anyone with a pointer. `active` makes it a toggle
 * (`aria-pressed`) — leave it out for buttons that simply act.
 */
function ToolbarButton({
  onClick,
  active,
  label,
  tooltip,
  keys,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  tooltip?: string;
  keys?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      aria-keyshortcuts={keys}
      data-tooltip={tooltip ?? label}
      className={toolbarButtonClass(active)}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-6 w-px bg-sage/15" aria-hidden="true" />;
}

/**
 * The editing area and its toolbar, for one language.
 *
 * `labelAction` sits beside the label (the Romanian editor's "→ EN");
 * `spellcheck` adds the spellcheck toggle, which only the Romanian editor
 * has; `busy` greys the editor out while something is about to replace its
 * contents.
 */
export function RichTextEditor({
  editor,
  label,
  labelId,
  labelAction,
  spellcheck,
  busy = false,
}: {
  editor: Editor | null;
  label: string;
  labelId: string;
  labelAction?: ReactNode;
  spellcheck?: { value: SpellcheckLang; onToggle: () => void };
  busy?: boolean;
}) {
  const { t } = useAdminLocale();
  const apple = useApplePlatform();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [formatOpen, setFormatOpen] = useState(false);
  const [showSpellTooltip, setShowSpellTooltip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLDivElement>(null);
  const spellTooltipRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLButtonElement>(null);

  /** Name, tooltip and aria-keyshortcuts for a button, from the shortcut list. */
  const describe = (id: string) => {
    const name = t(`admin.editor.${id}`);
    const combo = shortcut(id).keys?.[0];
    if (!combo) return { label: name };
    return {
      label: name,
      tooltip: `${name} (${keyText(combo, apple, { space: t("admin.editor.space") })})`,
      keys: ariaKeys(combo, apple),
    };
  };

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes("link").href || "");
    setLinkDialogOpen(true);
  }, [editor]);

  // Ctrl+K, Ctrl+/ and Escape come from the editor as DOM events
  // (lib/blog-editor.ts); preventDefault() tells it the key was used. The
  // shortcut list opens through its own button, so the browser treats the
  // keypress exactly like a click: same anchor, same toggle.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onLink = (event: Event) => {
      event.preventDefault();
      openLinkDialog();
    };
    const onShortcuts = (event: Event) => {
      const trigger = shortcutsRef.current;
      if (!trigger) return;
      event.preventDefault();
      trigger.click();
    };
    // Escape closes the list when it is open, and is left alone otherwise.
    const onEscape = (event: Event) => {
      const list = shortcutsRef.current?.popoverTargetElement;
      if (list instanceof HTMLElement && list.matches(":popover-open")) {
        event.preventDefault();
        list.hidePopover();
      }
    };
    root.addEventListener(LINK_REQUEST, onLink);
    root.addEventListener(SHORTCUTS_REQUEST, onShortcuts);
    root.addEventListener(ESCAPE_REQUEST, onEscape);
    return () => {
      root.removeEventListener(LINK_REQUEST, onLink);
      root.removeEventListener(SHORTCUTS_REQUEST, onShortcuts);
      root.removeEventListener(ESCAPE_REQUEST, onEscape);
    };
  }, [openLinkDialog]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formatRef.current && !formatRef.current.contains(e.target as Node)) setFormatOpen(false);
      if (spellTooltipRef.current && !spellTooltipRef.current.contains(e.target as Node)) {
        setShowSpellTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMediaSelect = (url: string, type: string) => {
    if (!editor) return;
    if (type === "image") {
      editor.chain().focus().setImage({ src: url }).run();
    } else if (type === "audio") {
      editor.chain().focus().insertContent(`<audio src="${url}" controls></audio>`).run();
    } else if (type === "video") {
      editor.chain().focus().insertContent(`<video src="${url}" controls class="w-full rounded-xl"></video>`).run();
    }
    setMediaOpen(false);
  };

  const handleVideoHtml = (html: string) => {
    if (!editor) return;
    const srcMatch = html.match(/src="([^"]+)"/);
    if (srcMatch) {
      // The dialog decides the shape (portrait for reels and Shorts, landscape
      // for normal video) and passes it through as data-aspect.
      const aspect = html.match(/data-aspect="([^"]+)"/)?.[1];
      editor.chain().focus().setIframe({ src: srcMatch[1], ...(aspect ? { aspect } : {}) }).run();
    }
  };

  const handleLinkApply = (url: string) => {
    if (!editor) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  const setFormat = (level: number) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 2 | 3 }).run();
    }
    setFormatOpen(false);
  };

  const currentFormat =
    FORMATS.find((f) =>
      f.level === 0 ? !editor?.isActive("heading") : editor?.isActive("heading", { level: f.level })
    ) || FORMATS[0];

  // Left is what a paragraph does with no setting, so it is "on" whenever
  // neither of the others is.
  const alignment = editor?.isActive({ textAlign: "center" })
    ? "center"
    : editor?.isActive({ textAlign: "right" })
      ? "right"
      : "left";

  const setAlignment = (value: "left" | "center" | "right") => {
    if (!editor) return;
    if (value === "left") editor.chain().focus().unsetTextAlign().run();
    else editor.chain().focus().setTextAlign(value).run();
  };

  const spellLabel = spellcheck
    ? t(`admin.editor.spellcheck_${spellcheck.value}`)
    : "";

  return (
    <div ref={rootRef} className="mx-auto max-w-4xl">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span id={labelId} className="block text-sm font-medium text-charcoal-light">
          {label}
        </span>
        {labelAction}
      </div>

      {/*
        The focus outline goes on this box rather than on the editable area
        inside it. The global rule in globals.css only covers links, buttons
        and form controls, and TipTap's editing surface is a contenteditable
        <div> — so without this the only sign the editor had focus was the
        caret. `focus-within` lights the whole editor, toolbar included, which
        is what a text field would do.

        No backdrop blur: this box sits on the flat page, where blurring
        changes nothing behind it and costs the text in front its subpixel
        antialiasing (CLAUDE.md, "backdrop-filter over a flat colour").
      */}
      <div
        aria-busy={busy || undefined}
        className={`rounded-xl border border-sage/30 bg-white/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-deep ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {editor && (
          <div className="flex flex-wrap items-center gap-0.5 border-b border-sage/20 p-1.5">
            <div className="relative" ref={formatRef}>
              <button
                type="button"
                onClick={() => setFormatOpen(!formatOpen)}
                aria-label={t("admin.editor.format")}
                aria-expanded={formatOpen}
                data-tooltip={t("admin.editor.format")}
                className={toolbarButtonClass()}
              >
                <currentFormat.icon className="h-4 w-4" aria-hidden="true" />
                <ChevronDown className="ml-0.5 h-3 w-3" aria-hidden="true" />
              </button>
              {formatOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-sage/20 bg-white p-1 shadow-xl">
                  {OFFERED_FORMATS.map((f) => (
                    <button
                      key={f.level}
                      type="button"
                      onClick={() => setFormat(f.level)}
                      aria-keyshortcuts={describe(f.id).keys}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        currentFormat.level === f.level
                          ? "bg-rose/10 text-rose-deep"
                          : "text-charcoal-light hover:bg-rose/5 hover:text-charcoal"
                      }`}
                    >
                      <f.icon className="h-4 w-4" aria-hidden="true" />
                      {t(`admin.editor.${f.id}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Divider />

            <ToolbarButton
              {...describe("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive("bold")}
            >
              <Bold className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive("italic")}
            >
              <Italic className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <div role="group" aria-label={t("admin.editor.alignment")} className="flex items-center gap-0.5">
              {ALIGN_BUTTONS.map((a) => (
                <ToolbarButton
                  key={a.value}
                  {...describe(a.id)}
                  onClick={() => setAlignment(a.value)}
                  active={alignment === a.value}
                >
                  <a.icon className="h-4 w-4" aria-hidden="true" />
                </ToolbarButton>
              ))}
            </div>

            <Divider />

            <ToolbarButton
              {...describe("bullet_list")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive("bulletList")}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("ordered_list")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive("orderedList")}
            >
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("quote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
            >
              <TextQuote className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("code_block")}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              active={editor.isActive("codeBlock")}
            >
              <Code2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <ToolbarButton label={t("admin.editor.image")} onClick={() => setMediaOpen(true)}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={t("admin.editor.video")} onClick={() => setVideoDialogOpen(true)}>
              <PlaySquare className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("link")}
              onClick={openLinkDialog}
              active={editor.isActive("link")}
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <ToolbarButton {...describe("undo")} onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton {...describe("redo")} onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <ToolbarButton
              {...describe("divider")}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <div className="ml-auto flex items-center gap-0.5">
              {spellcheck && (
                <div className="relative">
                  <ToolbarButton label={spellLabel} onClick={spellcheck.onToggle}>
                    <Languages className="h-4 w-4" aria-hidden="true" />
                    <span className="ml-1 text-[10px] font-medium" aria-hidden="true">
                      {spellcheck.value === "off" ? "ABC" : spellcheck.value.toUpperCase()}
                    </span>
                  </ToolbarButton>
                  {spellcheck.value === "ro" && (
                    <>
                      <button
                        type="button"
                        aria-label={t("admin.editor.spellcheck_help")}
                        aria-expanded={showSpellTooltip}
                        onMouseEnter={() => setShowSpellTooltip(true)}
                        onMouseLeave={() => setShowSpellTooltip(false)}
                        onClick={() => setShowSpellTooltip((open) => !open)}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-warning hover:bg-warning/30"
                      >
                        <Info className="h-3 w-3" aria-hidden="true" />
                      </button>
                      {showSpellTooltip && (
                        <div
                          ref={spellTooltipRef}
                          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-sage/20 bg-white p-3 shadow-xl"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs leading-relaxed text-charcoal-light">
                              {t("admin.editor.spellcheck_hint")}
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowSpellTooltip(false)}
                              aria-label={t("admin.close")}
                              className="shrink-0 rounded-full p-0.5 hover:bg-sage/10"
                            >
                              <X className="h-3 w-3 text-charcoal-light" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <EditorShortcuts triggerRef={shortcutsRef} triggerClassName={toolbarButtonClass()} />
            </div>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      <MediaLibrary open={mediaOpen} onClose={() => setMediaOpen(false)} onSelect={handleMediaSelect} />
      <VideoUrlDialog
        open={videoDialogOpen}
        onClose={() => setVideoDialogOpen(false)}
        onInsert={handleVideoHtml}
      />
      <LinkDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onApply={handleLinkApply}
        initialUrl={linkUrl}
      />
    </div>
  );
}
