"use client";

import { useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The testimonial's text box: paragraphs, bold and italics, and nothing else.
 *
 * Everything else the editor library knows is switched off, so a heading, a
 * list or a link cannot be typed or pasted in; the server's sanitizer allows
 * the same four things (sanitizeReviewHtml in lib/sanitize.ts) and removes
 * anything that arrives otherwise.
 *
 * Reports the HTML and the length of the text in it, which is what the
 * 2,000-character limit counts.
 */
export function ReviewEditor({
  onChange,
  labelId,
  describedBy,
  labels,
  lang,
}: {
  onChange: (html: string, textLength: number) => void;
  labelId: string;
  describedBy: string;
  labels: { bold: string; italic: string; toolbar: string };
  lang: string;
}) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
      }),
    ],
    []
  );

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": describedBy,
        lang: lang === "en" ? "en" : "ro-RO",
        spellcheck: "true",
        class: "min-h-40 px-4 py-3 text-base leading-relaxed text-charcoal focus:outline-none [&_p+p]:mt-3",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML(), editor.getText().trim().length),
  });

  const button = (active: boolean) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
      active ? "bg-rose/15 text-rose-deep" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
    );

  return (
    <div className="overflow-hidden rounded-xl border border-sage/30 bg-white/70 focus-within:border-rose-deep">
      <div role="toolbar" aria-label={labels.toolbar} className="flex gap-1 border-b border-sage/20 px-2 py-1">
        <button
          type="button"
          aria-label={labels.bold}
          aria-pressed={editor?.isActive("bold") ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={button(editor?.isActive("bold") ?? false)}
        >
          <Bold className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={labels.italic}
          aria-pressed={editor?.isActive("italic") ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={button(editor?.isActive("italic") ?? false)}
        >
          <Italic className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
