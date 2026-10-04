"use client";

import { useEffect, useRef } from "react";
import { embedProvider, playerSrc } from "@/lib/embeds";

/**
 * Stored rich text, drawn, with its video placeholders made to work.
 *
 * `html` must already have been through sanitizeArticleHtml (lib/sanitize.ts),
 * which is what turns each video into a placeholder. The placeholders are
 * plain HTML, so React never sees them as components: one listener on this
 * element catches the press on any of them and swaps in the player. The
 * address is checked against the allowed players again here, since the
 * attribute came from stored HTML.
 *
 * Focus moves into the new frame, so a keyboard user who pressed Enter is
 * where the video's own controls are rather than on a button that has gone.
 */
export function RichHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.("[data-embed-play]");
      const facade = button?.closest<HTMLElement>(".embed-facade");
      if (!button || !facade) return;
      const src = facade.dataset.embedSrc ?? "";
      if (!embedProvider(src)) return;

      const frame = document.createElement("iframe");
      frame.src = playerSrc(src);
      frame.title = facade.dataset.embedTitle ?? "Video";
      frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      frame.allowFullscreen = true;
      frame.className = "embed-facade-frame";
      button.replaceWith(frame);
      facade.dataset.playing = "true";
      frame.focus();
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
