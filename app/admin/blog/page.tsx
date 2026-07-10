"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Edit2, Trash2, Eye } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ImageExtension from "@tiptap/extension-image";
import LinkExtension from "@tiptap/extension-link";

interface BlogPost {
  id: string;
  slug: string;
  title_ro: string;
  title_en: string | null;
  content_ro: string | null;
  content_en: string | null;
  published: boolean;
  created_at: string;
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
  const [titleRo, setTitleRo] = useState(post?.title_ro || "");
  const [titleEn, setTitleEn] = useState(post?.title_en || "");
  const [slug, setSlug] = useState(post?.slug || "");
  const [published, setPublished] = useState(post?.published || false);
  const [saving, setSaving] = useState(false);

  const editorRo = useEditor({
    extensions: [StarterKit, ImageExtension, LinkExtension],
    content: post?.content_ro || "",
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3" },
    },
  });

  const editorEn = useEditor({
    extensions: [StarterKit, ImageExtension, LinkExtension],
    content: post?.content_en || "",
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3" },
    },
  });

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      id: post?.id,
      slug,
      title_ro: titleRo,
      title_en: titleEn || null,
      content_ro: editorRo?.getHTML() || null,
      content_en: editorEn?.getHTML() || null,
      published,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-charcoal">
          {post ? "Editează articol" : "Articol nou"}
        </h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>Anulează</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Se salvează..." : "Salvează"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Titlu (RO)" value={titleRo} onChange={(e) => setTitleRo(e.target.value)} />
        <Input label="Titlu (EN)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
      </div>

      <Input label="Slug (URL)" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="nume-articol" />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal-light">Conținut (RO)</label>
          <div className="rounded-xl border border-sage/30 bg-white/60 backdrop-blur-sm">
            <div className="flex gap-1 border-b border-sage/20 p-2">
              <button onClick={() => editorRo?.chain().focus().toggleBold().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">B</button>
              <button onClick={() => editorRo?.chain().focus().toggleItalic().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60 italic">I</button>
              <button onClick={() => editorRo?.chain().focus().toggleHeading({ level: 2 }).run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">H2</button>
              <button onClick={() => editorRo?.chain().focus().toggleBulletList().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">•</button>
            </div>
            <EditorContent editor={editorRo} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-charcoal-light">Content (EN)</label>
          <div className="rounded-xl border border-sage/30 bg-white/60 backdrop-blur-sm">
            <div className="flex gap-1 border-b border-sage/20 p-2">
              <button onClick={() => editorEn?.chain().focus().toggleBold().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">B</button>
              <button onClick={() => editorEn?.chain().focus().toggleItalic().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60 italic">I</button>
              <button onClick={() => editorEn?.chain().focus().toggleHeading({ level: 2 }).run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">H2</button>
              <button onClick={() => editorEn?.chain().focus().toggleBulletList().run()} className="rounded-lg px-2 py-1 text-sm hover:bg-white/60">•</button>
            </div>
            <EditorContent editor={editorEn} />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="h-4 w-4 rounded border-sage/30 text-rose focus:ring-rose/20"
        />
        <span className="text-sm text-charcoal-light">Publicat</span>
      </label>
    </div>
  );
}

export default function AdminBlogPage() {
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
    if (!confirm("Sigur dorești să ștergi acest articol?")) return;
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
        <h1 className="font-serif text-2xl text-charcoal">Articole Blog</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> Articol Nou
        </Button>
      </div>

      {loading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
        </div>
      ) : posts.length === 0 ? (
        <p className="mt-8 text-charcoal-light">Nu există articole încă.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {posts.map((post) => (
            <GlassCard key={post.id} hover={false} className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-charcoal">{post.title_ro}</h3>
                  {post.published ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">Publicat</span>
                  ) : (
                    <span className="rounded-full bg-charcoal-light/10 px-2 py-0.5 text-xs text-charcoal-light">Ciornă</span>
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
