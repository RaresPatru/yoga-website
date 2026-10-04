"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Bold, CalendarPlus, Heading2, Italic, Link2, List, ListOrdered, Plus } from "lucide-react";
import { VARIABLES, isLinkVariable, isVariableName, type EmailLocale, type VariableName } from "@/lib/email-content";
import {
  emailBodyExtensions,
  emailSubjectExtensions,
  fromEditorHtml,
  subjectToEditorHtml,
  toEditorHtml,
} from "@/lib/email-editor";
import { toPlainParagraphs } from "@/lib/plain-text";
import { cn } from "@/lib/utils";
import { LinkDialog, applyLink, readLink, removeLink, type LinkValue } from "@/components/admin/link-dialog";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { useAdminLocale } from "@/components/admin/locale-provider";

/** An event she can put in an announcement as a card. */
export interface CardOption {
  id: string;
  title: string;
  when: string;
}

/**
 * An email's subject and text, in one language: the part of the email
 * editor that is the same for an automatic email and an announcement.
 *
 * Each field has its own row of placeholders under it ("Inserează"), and a
 * placeholder goes in where the caret is in that field. A link placeholder
 * (the booking link, the WhatsApp group) goes into the text as a link with
 * words she can change; alone on its line it becomes the email's button.
 *
 * `lang` is the language being written. Switching it starts fresh editors, so
 * each language's text is its own; in English the Romanian is shown above
 * each field for reference.
 */
export function EmailFields({
  lang,
  subject,
  body,
  onSubject,
  onBody,
  romanian,
  variables,
  cards,
  subjectError,
  bodyError,
}: {
  lang: EmailLocale;
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  /** The Romanian texts, shown for reference while writing the English. */
  romanian?: { subject: string; body: string };
  variables: readonly VariableName[];
  /** For an announcement: the events it may show as cards. */
  cards?: CardOption[];
  subjectError?: string | null;
  bodyError?: string | null;
}) {
  const { t, locale } = useAdminLocale();
  const ui: EmailLocale = locale === "en" ? "en" : "ro";
  const id = useId();
  const label = useMemo(() => (name: string) => (isVariableName(name) ? VARIABLES[name].label[ui] : name), [ui]);

  const [subjectEditor, setSubjectEditor] = useState<Editor | null>(null);
  const [bodyEditor, setBodyEditor] = useState<Editor | null>(null);

  const inline = variables.filter((name) => !isLinkVariable(name));
  const links = variables.filter((name) => isLinkVariable(name));

  /** The Romanian with each placeholder as its name, for reading beside the English. */
  const asWords = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => `[${label(name)}]`);

  const empty = (value: string) => !value.replace(/<[^>]*>/g, "").trim() && !value.includes("data-event-card");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p id={`${id}-subject`} className="text-sm font-medium text-charcoal">
          {t("admin.mail.subject")}
        </p>
        {romanian && romanian.subject.trim() && (
          <p className="rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal-light" lang="ro">
            <span className="font-medium text-charcoal">{t("admin.mail.in_romanian")} </span>
            {asWords(romanian.subject)}
          </p>
        )}
        <SubjectEditor
          key={`${lang}|${ui}`}
          value={subject}
          onChange={onSubject}
          lang={lang}
          labelId={`${id}-subject`}
          describedBy={subjectError ? `${id}-subject-error` : lang === "en" && !subject.trim() ? `${id}-subject-empty` : undefined}
          label={label}
          onReady={setSubjectEditor}
        />
        {subjectError && (
          <p id={`${id}-subject-error`} className="text-sm text-error">
            {subjectError}
          </p>
        )}
        {lang === "en" && !subject.trim() && !subjectError && (
          <p id={`${id}-subject-empty`} className="text-sm italic text-charcoal-light">
            {t("admin.mail.empty_uses_romanian")}
          </p>
        )}
        <Chips
          group={t("admin.mail.insert_subject")}
          names={inline}
          label={label}
          onInsert={(name) => subjectEditor?.chain().focus().insertContent({ type: "emailVariable", attrs: { name } }).run()}
        />
      </div>

      <div className="space-y-2">
        <p id={`${id}-body`} className="text-sm font-medium text-charcoal">
          {t("admin.mail.body")}
        </p>
        {romanian && !empty(romanian.body) && (
          <details className="rounded-lg bg-sage/10 px-3 py-2 text-sm text-charcoal-light" lang="ro">
            <summary className="cursor-pointer font-medium text-charcoal">{t("admin.mail.romanian_body")}</summary>
            <p className="mt-2 whitespace-pre-line">{toPlainParagraphs(asWords(romanian.body))}</p>
          </details>
        )}
        <BodyEditor
          key={`${lang}|${ui}|${(cards ?? []).map((card) => card.id).join(",")}`}
          value={body}
          onChange={onBody}
          lang={lang}
          labelId={`${id}-body`}
          describedBy={[`${id}-body-help`, bodyError ? `${id}-body-error` : null].filter(Boolean).join(" ")}
          label={label}
          cards={cards}
          onReady={setBodyEditor}
          chips={
            <Chips
              group={t("admin.mail.insert_body")}
              names={[...inline, ...links]}
              label={label}
              isLink={(name) => isLinkVariable(name)}
              onInsert={(name) => {
                if (!bodyEditor) return;
                if (isLinkVariable(name) && isVariableName(name)) {
                  const words = (VARIABLES[name] as { link?: { ro: string; en: string } }).link?.[lang] ?? label(name);
                  bodyEditor
                    .chain()
                    .focus()
                    .insertContent({ type: "text", text: words, marks: [{ type: "link", attrs: { href: `{{${name}}}` } }] })
                    .unsetMark("link")
                    .run();
                } else {
                  bodyEditor.chain().focus().insertContent({ type: "emailVariable", attrs: { name } }).run();
                }
              }}
            />
          }
        />
        {bodyError && (
          <p id={`${id}-body-error`} className="text-sm text-error">
            {bodyError}
          </p>
        )}
        {lang === "en" && empty(body) && !bodyError && (
          <p className="text-sm italic text-charcoal-light">{t("admin.mail.empty_uses_romanian")}</p>
        )}
        <p id={`${id}-body-help`} className="text-sm text-charcoal-light">
          {t("admin.mail.body_help")}
        </p>
      </div>
    </div>
  );
}

