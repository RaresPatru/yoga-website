"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Monitor, Smartphone, X } from "lucide-react";
import { Segmented } from "@/components/admin/ui/segmented";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { cn } from "@/lib/utils";

/**
 * The real public page, unpublished version, in a frame: at a phone's width
 * (390px, an iPhone 14) or the full width of the screen, in Romanian or
 * English. The page inside is app/[locale]/preview/<path>, drawn by the same
 * component as the published page: blog/<id> for a post, events/<id> for an
 * event.
 *
 * `version` changes each time the dialog opens, so the frame reloads and
 * shows what was saved a moment ago rather than a cached copy.
 */
export function PreviewDialog({
  open,
  onClose,
  path,
  version,
}: {
  open: boolean;
  onClose: () => void;
  /** Under /<locale>/preview/, such as "blog/<id>". */
  path: string;
  version: number;
}) {
  const { t } = useAdminLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState<"phone" | "computer">("phone");
  const [lang, setLang] = useState<"ro" | "en">("ro");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    const handle = () => onClose();
    dialog?.addEventListener("close", handle);
    return () => dialog?.removeEventListener("close", handle);
  }, [onClose]);

  const src = `/${lang}/preview/${path}?v=${version}`;

  return (
    <dialog
      ref={ref}
      aria-label={t("admin.blog_editor.preview")}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-cream p-0 backdrop:bg-black/40"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-sage/25 bg-warm-white px-4 py-2.5 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]">
            <h2 className="font-serif text-lg text-charcoal">{t("admin.blog_editor.preview")}</h2>
            <Segmented
              legend={t("admin.blog_editor.preview_width")}
              hideLegend
              value={width}
              onChange={setWidth}
              options={[
                {
                  value: "phone",
                  label: (
                    <>
                      <Smartphone className="h-4 w-4" aria-hidden="true" />
                      <span className="max-sm:sr-only">{t("admin.blog_editor.preview_phone")}</span>
                    </>
                  ),
                },
                {
                  value: "computer",
                  label: (
                    <>
                      <Monitor className="h-4 w-4" aria-hidden="true" />
                      <span className="max-sm:sr-only">{t("admin.blog_editor.preview_computer")}</span>
                    </>
                  ),
                },
              ]}
            />
            <Segmented
              legend={t("admin.blog_editor.preview_language")}
              hideLegend
              value={lang}
              onChange={setLang}
              options={[
                { value: "ro", label: "RO" },
                { value: "en", label: "EN" },
              ]}
            />
            <div className="ml-auto flex items-center gap-1">
              <a
                href={src}
                target="_blank"
                rel="noopener"
                aria-label={t("admin.blog_editor.preview_open")}
                data-tooltip={t("admin.blog_editor.preview_open")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("admin.close")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-sage/10 p-0 sm:p-4">
            <iframe
              key={src}
              src={src}
              title={t("admin.blog_editor.preview")}
              className={cn(
                "h-full bg-cream shadow-[0_20px_40px_-20px_rgb(0_0_0/0.35)]",
                width === "phone" ? "w-full sm:w-[390px] sm:rounded-2xl" : "w-full sm:rounded-lg"
              )}
            />
          </div>
        </div>
      )}
    </dialog>
  );
}
