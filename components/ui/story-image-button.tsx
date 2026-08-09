"use client";

import { useState } from "react";
// lucide-react removed brand marks (including Instagram) in v1, so this uses a
// generic "download an image" icon. The label carries the meaning.
import { ImageDown } from "lucide-react";
import { Button } from "./button";

interface StoryImageButtonProps {
  /** Path to the generated 1080x1920 image. */
  href: string;
  fileName: string;
  locale: string;
}

/**
 * Downloads the Instagram-story image for this event or post.
 *
 * Built for the instructor rather than for visitors: Instagram is her only
 * marketing channel, and a story is how she announces things. Without this she
 * would be assembling a graphic by hand for every event — and, inevitably,
 * sometimes posting one with the wrong date on it.
 *
 * A plain <a download> would be simpler, but the `download` attribute is
 * ignored for cross-origin URLs and behaves inconsistently inside in-app
 * browsers. Fetching to a blob and clicking a generated link works in the
 * places she will actually be: Instagram's in-app browser and mobile Safari.
 */
export function StoryImageButton({ href, fileName, locale }: StoryImageButtonProps) {
  const [busy, setBusy] = useState(false);
  const t = (ro: string, en: string) => (locale === "ro" ? ro : en);

  const handleDownload = async () => {
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Story image download failed:", error);
      // Last resort: open it so the image can be saved manually.
      window.open(href, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleDownload} disabled={busy}>
      <ImageDown className="mr-2 h-4 w-4" aria-hidden="true" />
      {busy
        ? t("Se pregătește...", "Preparing...")
        : t("Descarcă pentru Instagram", "Download for Instagram")}
    </Button>
  );
}