/** A row of placeholders to insert, each a button. */
function Chips({
  group,
  names,
  label,
  isLink,
  onInsert,
}: {
  group: string;
  names: readonly string[];
  label: (name: string) => string;
  isLink?: (name: string) => boolean;
  onInsert: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <div role="group" aria-label={group} className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className="mr-0.5 text-xs text-charcoal-light">
        {group}:
      </span>
      {names.map((name) => (
        <button
          key={name}
          type="button"
          // Keeps the caret where it was: a button that took focus would move it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(name)}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-sage/15 px-3 text-sm text-sage-deep transition-colors hover:bg-sage/25"
        >
          {isLink?.(name) ? <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          {label(name)}
        </button>
      ))}
    </div>
  );
}

function SubjectEditor({
  value,
  onChange,
  lang,
  labelId,
  describedBy,
  label,
  onReady,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: EmailLocale;
  labelId: string;
  describedBy?: string;
  label: (name: string) => string;
  onReady: (editor: Editor | null) => void;
}) {
  const extensions = useMemo(() => emailSubjectExtensions({ label }), [label]);
  const editor = useEditor({
    extensions,
    content: subjectToEditorHtml(value),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-labelledby": labelId,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        lang: lang === "ro" ? "ro-RO" : "en",
        spellcheck: "true",
        class: "min-h-12 px-4 py-3 text-base text-charcoal focus:outline-none [&_p]:m-0",
      },
      // A subject is one line: pasted line breaks become spaces.
      transformPastedText: (text) => text.replace(/\s*[\r\n]+\s*/g, " "),
    },
    onUpdate: ({ editor }) => onChange(editor.getText()),
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  // The translate button replaces the text from outside.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.getText() !== value) editor.commands.setContent(subjectToEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="rounded-xl border border-sage/30 bg-white focus-within:border-rose-deep/60">
      <EditorContent editor={editor} />
    </div>
  );
}

