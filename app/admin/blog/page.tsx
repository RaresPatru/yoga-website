"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, EyeOff, ChevronDown, Loader2 } from "lucide-react";
import {
  Bold, Italic, List, ListOrdered, TextQuote, Code2,
  Image, PlaySquare, Link2, Undo2, Redo2, Minus, Pilcrow,
  Heading1, Heading2, Heading3, Languages, Info, X,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";
import { MediaLibrary, VideoUrlDialog } from "@/components/admin/media-library";
import { LinkDialog } from "@/components/admin/link-dialog";
import { Iframe } from "@/lib/tiptap-iframe";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface BlogPost {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  content_ro: string | null;
  content_en: string | null;
  published: boolean;
  hidden: boolean;
  created_at: string;
}

type SpellcheckLang = "ro" | "en" | "off";

const headingLevels = [
  { level: 0, label: "Paragraph", icon: Pilcrow },
  { level: 1, label: "Heading 1", icon: Heading1 },
  { level: 2, label: "Heading 2", icon: Heading2 },
  { level: 3, label: "Heading 3", icon: Heading3 },
] as const;

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center rounded-lg p-2 text-sm transition-all duration-150 ${
        active
          ? "bg-rose/15 text-rose shadow-sm"
          : "text-charcoal-light hover:scale-105 hover:bg-rose/5 hover:text-charcoal active:scale-95"
      }`}
    >
      {children}
    </button>
  );
}

function DropdownItem({
  label,
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  icon: any;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-rose/10 text-rose"
          : "text-charcoal-light hover:bg-rose/5 hover:text-charcoal"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function BlogEditor({
  post,
  onSave,
  onCancel,
}: {
  post?: BlogPost | null;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useAdminLocale();
  const [titleRo, setTitleRo] = useState(post?.title_ro || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [published, setPublished] = useState(post?.published || false);
  const [hidden, setHidden] = useState(post?.hidden || false);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [headingOpen, setHeadingOpen] = useState(false);
  const [spell, setSpell] = useState<SpellcheckLang>("ro");
  const [titleEn, setTitleEn] = useState(post?.title_en || "");
  const [contentEn, setContentEn] = useState(post?.content_en || "");
  const [translatingTitle, setTranslatingTitle] = useState(false);
  const [translatingContent, setTranslatingContent] = useState(false);
  const [showSpellTooltip, setShowSpellTooltip] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const spellTooltipRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      ImageExtension,
      LinkExtension.configure({ openOnClick: false }),
      Iframe,
    ],
    content: post?.content_ro || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[280px] px-4 py-3 cursor-text",
        spellcheck: spell !== "off" ? "true" : "false",
        lang: spell !== "off" ? spell : "ro",
      },
    },
    immediatelyRender: true,
  });

  useEffect(() => {
    editor?.view?.dom?.setAttribute("spellcheck", spell !== "off" ? "true" : "false");
    const langVal = spell === "ro" ? "ro-RO" : spell === "en" ? "en" : "ro";
    editor?.view?.dom?.setAttribute("lang", langVal);
  }, [spell, editor]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      id: post?.id,
      slug,
      title_ro: titleRo,
      title_en: titleEn || null,
      content_ro: editor?.getHTML() || null,
      content_en: contentEn || null,
      published,
      hidden: published ? hidden : false,
    });
    setSaving(false);
  };

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
      editor.chain().focus().setIframe({ src: srcMatch[1] }).run();
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

  const openLinkDialog = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    setLinkUrl(previousUrl || "");
    setLinkDialogOpen(true);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (spellTooltipRef.current && !spellTooltipRef.current.contains(e.target as Node)) {
        setShowSpellTooltip(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const translateText = async (text: string): Promise<string> => {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from: "ro", to: "en" }),
    });
    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    return data.translatedText;
  };

  const handleTranslateTitle = async () => {
    if (!titleRo.trim()) return;
    setTranslatingTitle(true);
    try {
      const translated = await translateText(titleRo);
      setTitleEn(translated);
    } catch {
      alert(t("admin.translate_error"));
    } finally {
      setTranslatingTitle(false);
    }
  };

  const handleTranslateContent = async () => {
    if (!editor) return;
    const plainText = editor.getText().trim();
    if (!plainText) return;
    setTranslatingContent(true);
    try {
      const translated = await translateText(plainText);
      setContentEn(translated);
    } catch {
      alert(t("admin.translate_error"));
    } finally {
      setTranslatingContent(false);
    }
  };

  const toggleSpellcheck = () => {
    setSpell((prev) => (prev === "ro" ? "en" : prev === "en" ? "off" : "ro"));
    setShowSpellTooltip(false);
  };

  const cycleHeading = (level: number) => {
    if (!editor) return;
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
    }
    setHeadingOpen(false);
  };

  const currentHeading = headingLevels.find((h) => {
    if (h.level === 0) return !editor?.isActive("heading");
    return editor?.isActive("heading", { level: h.level });
  }) || headingLevels[0];

  const spellLabel = spell === "ro" ? "RO" : spell === "en" ? "EN" : "ABC";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-charcoal">
          {post ? t("admin.edit_post") : t("admin.new_post")}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>{t("admin.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("admin.saving") : t("admin.save")}
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input label={t("admin.title_ro")} value={titleRo} onChange={(e) => setTitleRo(e.target.value)} />
          </div>
          <button
            onClick={handleTranslateTitle}
            disabled={translatingTitle || !titleRo.trim()}
            className="mb-1.5 flex h-10 items-center gap-1.5 rounded-xl border border-sage/30 bg-white/60 px-3 text-xs font-medium text-charcoal-light backdrop-blur-sm transition-all hover:border-rose/30 hover:text-rose disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {translatingTitle ? t("admin.translating") : "→ EN"}
          </button>
        </div>
        <Input label={t("admin.title_en")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} spellCheck={spell !== "off"} lang={spell === "ro" ? "ro-RO" : "en"} />
      </div>

      <Input label={t("admin.slug")} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="nume-articol" />

      <div className="mx-auto max-w-4xl">
        <div className="mb-1.5 flex items-center justify-between">
          <label className="block text-sm font-medium text-charcoal-light">{t("admin.content_ro")}</label>
          <button
            onClick={handleTranslateContent}
            disabled={translatingContent || !editor || !editor.getText().trim()}
            className="flex items-center gap-1.5 rounded-lg border border-sage/30 bg-white/60 px-2.5 py-1 text-xs font-medium text-charcoal-light backdrop-blur-sm transition-all hover:border-rose/30 hover:text-rose disabled:cursor-not-allowed disabled:opacity-50"
          >
            {translatingContent ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {translatingContent ? t("admin.translating") : "→ EN"}
          </button>
        </div>
        <div className="rounded-xl border border-sage/30 bg-white/60 backdrop-blur-sm overflow-hidden">
          {editor && (
            <div className="flex flex-wrap items-center gap-0.5 border-b border-sage/20 p-1.5">
              <div className="relative" ref={headingRef}>
                <ToolbarButton
                  onClick={() => setHeadingOpen(!headingOpen)}
                  title="Format"
                >
                  <currentHeading.icon className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </ToolbarButton>
                {headingOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-sage/20 bg-white/90 p-1 shadow-xl backdrop-blur-xl">
                    {headingLevels.map((h) => (
                      <DropdownItem
                        key={h.level}
                        label={h.label}
                        icon={h.icon}
                        active={currentHeading.level === h.level}
                        onClick={() => cycleHeading(h.level)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <span className="mx-0.5 h-6 w-px bg-sage/15" />

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive("bold")}
                title="Bold (Ctrl+B)"
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive("italic")}
                title="Italic (Ctrl+I)"
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>

              <span className="mx-0.5 h-6 w-px bg-sage/15" />

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive("bulletList")}
                title="Bullet List"
              >
                <List className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive("orderedList")}
                title="Ordered List"
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive("blockquote")}
                title="Blockquote"
              >
                <TextQuote className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                active={editor.isActive("codeBlock")}
                title="Code Block"
              >
                <Code2 className="h-4 w-4" />
              </ToolbarButton>

              <span className="mx-0.5 h-6 w-px bg-sage/15" />

              <ToolbarButton
                onClick={() => setMediaOpen(true)}
                title="Insert Image / Audio"
              >
                <Image className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => setVideoDialogOpen(true)}
                title="Insert Video (YouTube/Vimeo)"
              >
                <PlaySquare className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={openLinkDialog}
                active={editor.isActive("link")}
                title="Insert Link (Ctrl+K)"
              >
                <Link2 className="h-4 w-4" />
              </ToolbarButton>

              <span className="mx-0.5 h-6 w-px bg-sage/15" />

              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="h-4 w-4" />
              </ToolbarButton>

              <span className="mx-0.5 h-6 w-px bg-sage/15" />

              <ToolbarButton
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                title="Horizontal Rule"
              >
                <Minus className="h-4 w-4" />
              </ToolbarButton>

              <div className="relative ml-auto">
                <ToolbarButton
                  onClick={toggleSpellcheck}
                  title={`Spellcheck: ${spell === "ro" ? "Romanian" : spell === "en" ? "English" : "Off"}`}
                >
                  <Languages className="h-4 w-4" />
                  <span className="ml-1 text-[10px] font-medium">{spellLabel}</span>
                </ToolbarButton>
                {spell === "ro" && (
                  <>
                    <button
                      onClick={() => setShowSpellTooltip(!showSpellTooltip)}
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning/20 text-warning hover:bg-warning/30"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                    {showSpellTooltip && (
                      <div
                        ref={spellTooltipRef}
                        className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-sage/20 bg-white/95 p-3 shadow-xl backdrop-blur-xl"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs leading-relaxed text-charcoal-light">
                            Dacă sublinierile roșii nu apar pentru limba română, adaugă dicționarul românesc în
                            Chrome Settings → Languages → Spell check.
                          </p>
                          <button
                            onClick={() => setShowSpellTooltip(false)}
                            className="shrink-0 rounded-full p-0.5 hover:bg-sage/10"
                          >
                            <X className="h-3 w-3 text-charcoal-light" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-charcoal-light">{t("admin.content_en")}</label>
        <textarea
          value={contentEn}
          onChange={(e) => setContentEn(e.target.value)}
          rows={6}
          spellCheck={spell !== "off"}
          lang={spell === "ro" ? "ro-RO" : "en"}
          className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 font-sans text-sm text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded border-sage/30 text-rose focus:ring-rose/20"
          />
          <span className="text-sm text-charcoal-light">{t("admin.published")}</span>
        </label>

        {published && (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="h-4 w-4 rounded border-sage/30 text-rose focus:ring-rose/20"
            />
            <span className="flex items-center gap-1.5 text-sm text-charcoal-light">
              <EyeOff className="h-3.5 w-3.5" /> {t("admin.hidden_from_users")}
            </span>
          </label>
        )}
      </div>

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={handleMediaSelect}
      />

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

export default function AdminBlogPage() {
  const { t } = useAdminLocale();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setPosts(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleSave = async (data: any) => {
    const supabase = createClient();
    if (data.id) {
      await supabase.from("blog_posts").update(data).eq("id", data.id);
    } else {
      await supabase.from("blog_posts").insert(data);
    }
    setEditing(null);
    setCreating(false);
    loadPosts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.confirm_delete_post"))) return;
    const supabase = createClient();
    await supabase.from("blog_posts").delete().eq("id", id);
    loadPosts();
  };

  if (creating || editing) {
    return (
      <div>
        <BlogEditor post={editing} onSave={handleSave} onCancel={() => { setCreating(false); setEditing(null); }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl text-charcoal">{t("admin.blog_title")}</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("admin.new_post")}
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-8 text-charcoal-light">{t("admin.no_posts")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {posts.map((post) => (
            <GlassCard key={post.id} hover={false} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-charcoal">{post.title_ro}</h3>
                  {post.published ? (
                    post.hidden ? (
                      <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{t("admin.hidden")}</span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">{t("admin.published")}</span>
                    )
                  ) : (
                    <span className="rounded-full bg-charcoal-light/10 px-2 py-0.5 text-xs text-charcoal-light">{t("admin.draft")}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-charcoal-light">
                  {new Date(post.created_at).toLocaleDateString("ro-RO")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(post)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(post.id)}>
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
