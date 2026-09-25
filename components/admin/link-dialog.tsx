"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Link as LinkIcon, Unlink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";

export interface LinkValue {
  href: string;
  text: string;
}

/**
 * What she typed, as an address a browser can follow.
 *
 * "flow4ward.ro/blog" typed without the scheme would otherwise be read as a
 * path on this site and lead to a missing page. An email address becomes a
 * mailto: link. Addresses that already have a scheme, and links within the
 * site ("/events", "#top"), are left alone.
 */
export function normaliseHref(input: string): string {
  const href = input.trim();
  if (!href) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("/") || href.startsWith("#")) return href;
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(href)) return `mailto:${href}`;
  return `https://${href}`;
}

/**
 * The link under the caret, if any, and the text it covers — or the selected
 * text, for a new link. Selects the whole link, so what the dialog shows is
 * what applying it replaces.
 */
export function readLink(editor: Editor): LinkValue {
  editor.chain().focus().extendMarkRange("link").run();
  const { from, to } = editor.state.selection;
  return {
    href: editor.getAttributes("link").href ?? "",
    text: editor.state.doc.textBetween(from, to, " "),
  };
}

/**
 * Applies the dialog to the selection that `readLink` made.
 *
 * With the text unchanged, only the address changes, which keeps any bold or
 * italics inside the link. Otherwise the selection is replaced by the text
 * she typed, or by the address itself when she left the text empty: a link
 * has to show something to be pressed.
 */
export function applyLink(editor: Editor, value: LinkValue, original: LinkValue) {
  const href = normaliseHref(value.href);
  if (!href) return;
  const { from, to, empty } = editor.state.selection;
  const text = value.text.trim();

  if (!empty && text === original.text.trim()) {
    editor.chain().focus().setTextSelection({ from, to }).setLink({ href }).run();
    return;
  }
  const shown = text || href.replace(/^mailto:/, "");
  editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, { type: "text", text: shown, marks: [{ type: "link", attrs: { href } }] })
    // Typing straight after a link should not carry on inside it.
    .unsetMark("link")
    .run();
}

export function removeLink(editor: Editor) {
  editor.chain().focus().extendMarkRange("link").unsetLink().run();
}

/**
 * The dialog for adding or changing a link: the address, and the text the
 * reader sees. Editing a link shows both as they are, with a way to remove
 * the link and keep its words.
 */
export function LinkDialog({
  open,
  onClose,
  onApply,
  onRemove,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (value: LinkValue) => void;
  onRemove: () => void;
  initial: LinkValue;
}) {
  const { t } = useAdminLocale();
  const [href, setHref] = useState(initial.href);
  const [text, setText] = useState(initial.text);
  const [prevOpen, setPrevOpen] = useState(open);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const editing = Boolean(initial.href);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setHref(initial.href);
      setText(initial.text);
    }
  }

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

  const apply = () => {
    if (!href.trim()) return;
    onApply({ href, text });
    onClose();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="w-full rounded-2xl border border-sage/25 bg-warm-white p-6 shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="font-serif text-lg text-charcoal">
            {editing ? t("admin.edit_link") : t("admin.add_link")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("admin.close")}
            className="rounded-full p-1.5 text-charcoal-light hover:bg-sage/10"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-4">
          <Input
            label={t("admin.link_address")}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
            autoFocus
          />
          <Input
            label={t("admin.link_text")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            hint={t("admin.link_text_hint")}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {editing && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-error"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              <Unlink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("admin.remove_link")}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button type="submit" disabled={!href.trim()}>
            <LinkIcon className="mr-2 h-4 w-4" aria-hidden="true" />
            {editing ? t("admin.update_link") : t("admin.add")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
