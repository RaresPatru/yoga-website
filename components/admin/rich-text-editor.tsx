"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  PlaySquare,
  Redo2,
  SpellCheck,
  TextQuote,
  Undo2,
  X,
} from "lucide-react";
import { MediaLibrary } from "@/components/admin/media-library";
import { VideoDialog } from "@/components/admin/video-dialog";
import {
  LinkDialog,
  applyLink,
  readLink,
  removeLink,
  type LinkValue,
} from "@/components/admin/link-dialog";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { EditorShortcuts, useApplePlatform } from "@/components/admin/editor-shortcuts";
import {
  ESCAPE_REQUEST,
  LINK_REQUEST,
  SHORTCUTS_REQUEST,
  blogEditorExtensions,
} from "@/lib/blog-editor";
import { ARTICLE_TYPOGRAPHY } from "@/lib/article-typography";
import { PROVIDER_NAMES } from "@/lib/embeds";
import { ariaKeys, keyText, shortcut } from "@/lib/editor-shortcuts";
import { cn } from "@/lib/utils";

/**
 * A TipTap editor for a blog post body, configured the same way for both
 * languages (see blogEditorExtensions for why they must match).
 *
 * `content` is read once, when the editor is created. `labelId` names the
 * editing area for assistive technology, and for tests: it is a
 * contenteditable <div>, which a <label> cannot point at. `onChange` runs on
 * every edit she makes, which is what autosave listens to.
 */
export function useBlogEditor({
  content,
  lang,
  spellcheck,
  labelId,
  onChange,
}: {
  content: string;
  lang: string;
  spellcheck: boolean;
  labelId: string;
  onChange?: () => void;
}) {
  const extensions = useMemo(() => blogEditorExtensions(), []);
  /*
   * Memoised, because useEditor compares options by identity on every render
   * and re-applies them when they differ — which replaces the editing area's
   * attributes wholesale. That is also why `role` is repeated here: TipTap adds
   * role="textbox" only when it creates the editor, so leaving it out would
   * drop it the first time the spellcheck toggle changed anything.
   *
   * The typography is the public article's own (lib/article-typography.ts).
   */
  const editorProps = useMemo(
    () => ({
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        class: `${ARTICLE_TYPOGRAPHY} min-h-[28rem] cursor-text px-5 py-6 focus:outline-none sm:px-8`,
        spellcheck: spellcheck ? "true" : "false",
        lang,
      },
    }),
    [labelId, lang, spellcheck]
  );

  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  return useEditor({
    extensions,
    content,
    editorProps,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    // Only edits: setContent from the translation passes its own flag, and
    // a selection change is a transaction but not an update.
    onUpdate: () => changed.current?.(),
  });
}

/**
 * Every format the editor can be *in*, in document order.
 *
 * This list answers "what is the caret sitting in", which is what the Format
 * button shows. What she may switch to leaves Heading 1 out: the article's
 * title is already the page's <h1>, and a second one gives a screen reader and
 * a crawler two competing answers to "what is this about". Heading 1 stays in
 * this list because older posts contain one, and the button should name it
 * rather than call it a paragraph. Typing `# ` still makes one; Rares decided on
 * 23 September 2026 that she may, and the shortcut list says why Titlu 2 is
 * usually better.
 */
const FORMATS = [
  { level: 0, id: "paragraph", icon: Pilcrow },
  { level: 1, id: "heading1", icon: Heading1 },
  { level: 2, id: "heading2", icon: Heading2 },
  { level: 3, id: "heading3", icon: Heading3 },
] as const;

const OFFERED_FORMATS = FORMATS.filter((format) => format.level !== 1);

const ALIGNMENTS = [
  { id: "align_left", value: "left", icon: AlignLeft },
  { id: "align_center", value: "center", icon: AlignCenter },
  { id: "align_right", value: "right", icon: AlignRight },
] as const;

