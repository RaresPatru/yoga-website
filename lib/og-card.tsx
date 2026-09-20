import type { ReactElement } from "react";

/**
 * The layout for the generated share images.
 *
 * One shape: 1200x630, the preview card shown when a link to this site is
 * pasted into WhatsApp, Messenger, Facebook or turns up in a Google result.
 *
 * There used to be a second, a 1080x1920 portrait card she could save and post
 * to her Instagram story. It was removed along with the two routes that served
 * it — Instagram does not expand a link into a preview inside a story, so the
 * image had to be downloaded and posted by hand, which is not meaningfully
 * easier than making one.
 *
 * These are plain objects rather than React components with CSS classes because
 * Satori (the renderer behind ImageResponse) supports only a subset of flexbox
 * and inline styles — no Tailwind, no grid, no cascade.
 */

export const OG_SIZE = { width: 1200, height: 630 };

// The brand palette, with the deeper rose used wherever text sits on a light
// background — the pastel #E8A0B4 fails contrast checks badly at 2.07:1.
const CREAM = "#FFF8F0";
const SAGE = "#9CAF88";
const SAGE_DARK = "#5F7049";
const ROSE_DEEP = "#B0576F";
const CHARCOAL = "#2D2D2D";
const CHARCOAL_SOFT = "#4A4A4A";

interface CardContent {
  /** Small line above the title: a date, or a section name. */
  eyebrow?: string;
  title: string;
  /** Supporting line: location, or a short excerpt. */
  subtitle?: string;
  /** Bottom-right badge, e.g. a price or "Gratuit". */
  badge?: string;
  siteName: string;
}

/** Truncates so long titles cannot overflow the fixed canvas. */
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function LandscapeCard({
  eyebrow,
  title,
  subtitle,
  badge,
  siteName,
}: CardContent): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: CREAM,
        padding: "64px 72px",
        // A soft wash so the card is not a flat rectangle. Satori supports
        // linear-gradient, which is enough for this.
        backgroundImage: `linear-gradient(135deg, ${CREAM} 0%, #FDF3F1 55%, #F3F5EE 100%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: ROSE_DEEP,
            display: "flex",
          }}
        />
        <div style={{ fontSize: 28, color: SAGE_DARK, letterSpacing: 1 }}>{siteName}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {eyebrow && (
          <div style={{ fontSize: 30, color: ROSE_DEEP, marginBottom: 18 }}>{eyebrow}</div>
        )}
        <div
          style={{
            fontSize: 68,
            lineHeight: 1.12,
            color: CHARCOAL,
            display: "flex",
            maxWidth: 980,
          }}
        >
          {clip(title, 90)}
        </div>
        {subtitle && (
          <div style={{ fontSize: 32, color: CHARCOAL_SOFT, marginTop: 22, display: "flex" }}>
            {clip(subtitle, 110)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ width: 120, height: 5, backgroundColor: SAGE, display: "flex" }} />
        {badge && (
          <div
            style={{
              fontSize: 30,
              color: "#FFFFFF",
              backgroundColor: ROSE_DEEP,
              padding: "12px 30px",
              borderRadius: 999,
              display: "flex",
            }}
          >
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}
