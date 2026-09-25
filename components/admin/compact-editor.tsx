"use client";

import { useEffect, useMemo, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { compactEditorExtensions } from "@/lib/compact-editor";
import { toEditorContent } from "@/lib/blog-editor";
import { cn } from "@/lib/utils";
import {
  LinkDialog,
  applyLink,
  readLink,
  removeLink,
  type LinkValue,
} from "@/components/admin/link-dialog";
import { useAdminLocale } from "@/components/admin/locale-provider";

/**
 * A small rich-text editor for site-content texts: paragraphs, bold,
 * italics, lists and links (lib/compact-editor.ts).
 *
 * It replaces a plain <textarea> whose line breaks never reached the page:
 * the text was stored without paragraph tags and rendered as HTML, so her
 * paragraphs ran together into one block (audit B6). The editor writes real
 * paragraphs. Text saved from the old textarea is turned into paragraphs when
 * it loads (toEditorContent).
 *
 * `value` is read when the editor is created; give it a `key` that changes
 * with the language so switching RO / EN starts a fresh editor.
 */
export function CompactEditor({
  value,
  onChange,
  labelId,
  describedBy,
  lang,
}: {
  value: string;
  onChange: (html: string) => void;
  labelId: string;
  describedBy?: string;
  lang: "ro" | "en";
}) {
  const { t } = useAdminLocale();
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState<LinkValue>({ href: "", text: "" });
  const extensions = useMemo(() => compactEditorExtensions(), []);

  const editor = useEditor({
    extensions,
    content: toEditorContent(value),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        lang: lang === "ro" ? "ro-RO" : "en",
        spellcheck: "true",
        class:
          "prose prose-sm max-w-none min-h-32 px-4 py-3 text-base text-charcoal focus:outline-none [&_p]:my-2",
      },
    },
    onUpdate: ({ editor }) => {
      // An editor with nothing typed holds "<p></p>"; store that as empty so
      // the page falls back or shows its placeholder.
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  // The "translate everything" button replaces the text from outside.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) editor.commands.setContent(toEditorContent(value), { emitUpdate: false });
  }, [editor, value]);

  const button = (active: boolean) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
      active ? "bg-rose/15 text-rose-deep" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
    );

  return (
    <div className="overflow-hidden rounded-xl border border-sage/30 bg-white focus-within:border-rose-deep/60">
      <div
        role="toolbar"
        aria-label={t("admin.content_editor.toolbar")}
        className="flex flex-wrap gap-1 border-b border-sage/20 bg-warm-white px-2 py-1"
      >
        <button
          type="button"
          className={button(!!editor?.isActive("bold"))}
          aria-label={t("admin.content_editor.bold")}
          aria-pressed={!!editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button(!!editor?.isActive("italic"))}
          aria-label={t("admin.content_editor.italic")}
          aria-pressed={!!editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button(!!editor?.isActive("bulletList"))}
          aria-label={t("admin.content_editor.bullets")}
          aria-pressed={!!editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button(!!editor?.isActive("orderedList"))}
          aria-label={t("admin.content_editor.numbers")}
          aria-pressed={!!editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={button(!!editor?.isActive("link"))}
          aria-label={t("admin.content_editor.link")}
          onClick={() => {
            if (!editor) return;
            setLink(readLink(editor));
            setLinkOpen(true);
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} />
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