function BodyEditor({
  value,
  onChange,
  lang,
  labelId,
  describedBy,
  label,
  cards,
  onReady,
  chips,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: EmailLocale;
  labelId: string;
  describedBy: string;
  label: (name: string) => string;
  cards?: CardOption[];
  onReady: (editor: Editor | null) => void;
  chips: React.ReactNode;
}) {
  const { t } = useAdminLocale();
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState<LinkValue>({ href: "", text: "" });

  // Built once per editor: the parent gives the editor a new key when the
  // events it can name or the panel's language change, which starts a fresh
  // one with the new names.
  const extensions = useMemo(
    () =>
      emailBodyExtensions({
        label,
        describeEvent: cards
          ? (eventId: string) => {
              const card = cards.find((c) => c.id === eventId);
              return card ? { title: card.title, when: card.when } : null;
            }
          : undefined,
        removeEventLabel: t("admin.announce.remove_event"),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const editor = useEditor({
    extensions,
    content: toEditorHtml(value),
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": labelId,
        "aria-describedby": describedBy,
        lang: lang === "ro" ? "ro-RO" : "en",
        spellcheck: "true",
        class: "email-body-editor min-h-48 px-4 py-3 text-base text-charcoal focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : fromEditorHtml(editor.getHTML())),
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const current = editor.isEmpty ? "" : fromEditorHtml(editor.getHTML());
    if (current !== value) editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  const button = (active: boolean) =>
    cn(
      "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
      active ? "bg-rose/15 text-rose-deep" : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
    );

  const tool = (name: string, active: boolean, run: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      className={button(active)}
      aria-label={name}
      aria-pressed={active}
      data-tooltip={name}
      onClick={run}
    >
      {icon}
    </button>
  );

  return (
    <div className="rounded-xl border border-sage/30 bg-white focus-within:border-rose-deep/60">
      <div className="space-y-2 border-b border-sage/20 bg-warm-white px-2 py-2">
        <div role="toolbar" aria-label={t("admin.content_editor.toolbar")} className="flex flex-wrap items-center gap-1">
          {tool(t("admin.content_editor.bold"), !!editor?.isActive("bold"), () => editor?.chain().focus().toggleBold().run(), <Bold className="h-4 w-4" aria-hidden="true" />)}
          {tool(t("admin.content_editor.italic"), !!editor?.isActive("italic"), () => editor?.chain().focus().toggleItalic().run(), <Italic className="h-4 w-4" aria-hidden="true" />)}
          {tool(t("admin.mail.heading"), !!editor?.isActive("heading", { level: 2 }), () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="h-4 w-4" aria-hidden="true" />)}
          {tool(t("admin.content_editor.bullets"), !!editor?.isActive("bulletList"), () => editor?.chain().focus().toggleBulletList().run(), <List className="h-4 w-4" aria-hidden="true" />)}
          {tool(t("admin.content_editor.numbers"), !!editor?.isActive("orderedList"), () => editor?.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-4 w-4" aria-hidden="true" />)}
          <button
            type="button"
            className={button(!!editor?.isActive("link"))}
            aria-label={t("admin.content_editor.link")}
            data-tooltip={t("admin.content_editor.link")}
            onClick={() => {
              if (!editor) return;
              setLink(readLink(editor));
              setLinkOpen(true);
            }}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
          </button>
          {cards && (
            <MenuButton
              label={t("admin.announce.add_event")}
              tooltip={t("admin.announce.add_event")}
              triggerClassName="ml-1 inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-charcoal hover:bg-sage/15"
              trigger={
                <>
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  {t("admin.announce.event")}
                </>
              }
              items={
                cards.length
                  ? cards.map((card) => ({
                      id: card.id,
                      label: `${card.title}, ${card.when}`,
                      onSelect: () =>
                        editor?.chain().focus().insertContent({ type: "emailEventCard", attrs: { id: card.id } }).run(),
                    }))
                  : [{ id: "none", label: t("admin.announce.no_events"), disabled: true, onSelect: () => {} }]
              }
            />
          )}
        </div>
        {chips}
      </div>
      <EditorContent editor={editor} />
      <LinkDialog
        open={linkOpen}
        initial={link}
        onClose={() => setLinkOpen(false)}
        onApply={(next) => editor && applyLink(editor, next, link)}
        onRemove={() => editor && removeLink(editor)}
      />
    </div>
  );
}
