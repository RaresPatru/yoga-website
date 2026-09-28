"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Monitor, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/ui/segmented";
import { useAdminLocale } from "@/components/admin/locale-provider";

/** How long the preview waits after the last keystroke before it redraws. */
const REDRAW_MS = 250;

/**
 * The email as it will arrive, drawn in a frame beside the editor at a
 * phone's width (390px, an iPhone) or a computer's, and redrawn a moment
 * after she stops typing.
 *
 * The frame is sandboxed with no scripts; `allow-same-origin` only lets this
 * page measure the email's height, so the frame grows to fit it rather than
 * scrolling inside the page. Links open in a new tab.
 */
export function EmailPreviewPanel({
  html,
  subject,
  caption,
  onTest,
  testing,
  footer,
  controls,
}: {
  html: string;
  subject: string;
  caption?: ReactNode;
  onTest?: () => void;
  testing?: boolean;
  footer?: ReactNode;
  /** More switches beside the width, such as the language of a sent announcement. */
  controls?: ReactNode;
}) {
  const { t } = useAdminLocale();
  const [width, setWidth] = useState<"phone" | "computer">("phone");
  const [shown, setShown] = useState(html);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (html === shown) return;
    const timer = window.setTimeout(() => setShown(html), REDRAW_MS);
    return () => window.clearTimeout(timer);
  }, [html, shown]);

  const measure = useCallback(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.documentElement || !frame.current) return;
    frame.current.style.height = `${doc.documentElement.scrollHeight}px`;
  }, []);

  // The email reflows when the width changes; measure it again once it has.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const observer = new ResizeObserver(measure);
    observer.observe(doc.body);
    return () => observer.disconnect();
  }, [shown, width, measure]);

  const srcDoc = shown.replace("<head>", '<head><base target="_blank">');

  return (
    <section aria-labelledby="email-preview-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="email-preview-title" className="font-serif text-xl text-charcoal">
          {t("admin.mail.preview")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
        {controls}
        <Segmented
          legend={t("admin.mail.preview_width")}
          hideLegend
          value={width}
          onChange={setWidth}
          options={[
            {
              value: "phone",
              label: (
                <>
                  <Smartphone className="h-4 w-4" aria-hidden="true" />
                  {t("admin.mail.preview_phone")}
                </>
              ),
            },
            {
              value: "computer",
              label: (
                <>
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                  {t("admin.mail.preview_computer")}
                </>
              ),
            },
          ]}
        />
        </div>
      </div>

      <p className="break-words text-sm text-charcoal">
        <span className="text-charcoal-light">{t("admin.mail.subject")}: </span>
        {subject}
      </p>

      <div className="flex justify-center overflow-hidden rounded-2xl border border-sage/25 bg-sage/10 p-2 sm:p-3">
        <iframe
          ref={frame}
          title={t("admin.mail.preview_frame")}
          srcDoc={srcDoc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          onLoad={measure}
          className="block min-h-96 max-w-full rounded-xl bg-cream"
          style={{ width: width === "phone" ? 390 : "100%" }}
        />
      </div>

      {caption && <p className="text-sm text-charcoal-light">{caption}</p>}

      {onTest && (
        <Button type="button" variant="secondary" size="sm" onClick={onTest} disabled={testing}>
          <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {testing ? t("admin.mail.testing") : t("admin.mail.test")}
        </Button>
      )}
      {footer}
    </section>
  );
}
