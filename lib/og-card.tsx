import type { ReactElement } from "react";

/**
 * Layouts for the generated share images.
 *
 * Two shapes, because they are consumed in two very different places:
 *
 *   LANDSCAPE  1200x630  the preview card shown when a link is pasted into
 *                        WhatsApp, Messenger, Facebook or a Google result.
 *   STORY      1080x1920 a full-screen portrait image the instructor saves and
 *                        posts to her Instagram story.
 *
 * The story format is the one that matters most here. Instagram is her only
 * marketing channel, and stories are where she posts — but Instagram will not
 * expand a link into a preview inside a story, so a landscape card is useless
 * there. Giving her a ready-made 9:16 image means she can announce an event in
 * two taps instead of building a graphic by hand every time.
 *
 * These are plain objects rather than React components with CSS classes because
 * Satori (the renderer behind ImageResponse) supports only a subset of flexbox
 * and inline styles — no Tailwind, no grid, no cascade.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const STORY_SIZE = { width: 1080, height: 1920 };

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

export function StoryCard({
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
        backgroundImage: `linear-gradient(160deg, ${CREAM} 0%, #FBEDEA 50%, #EEF2E8 100%)`,
        // Generous bottom padding keeps the content clear of Instagram's own
        // reply bar and swipe-up affordances at the base of a story.
        padding: "170px 90px 260px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ fontSize: 40, color: SAGE_DARK, letterSpacing: 2 }}>{siteName}</div>
        <div style={{ width: 80, height: 4, backgroundColor: SAGE, marginTop: 26, display: "flex" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {eyebrow && (
          <div style={{ fontSize: 44, color: ROSE_DEEP, marginBottom: 34, display: "flex" }}>
            {eyebrow}
          </div>
        )}
        <div style={{ fontSize: 96, lineHeight: 1.1, color: CHARCOAL, display: "flex" }}>
          {clip(title, 70)}
        </div>
        {subtitle && (
          <div style={{ fontSize: 44, color: CHARCOAL_SOFT, marginTop: 40, display: "flex" }}>
            {clip(subtitle, 80)}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {badge && (
          <div
            style={{
              fontSize: 42,
              color: "#FFFFFF",
              backgroundColor: ROSE_DEEP,
              padding: "20px 52px",
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
