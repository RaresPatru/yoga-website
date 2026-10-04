"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PlaySquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { embedFromUrl, type Embed } from "@/lib/embeds";

/**
 * Puts a video in a post from its address.
 *
 * The dialog says exactly which addresses work, and refuses anything else
 * with the reason, before it reaches the post: the sanitizer would otherwise
 * drop an unknown frame on the public page, so the video she pasted would
 * vanish without a word. A map is the likeliest thing to paste by mistake, so
 * it gets its own explanation and a pointer to the Link button.
 */
export function VideoDialog({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (embed: Embed) => void;
}) {
  const { t } = useAdminLocale();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

  const insert = () => {
    if (!url.trim()) return;
    const result = embedFromUrl(url);
    if ("refused" in result) {
      setError(t(`admin.video_error_${result.refused}`));
      return;
    }
    onInsert(result);
    setUrl("");
    setError("");
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
          insert();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 id={titleId} className="font-serif text-lg text-charcoal">
            {t("admin.video_title")}
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
        <p className="mb-2 text-sm text-charcoal-light">{t("admin.video_hint")}</p>
        <ul className="mb-4 list-disc space-y-0.5 pl-5 text-sm text-charcoal-light marker:text-sage-deep">
          <li>{t("admin.video_works_youtube")}</li>
          <li>{t("admin.video_works_vimeo")}</li>
          <li>{t("admin.video_works_instagram")}</li>
          <li>{t("admin.video_works_tiktok")}</li>
        </ul>
        <Input
          label={t("admin.video_address")}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          placeholder="https://www.youtube.com/watch?v=…"
          inputMode="url"
          autoComplete="off"
          autoFocus
          error={error || undefined}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("admin.cancel")}
          </Button>
          <Button type="submit" disabled={!url.trim()}>
            <PlaySquare className="mr-2 h-4 w-4" aria-hidden="true" /> {t("admin.video_insert")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
