"use client";

import { useEffect, useState, useCallback, useId, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAuthToken } from "@/lib/get-auth-token";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, EyeOff, Loader2 } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import {
  RichTextEditor,
  useBlogEditor,
  type SpellcheckLang,
} from "@/components/admin/rich-text-editor";
import { toEditorContent } from "@/lib/blog-editor";
import { translateDocument } from "@/lib/translate-document";

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

/** Why a translation failed, when it is something she can act on. */
class TranslationFailed extends Error {
  constructor(readonly reason: "too_long" | "failed") {
    super(`Translation failed: ${reason}`);
  }
}

const TRANSLATE_BUTTON =
  "flex items-center gap-1.5 border border-sage/30 bg-white/60 text-xs font-medium text-charcoal-light transition-all hover:border-rose/30 hover:text-rose-deep disabled:cursor-not-allowed disabled:opacity-50";

function BlogEditor({
  post,
  onSave,
  onCancel,
}: {
  post?: BlogPost | null;
  onSave: (data: Partial<BlogPost>) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useAdminLocale();
  const [titleRo, setTitleRo] = useState(post?.title_ro || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [published, setPublished] = useState(post?.published || false);
  const [hidden, setHidden] = useState(post?.hidden || false);
  const [saving, setSaving] = useState(false);
  const [spell, setSpell] = useState<SpellcheckLang>("ro");
  const [titleEn, setTitleEn] = useState(post?.title_en || "");
  const [translatingTitle, setTranslatingTitle] = useState(false);
  const [translatingContent, setTranslatingContent] = useState(false);
  const roLabelId = useId();
  const enLabelId = useId();
  const englishRef = useRef<HTMLDivElement>(null);

  const roEditor = useBlogEditor({
    content: post?.content_ro || "",
    lang: spell === "en" ? "en" : "ro-RO",
    spellcheck: spell !== "off",
    labelId: roLabelId,
  });

  /*
   * The English body is an editor too, with the same toolbar — the formatting
   * the translation carries over would otherwise arrive somewhere she could
   * not change it. Its spellcheck is always English: before, the English box
   * inherited the Romanian setting and was checked as Romanian by default.
   */
  const enEditor = useBlogEditor({
    content: toEditorContent(post?.content_en),
    lang: "en",
    spellcheck: spell !== "off",
    labelId: enLabelId,
  });

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      id: post?.id,
      slug,
      title_ro: titleRo,
      title_en: titleEn || null,
      // An empty editor still holds an empty paragraph, and "<p></p>" is not
      // "no English": the public page shows the Romanian only when the English
      // is null, so an untouched English editor has to save as null.
      content_ro: roEditor && !roEditor.isEmpty ? roEditor.getHTML() : null,
      content_en: enEditor && !enEditor.isEmpty ? enEditor.getHTML() : null,
      published,
      hidden: published ? hidden : false,
    });
    setSaving(false);
  };

  const translateText = async (text: string): Promise<string> => {
    const token = await getAuthToken();
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ text, from: "ro", to: "en" }),
    });
    if (!res.ok) throw new Error("Translation failed");
    const data = await res.json();
    return data.translatedText;
  };

  /** One request for every paragraph of the post; see lib/translate-document.ts. */
  const translateBlocks = async (texts: string[]): Promise<string[]> => {
    const token = await getAuthToken();
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ texts, from: "ro", to: "en" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new TranslationFailed(data.code === "too_long" ? "too_long" : "failed");
    return data.translations;
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

  /**
   * Fills the English editor with a translation of the Romanian one, keeping
   * its formatting.
   *
   * Replacing English she may have corrected by hand is asked about first.
   * The replacement is also one step in the English editor's history, so
   * Desfă (undo) there brings her version back — the question says so. Undo
   * is "Desfă" rather than "Anulează" because the page's Cancel button is
   * already "Anulează", and it throws the whole post away.
   */
  const handleTranslateContent = async () => {
    if (!roEditor || !enEditor || !roEditor.getText().trim()) return;
    if (!enEditor.isEmpty && !confirm(t("admin.editor.translate_replace"))) return;

    setTranslatingContent(true);
    // Typing into the English editor now would be overwritten in a moment.
    enEditor.setEditable(false);
    try {
      const translated = await translateDocument(roEditor, translateBlocks);
      // She may have left the editor while the request was out.
      if (enEditor.isDestroyed) return;
      enEditor.commands.setContent(translated);
      // The result lands below the fold more often than not; bring it into
      // view without dragging the page if it is already visible.
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      englishRef.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    } catch (err) {
      alert(
        err instanceof TranslationFailed && err.reason === "too_long"
          ? t("admin.editor.translate_too_long")
          : t("admin.translate_error")
      );
    } finally {
      if (!enEditor.isDestroyed) enEditor.setEditable(true);
      setTranslatingContent(false);
    }
  };

  const toggleSpellcheck = () => {
    setSpell((prev) => (prev === "ro" ? "en" : prev === "en" ? "off" : "ro"));
  };

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
            type="button"
            onClick={handleTranslateTitle}
            disabled={translatingTitle || !titleRo.trim()}
            data-tooltip={t("admin.translate_to_en")}
            className={`mb-1.5 h-10 rounded-xl px-3 ${TRANSLATE_BUTTON}`}
          >
            {translatingTitle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {translatingTitle ? t("admin.translating") : "→ EN"}
          </button>
        </div>
        <Input label={t("admin.title_en")} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} spellCheck={spell !== "off"} lang="en" />
      </div>

      <Input label={t("admin.slug")} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="nume-articol" />

      <RichTextEditor
        editor={roEditor}
        label={t("admin.content_ro")}
        labelId={roLabelId}
        spellcheck={{ value: spell, onToggle: toggleSpellcheck }}
        labelAction={
          <button
            type="button"
            onClick={handleTranslateContent}
            disabled={translatingContent || !roEditor || !roEditor.getText().trim()}
            data-tooltip={t("admin.translate_to_en")}
            className={`rounded-lg px-2.5 py-1 ${TRANSLATE_BUTTON}`}
          >
            {translatingContent ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {translatingContent ? t("admin.translating") : "→ EN"}
          </button>
        }
      />

      <div ref={englishRef}>
        <RichTextEditor
          editor={enEditor}
          label={t("admin.content_en")}
          labelId={enLabelId}
          busy={translatingContent}
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4 rounded border-sage/30 accent-rose-deep"
          />
          <span className="text-sm text-charcoal-light">{t("admin.published")}</span>
        </label>

        {published && (
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
              className="h-4 w-4 rounded border-sage/30 accent-rose-deep"
            />
            <span className="flex items-center gap-1.5 text-sm text-charcoal-light">
              <EyeOff className="h-3.5 w-3.5" /> {t("admin.hidden_from_users")}
            </span>
          </label>
        )}
      </div>
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

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        if (data) setPosts(data);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (data: Partial<BlogPost>) => {
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
              {/* Named for the post they act on — icon-only buttons repeated
                  down a list are otherwise announced as "Edit, Edit, Edit". */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t("admin.edit_post")}: ${post.title_ro}`}
                  onClick={() => setEditing(post)}
                >
                  <Edit2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${t("admin.delete")}: ${post.title_ro}`}
                  onClick={() => handleDelete(post.id)}
                >
                  <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
