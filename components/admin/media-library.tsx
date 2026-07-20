"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { Image, Music, Video, Upload, Trash2, X, Search, FileType, PlaySquare } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface MediaFile {
  name: string;
  id: string;
  updated_at: string;
  metadata: Record<string, any>;
}

type MediaType = "image" | "audio" | "video" | "all";

const MIME_CATEGORIES: Record<string, MediaType> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/svg+xml": "image",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/opus": "audio",
  "audio/webm": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/flac": "audio",
  "audio/aac": "audio",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "video/x-msvideo": "video",
};

const EXT_CATEGORIES: Record<string, MediaType> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", svg: "image",
  mp3: "audio", wav: "audio", ogg: "audio", opus: "audio", webm: "video",
  m4a: "audio", aac: "audio", flac: "audio",
  mp4: "video", mov: "video", avi: "video", mkv: "video",
};

function getMediaType(file: MediaFile): MediaType {
  const mime = file.metadata?.mimetype as string | undefined;
  if (mime && MIME_CATEGORIES[mime]) return MIME_CATEGORIES[mime];
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext && EXT_CATEGORIES[ext]) return EXT_CATEGORIES[ext];
  return "image";
}

const storageClient = createClient();

function getPublicUrl(bucket: string, path: string) {
  return storageClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

interface MediaLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, type: MediaType) => void;
  filterType?: MediaType;
}

export function MediaLibrary({ open, onClose, onSelect, filterType = "all" }: MediaLibraryProps) {
  const { t } = useAdminLocale();
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<MediaType>(filterType);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bucket = "media";

  const loadFiles = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.storage.from(bucket).list("", {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (data) setFiles(data as MediaFile[]);
    if (error) console.error("Storage list error:", error);
    setLoading(false);
  }, []);

  useEffect(() => { if (open) { setLoading(true); loadFiles(); } }, [open, loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert(t("admin.media_size_error"));
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("bucket", bucket);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.url) {
        await loadFiles();
      } else {
        alert(data.error || t("admin.media_upload_error"));
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert(err instanceof Error ? err.message : t("admin.media_upload_error"));
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(t("admin.media_confirm_delete"))) return;
    const res = await fetch("/api/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, fileName }),
    });
    if (res.ok) {
      setFiles((prev) => prev.filter((f) => f.name !== fileName));
    } else {
      const text = await res.text().catch(() => "");
      console.error("Delete error:", text || `HTTP ${res.status}`);
      alert(text || t("admin.media_upload_error"));
    }
  };

  const filtered = files.filter((f) => {
    const type = getMediaType(f);
    const matchesTab = activeTab === "all" || type === activeTab;
    const matchesSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const tabs: { key: MediaType; labelKey: string; icon: typeof Image }[] = [
    { key: "all", labelKey: "admin.media_all", icon: FileType },
    { key: "image", labelKey: "admin.media_images", icon: Image },
    { key: "audio", labelKey: "admin.media_audio", icon: Music },
    { key: "video", labelKey: "admin.media_video", icon: Video },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-white/30 bg-white/90 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-sage/20 px-6 py-4">
          <h2 className="font-serif text-xl text-charcoal">{t("admin.media_library")}</h2>
          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,audio/*,video/mp4,video/webm" />
            <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? t("admin.media_uploading") : t("admin.media_upload")}
            </Button>
            <button onClick={onClose} className="rounded-full p-1 text-charcoal-light hover:bg-white/40">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-sage/20 px-6 py-3">
          <div className="flex gap-1">
            {tabs.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  activeTab === key
                    ? "bg-rose/10 text-rose font-medium"
                    : "text-charcoal-light hover:text-charcoal"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div className="relative ml-auto flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" />
            <input
              type="text"
              placeholder={t("admin.media_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-sage/20 bg-white/60 py-1.5 pl-9 pr-3 text-sm text-charcoal placeholder:text-charcoal-light/50 focus:border-rose/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-charcoal-light">
              <Upload className="mb-3 h-12 w-12 opacity-30" />
              <p>{t("admin.media_no_files")}</p>
              <p className="text-sm">{t("admin.media_no_files_hint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((file) => {
                const url = getPublicUrl(bucket, file.name);
                const type = getMediaType(file);
                return (
                  <MediaItem
                    key={file.name}
                    file={file}
                    url={url}
                    type={type}
                    onSelect={() => onSelect(url, type)}
                    onDelete={() => handleDelete(file.name)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {activeTab === "video" && (
          <div className="border-t border-sage/20 px-6 py-3">
            <p className="text-xs text-charcoal-light">
              {t("admin.media_video_hint")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaItem({
  file,
  url,
  type,
  onSelect,
  onDelete,
}: {
  file: MediaFile;
  url: string;
  type: MediaType;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <GlassCard hover={false} className="group relative overflow-hidden p-0">
      <button onClick={onSelect} className="block w-full text-left">
        <div className="flex aspect-video items-center justify-center bg-sage/5">
          {type === "image" ? (
            <img src={url} alt={file.name} className="h-full w-full object-cover" />
          ) : type === "audio" ? (
            <div className="flex flex-col items-center gap-2 text-charcoal-light">
              <Music className="h-8 w-8" />
              <audio src={url} controls className="w-full px-2" onClick={(e) => e.stopPropagation()} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-charcoal-light">
              <Video className="h-8 w-8" />
              <video src={url} className="h-full w-full object-cover" controls onClick={(e) => e.stopPropagation()} />
            </div>
          )}
        </div>
        <div className="p-2">
          <p className="truncate text-xs text-charcoal">{file.name}</p>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="absolute right-1 top-1 rounded-full bg-white/80 p-1 text-error opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </GlassCard>
  );
}

export function VideoUrlDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
}) {
  const { t } = useAdminLocale();
  const [url, setUrl] = useState("");

  const handleInsert = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    let html = "";
    if (trimmed.includes("youtube.com/watch") || trimmed.includes("youtu.be")) {
      const id = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
      if (id) {
        html = `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${id}" frameborder="0" allowfullscreen></iframe>`;
      }
    } else if (trimmed.includes("vimeo.com")) {
      const id = trimmed.match(/vimeo\.com\/(\d+)/)?.[1];
      if (id) {
        html = `<iframe width="100%" height="400" src="https://player.vimeo.com/video/${id}" frameborder="0" allowfullscreen></iframe>`;
      }
    } else if (trimmed.includes("instagram.com")) {
      html = `<iframe width="100%" height="480" src="${trimmed}" frameborder="0" allowfullscreen></iframe><script async src="//www.instagram.com/embed.js"></script>`;
    } else {
      html = `<iframe width="100%" height="400" src="${trimmed}" frameborder="0" allowfullscreen></iframe>`;
    }

    if (html) {
      onInsert(html);
      setUrl("");
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-charcoal">{t("admin.video_title")}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-charcoal-light hover:bg-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-charcoal-light">
          {t("admin.video_hint")}
        </p>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("admin.video_placeholder")}
          onKeyDown={(e) => e.key === "Enter" && handleInsert()}
        />
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>{t("admin.cancel")}</Button>
          <Button onClick={handleInsert} disabled={!url.trim()}>
            <PlaySquare className="mr-2 h-4 w-4" /> {t("admin.video_insert")}
          </Button>
        </div>
      </div>
    </div>
  );
}
