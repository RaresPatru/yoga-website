"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Heart, ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ReviewEditor } from "@/components/testimonials/review-editor";
import { embedFromUrl } from "@/lib/embeds";
import { cn } from "@/lib/utils";

/** The limits the server enforces (lib/reviews.ts), said here so the form can say them first. */
const TEXT_MIN = 10;
const TEXT_MAX = 2000;
/** The longest side a photo is shrunk to before it is sent. The server re-saves it anyway. */
const PHOTO_SIDE = 1600;
/** Vercel refuses a request over 4.5 MB, so a photo is squeezed until it fits well under. */
const PHOTO_BYTES = 3_500_000;

/**
 * A photo from a phone is often 4,000 pixels across and several megabytes.
 * Drawn onto a canvas at 1600 pixels and saved as JPEG, it is a fraction of
 * that, which matters on a phone connection and keeps the request under the
 * host's limit. The browser applies the photo's own rotation as it draws it.
 * Null if the browser cannot read the file as a picture.
 */
async function shrink(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_BYTES) return blob;
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Stage = "form" | "done";

/**
 * The testimonial form, reached through a personal link. It asks for the
 * rating, the words, the name to show (in full or as first name and
 * initial, both made from the booking), an optional photo and video link, and
 * consent to publish. The server checks all of it again (/api/reviews).
 */
export function ReviewForm({
  token,
  locale,
  names,
}: {
  token: string;
  locale: string;
  names: { full: string; short: string };
}) {
  const t = useTranslations("reviews");
  const ids = useId();
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState({ html: "", length: 0 });
  const [nameChoice, setNameChoice] = useState<"short" | "full">("short");
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [video, setVideo] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const fileRef = useRef<HTMLInputElement>(null);

  const choosePhoto = async (file: File | undefined) => {
    setError("");
    if (!file) return;
    const blob = await shrink(file);
    if (!blob) {
      setError(t("error_photo_type"));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto({ blob, preview: URL.createObjectURL(blob) });
  };

  const removePhoto = () => {
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating) return setError(t("error_rating"));
    if (content.length < TEXT_MIN || content.length > TEXT_MAX) {
      return setError(t("error_text", { min: TEXT_MIN, max: TEXT_MAX }));
    }
    if (video.trim() && "refused" in embedFromUrl(video)) return setError(t("error_video"));
    if (!consent) return setError(t("error_consent"));

    const form = new FormData();
    form.set("token", token);
    form.set("rating", String(rating));
    form.set("content", content.html);
    form.set("name", nameChoice);
    form.set("video", video.trim());
    form.set("consent", "true");
    if (photo) form.set("photo", photo.blob, "photo.jpg");

    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/reviews", { method: "POST", body: form });
      if (response.ok) {
        setStage("done");
        return;
      }
      const { code } = await response.json().catch(() => ({ code: "" }));
      const key: Record<string, string> = {
        rating: "error_rating",
        consent: "error_consent",
        video: "error_video",
        photo_type: "error_photo_type",
        photo_size: "error_photo_size",
        used: "used_body",
        expired: "expired_body",
        invalid: "invalid_body",
        rate: "error_rate",
      };
      setError(code === "text" ? t("error_text", { min: TEXT_MIN, max: TEXT_MAX }) : t(key[code] ?? "error_generic"));
    } catch {
      setError(t("error_generic"));
    } finally {
      setSending(false);
    }
  };

  if (stage === "done") {
    return (
      <div role="status" className="text-center">
        <Heart className="mx-auto h-10 w-10 text-rose-deep" aria-hidden="true" />
        <h2 className="mt-4 font-serif text-2xl text-charcoal">{t("done_title")}</h2>
        <p className="mt-3 text-charcoal-light">{t("done_body")}</p>
      </div>
    );
  }

  const legend = "mb-2 text-sm font-medium text-charcoal-light";

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      {/* Five radio buttons drawn as stars: the arrow keys move between them. */}
      <fieldset>
        <legend className={legend}>{t("rating_legend")}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name={`${ids}-rating`}
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="peer sr-only"
              />
              <span className="sr-only">{t("rating_star", { count: value })}</span>
              <Star
                aria-hidden="true"
                className={cn(
                  "h-9 w-9 rounded-md p-0.5 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep",
                  value <= rating ? "fill-rose-deep text-rose-deep" : "text-sage-deep/40 hover:text-rose-deep/60"
                )}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p id={`${ids}-text-label`} className={legend}>
          {t("text_label")}
        </p>
        <ReviewEditor
          labelId={`${ids}-text-label`}
          describedBy={`${ids}-text-hint`}
          lang={locale}
          labels={{ bold: t("bold"), italic: t("italic"), toolbar: t("formatting") }}
          onChange={(html, length) => setContent({ html, length })}
        />
        <div id={`${ids}-text-hint`} className="mt-1.5 flex justify-between gap-3 text-xs text-charcoal-light">
          <span>{t("text_hint", { min: TEXT_MIN, max: TEXT_MAX })}</span>
          <span className={cn("tabular-nums", content.length > TEXT_MAX && "text-error")}>
            {t("text_count", { count: content.length, max: TEXT_MAX })}
          </span>
        </div>
      </div>

      <fieldset>
        <legend className={legend}>{t("name_legend")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["short", "full"] as const).map((choice) => (
            <label key={choice} className="cursor-pointer">
              <input
                type="radio"
                name={`${ids}-name`}
                value={choice}
                checked={nameChoice === choice}
                onChange={() => setNameChoice(choice)}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center rounded-full border border-sage/30 bg-white/70 px-4 text-sm text-charcoal transition-colors peer-checked:border-rose-deep peer-checked:bg-rose-deep peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-rose-deep">
                {names[choice]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className={legend}>{t("photo_label")}</p>
        {photo ? (
          <div className="flex items-end gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
            <img src={photo.preview} alt={t("photo_alt")} className="h-28 w-28 rounded-xl object-cover" />
            <button
              type="button"
              onClick={removePhoto}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {t("photo_remove")}
            </button>
          </div>
        ) : (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-sage/30 bg-white/70 px-4 text-sm text-charcoal hover:bg-sage/10 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-rose-deep">
            <ImagePlus className="h-4 w-4 text-sage-deep" aria-hidden="true" />
            {t("photo_choose")}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              aria-describedby={`${ids}-photo-hint`}
              onChange={(e) => void choosePhoto(e.target.files?.[0])}
              className="sr-only"
            />
          </label>
        )}
        <p id={`${ids}-photo-hint`} className="mt-1.5 text-xs text-charcoal-light">
          {t("photo_hint")}
        </p>
      </div>

      <Input
        label={t("video_label")}
        hint={t("video_hint")}
        type="url"
        inputMode="url"
        value={video}
        onChange={(e) => setVideo(e.target.value)}
        placeholder="https://"
      />

      <Checkbox label={t("consent")} checked={consent} onChange={(e) => setConsent(e.target.checked)} />

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={sending}>
        {sending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}
