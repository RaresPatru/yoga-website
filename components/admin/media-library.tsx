"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { Image, Music, Video, Upload, Trash2, X, Search, FileType, PlaySquare } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";
import NextImage from "next/image";

interface MediaFile {
  name: string;
  id: string;
  updated_at: string;
  metadata: Record<string, unknown>;
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

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const dialogRef = useRef<HTMLDialogElement>(null);

  const bucket = "media";

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

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

  // Reset the loading flag whenever the dialog opens, not just the first time.
  //
  // `loading` starts true and goes false after the first fetch, so reopening
  // showed the previous file list — including files deleted in between — until
  // the new listing arrived.
  //
  // Written as a render-time adjustment rather than inside the effect below,
  // which is React's documented pattern for reacting to a changed prop and
  // avoids the set-state-in-effect lint rule (and the extra render an effect
  // would cost).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setLoading(true);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.storage.from(bucket).list("", {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (data) setFiles(data as MediaFile[]);
      if (error) console.error("Storage list error:", error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, bucket]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert(t("admin.media_size_error"));
      return;
    }

    setUploading(true);

    try {
      // Two steps instead of one.
      //
      // 1. Ask our API for permission to upload. It checks the session is an
      //    admin, validates the type and size, decides the filename, and hands
      //    back a single-use token.
      // 2. Send the bytes straight to Supabase with that token.
      //
      // The file never passes through our own server, which is the point:
      // Vercel rejects request bodies over 4.5 MB, so the previous
      // upload-via-our-API approach failed on most video and many phone photos
      // while working fine on a developer's machine.
      const headers = await getAuthHeaders();
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          bucket,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(data.path, data.token, file, {
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      await loadFiles();
    } catch (err) {
      console.error("Upload error:", err);
      alert(err instanceof Error ? err.message : t("admin.media_upload_error"));
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(t("admin.media_confirm_delete"))) return;
    const headers = await getAuthHeaders();
    const res = await fetch("/api/upload", {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
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
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-[80vh] w-full flex-col rounded-2xl border border-white/30 bg-white/90 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-sage/20 px-6 py-4">
          <h2 className="font-serif text-xl text-charcoal">{t("admin.media_library")}</h2>
          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,audio/*,video/mp4,video/webm" />
            <Button size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? t("admin.media_uploading") : t("admin.media_upload")}
            </Button>
            <button
              onClick={onClose}
              aria-label={t("admin.close")}
              className="rounded-full p-1 text-charcoal-light hover:bg-white/40"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-sage/20 px-6 py-3 sm:flex-row sm:items-center">
          <div className="flex gap-1" role="group" aria-label={t("admin.media_library")}>
            {tabs.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                aria-pressed={activeTab === key}
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
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-light" />
            <input
              type="text"
              aria-label={t("admin.media_search")}
              placeholder={t("admin.media_search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-sage/20 bg-white/60 py-1.5 pl-9 pr-3 text-sm text-charcoal placeholder:text-charcoal-light/50 focus:border-rose/50 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center" role="status">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
              <span className="sr-only">{t("admin.loading")}</span>
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
                    deleteLabel={t("admin.media_delete")}
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
    </dialog>
  );
}

function MediaItem({
  file,
  url,
  type,
  onSelect,
  onDelete,
  deleteLabel,
}: {
  file: MediaFile;
  url: string;
  type: MediaType;
  onSelect: () => void;
  onDelete: () => void;
  deleteLabel: string;
}) {
  return (
    <GlassCard hover={false} className="group relative overflow-hidden p-0">
      <button onClick={onSelect} className="block w-full text-left">
        <div className="flex aspect-video items-center justify-center bg-sage/5">
          {type === "image" ? (
            <div className="relative h-full w-full">
              <NextImage
                src={url}
                alt={file.name}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-cover"
              />
            </div>
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
        aria-label={deleteLabel}
        className="absolute right-1 top-1 rounded-full bg-white/80 p-1 text-error opacity-100 backdrop-blur-sm transition-opacity hover:bg-white focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
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
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleInsert = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!/^https?:\/\//i.test(trimmed)) return;

    // Converts a page URL into the provider's embeddable URL, and says what
    // shape the result is.
    //
    // Two things changed here. Instagram links were previously used verbatim as
    // an iframe src, which does not work — Instagram only renders inside a
    // frame at its /embed path — and anything else at all was turned into an
    // iframe pointing wherever the URL said. lib/sanitize.ts now strips iframes
    // whose src is not a known provider, so an unsupported link would be
    // silently discarded on save. Refusing it here, with a message, beats
    // letting the instructor paste something that quietly vanishes.
    const embed = (() => {
      const youtube = trimmed.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]+)/
      )?.[1];
      if (youtube) {
        return {
          src: `https://www.youtube.com/embed/${youtube}`,
          title: "YouTube video",
          // Shorts are portrait, like reels.
          aspect: trimmed.includes("/shorts/") ? "9 / 16" : "16 / 9",
        };
      }

      const vimeo = trimmed.match(/vimeo\.com\/(\d+)/)?.[1];
      if (vimeo) {
        return {
          src: `https://player.vimeo.com/video/${vimeo}`,
          title: "Vimeo video",
          aspect: "16 / 9",
        };
      }

      const instagram = trimmed.match(
        /instagram\.com\/(p|reel|tv)\/([\w-]+)/
      );
      if (instagram) {
        const [, kind, code] = instagram;
        return {
          src: `https://www.instagram.com/${kind}/${code}/embed`,
          title: "Instagram",
          // Reels and IGTV are portrait; a standard post embed is roughly
          // square once Instagram's caption chrome is included.
          aspect: kind === "p" ? "4 / 5" : "9 / 16",
        };
      }

      return null;
    })();

    if (!embed) {
      setError(t("admin.video_unsupported"));
      return;
    }

    setError("");
    onInsert(
      `<iframe src="${embed.src}" data-aspect="${embed.aspect}" frameborder="0" allowfullscreen title="${embed.title}"></iframe>`
    );
    setUrl("");
    onClose();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-charcoal">{t("admin.video_title")}</h3>
          <button
            onClick={onClose}
            aria-label={t("admin.close")}
            className="rounded-full p-1 text-charcoal-light hover:bg-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-charcoal-light">
          {t("admin.video_hint")}
        </p>
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          placeholder={t("admin.video_placeholder")}
          onKeyDown={(e) => e.key === "Enter" && handleInsert()}
        />
        {error && (
          <p className="mt-2 text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>{t("admin.cancel")}</Button>
          <Button onClick={handleInsert} disabled={!url.trim()}>
            <PlaySquare className="mr-2 h-4 w-4" /> {t("admin.video_insert")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