/**
 * 40px square, 44px where the pointer is a finger — Apple's minimum touch
 * target. The tooltips hang below; the toolbar is its own layer (z-20) so they
 * paint over the text rather than under it.
 */
function toolbarButtonClass(active?: boolean) {
  return cn(
    "flex h-10 min-w-10 items-center justify-center gap-0.5 rounded-lg px-1.5 text-sm transition-colors duration-150 pointer-coarse:h-11 pointer-coarse:min-w-11",
    active ? "bg-rose/15 text-rose-deep" : "text-charcoal-light hover:bg-rose/5 hover:text-charcoal"
  );
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
  return <span className="mx-0.5 h-6 w-px bg-sage/20" aria-hidden="true" />;
}

/**
 * The editing area and its toolbar, for one language.
 *
 * `stickyTop` is how far below the top of the screen the toolbar stops while
 * she scrolls: under the admin's top bar and the post editor's own bar. The
 * label is for assistive technology only; the post's title and subtitle above
 * say what this is. `busy` greys the editor out while the translation is about
 * to replace its contents.
 */
export function RichTextEditor({
  editor,
  label,
  labelId,
  spellcheck,
  busy = false,
  stickyTop = "var(--admin-header-h)",
}: {
  editor: Editor | null;
  label: string;
  labelId: string;
  spellcheck?: { on: boolean; onToggle: () => void; romanian: boolean };
  busy?: boolean;
  stickyTop?: string;
}) {
  const { t } = useAdminLocale();
  const apple = useApplePlatform();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState<LinkValue>({ href: "", text: "" });
  const [spellTip, setSpellTip] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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
    setLink(readLink(editor));
    setLinkOpen(true);
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

  const currentFormat =
    FORMATS.find((f) =>
      f.level === 0 ? !editor?.isActive("heading") : editor?.isActive("heading", { level: f.level })
    ) || FORMATS[0];

  // Left is what a paragraph does with no setting, so it is "on" whenever
  // neither of the others is.
  const alignment = editor?.isActive({ textAlign: "center" })
    ? ALIGNMENTS[1]
    : editor?.isActive({ textAlign: "right" })
      ? ALIGNMENTS[2]
      : ALIGNMENTS[0];

  const inList = Boolean(editor?.isActive("bulletList") || editor?.isActive("orderedList"));

  return (
    <div ref={rootRef}>
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div aria-busy={busy || undefined} className={busy ? "pointer-events-none opacity-60" : undefined}>
        {editor && (
          <div
            role="toolbar"
            aria-label={t("admin.editor.toolbar")}
            aria-controls={labelId}
            style={{ top: stickyTop }}
            className="sticky z-20 flex flex-wrap items-center gap-px border-y border-sage/20 bg-warm-white/95 px-1.5 py-1.5 backdrop-blur-md sm:px-2"
          >
            <MenuButton
              label={t("admin.editor.format")}
              tooltip={`${t("admin.editor.format")}: ${t(`admin.editor.${currentFormat.id}`)}`}
              triggerClassName={toolbarButtonClass()}
              trigger={
                <>
                  <currentFormat.icon className="h-4 w-4" aria-hidden="true" />
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </>
              }
              items={OFFERED_FORMATS.map((f) => ({
                id: f.id,
                label: t(`admin.editor.${f.id}`),
                icon: <f.icon className="h-4 w-4" />,
                checked: currentFormat.level === f.level,
                keys: describe(f.id).keys,
                onSelect: () => {
                  if (f.level === 0) editor.chain().focus().setParagraph().run();
                  else editor.chain().focus().setHeading({ level: f.level as 2 | 3 }).run();
                },
              }))}
            />

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
            <ToolbarButton {...describe("link")} onClick={openLinkDialog} active={editor.isActive("link")}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <MenuButton
              label={t("admin.editor.alignment")}
              tooltip={t(`admin.editor.${alignment.id}`)}
              triggerClassName={toolbarButtonClass()}
              trigger={
                <>
                  <alignment.icon className="h-4 w-4" aria-hidden="true" />
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </>
              }
              items={ALIGNMENTS.map((a) => ({
                id: a.id,
                label: t(`admin.editor.${a.id}`),
                icon: <a.icon className="h-4 w-4" />,
                checked: alignment.value === a.value,
                keys: describe(a.id).keys,
                onSelect: () => {
                  if (a.value === "left") editor.chain().focus().unsetTextAlign().run();
                  else editor.chain().focus().setTextAlign(a.value).run();
                },
              }))}
            />

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
            {/* Only in a list, where they mean something. Tab and Shift+Tab do
                the same, which a phone's keyboard does not have. */}
            {inList && (
              <>
                <ToolbarButton
                  label={t("admin.editor.indent")}
                  tooltip={`${t("admin.editor.indent")} (Tab)`}
                  keys="Tab"
                  onClick={() => editor.chain().focus().sinkListItem("listItem").run()}
                >
                  <IndentIncrease className="h-4 w-4" aria-hidden="true" />
                </ToolbarButton>
                <ToolbarButton
                  label={t("admin.editor.outdent")}
                  tooltip={`${t("admin.editor.outdent")} (Shift+Tab)`}
                  keys="Shift+Tab"
                  onClick={() => editor.chain().focus().liftListItem("listItem").run()}
                >
                  <IndentDecrease className="h-4 w-4" aria-hidden="true" />
                </ToolbarButton>
              </>
            )}
            <ToolbarButton
              {...describe("quote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
            >
              <TextQuote className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <ToolbarButton label={t("admin.editor.image")} onClick={() => setMediaOpen(true)}>
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton label={t("admin.editor.video")} onClick={() => setVideoOpen(true)}>
              <PlaySquare className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              {...describe("divider")}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            <Divider />

            <ToolbarButton {...describe("undo")} onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton {...describe("redo")} onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </ToolbarButton>

            {/* Pushed to the end on a wide screen; on a narrow one it wraps
                with everything else rather than overflowing. */}
            <div className="flex items-center gap-0.5 sm:ml-auto">
              {spellcheck && (
                <div className="relative flex items-center">
                  <ToolbarButton
                    label={t("admin.editor.spellcheck")}
                    active={spellcheck.on}
                    onClick={spellcheck.onToggle}
                  >
                    <SpellCheck className="h-4 w-4" aria-hidden="true" />
                  </ToolbarButton>
                  {spellcheck.on && spellcheck.romanian && (
                    <>
                      <button
                        type="button"
                        aria-label={t("admin.editor.spellcheck_help")}
                        aria-expanded={spellTip}
                        onClick={() => setSpellTip((open) => !open)}
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-warning hover:bg-warning/30"
                      >
                        <Info className="h-3 w-3" aria-hidden="true" />
                      </button>
                      {spellTip && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-sage/20 bg-warm-white p-3 shadow-xl">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs leading-relaxed text-charcoal-light">
                              {t("admin.editor.spellcheck_hint")}
                            </p>
                            <button
                              type="button"
                              onClick={() => setSpellTip(false)}
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

      <MediaLibrary
        open={mediaOpen}
        filterType="image"
        onClose={() => setMediaOpen(false)}
        onSelect={(url) => {
          editor?.chain().focus().setImage({ src: url }).run();
          setMediaOpen(false);
        }}
      />
      <VideoDialog
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        onInsert={(embed) =>
          editor?.chain().focus().setIframe({ src: embed.src, aspect: embed.aspect, title: PROVIDER_NAMES[embed.provider] }).run()
        }
      />
      <LinkDialog
        open={linkOpen}
        initial={link}
        onClose={() => setLinkOpen(false)}
        onApply={(value) => editor && applyLink(editor, value, link)}
        onRemove={() => editor && removeLink(editor)}
      />
    </div>
  );
}
