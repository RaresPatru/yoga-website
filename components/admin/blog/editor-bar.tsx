"use client";

import { forwardRef } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Eye, Languages, Loader2, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/ui/segmented";
import { MenuButton } from "@/components/admin/ui/menu-button";
import { useAdminLocale } from "@/components/admin/locale-provider";

export type SaveState = "new" | "saving" | "saved" | "unsaved" | "failed";

/**
 * The post editor's own bar, stuck under the admin's top bar: Back, whether
 * her work is saved, RO / EN with how much English is written, Preview, the
 * publish button, and a menu with Discard changes and Delete.
 *
 * On a computer it sticks under the admin's top bar. On a phone it scrolls
 * away with the page, because together with the editor's toolbar it would
 * cover half the screen; the toolbar is what she needs while writing there.
 *
 * The publish button says what pressing it would do: "Publică" for a post
 * visitors cannot see yet, "Publică modificările" when a live post has
 * changes visitors do not see, and a disabled "Publicat" when there is
 * nothing to publish.
 */
export const EditorBar = forwardRef<
  HTMLDivElement,
  {
    onBack: () => void;
    save: SaveState;
    saveError: string | null;
    mode: "ro" | "en";
    onMode: (mode: "ro" | "en") => void;
    english: { filled: number; total: number };
    onTranslateMissing: () => void;
    translating: boolean;
    canTranslate: boolean;
    onPreview: () => void;
    canPreview: boolean;
    publish: "publish" | "publish_changes" | "published";
    publishing: boolean;
    onPublish: () => void;
    canDiscard: boolean;
    onDiscard: () => void;
    canDelete: boolean;
    onDelete: () => void;
  }
>(function EditorBar(props, ref) {
  const { t } = useAdminLocale();
  const status = {
    new: t("admin.blog_editor.status_new"),
    saving: t("admin.blog_editor.status_saving"),
    saved: t("admin.blog_editor.status_saved"),
    unsaved: t("admin.blog_editor.status_unsaved"),
    failed: t("admin.blog_editor.status_failed"),
  }[props.save];

  return (
    <div
      ref={ref}
      className="z-30 -mx-4 -mt-6 mb-6 border-b border-sage/20 bg-cream/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8 sm:sticky sm:top-16"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/admin/blog"
          // The editor's own Back, not a link the leave guard should catch.
          data-leave-guard="skip"
          onClick={(event) => {
            // The editor decides where Back goes: it saves first, and throws
            // away a post that was never written in.
            event.preventDefault();
            props.onBack();
          }}
          className="-ml-2 flex h-10 items-center gap-1.5 rounded-full px-2 text-sm text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("admin.blog_editor.back")}
        </Link>

        <p
          role="status"
          data-save-status
          title={props.saveError ?? undefined}
          className={
            props.save === "failed"
              ? "flex items-center gap-1.5 text-sm text-error"
              : "flex items-center gap-1.5 text-sm text-charcoal-light"
          }
        >
          {props.save === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {props.save === "saved" && <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />}
          {props.save === "failed" && <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{status}</span>
          {props.save === "failed" && props.saveError && <span className="sr-only">{props.saveError}</span>}
        </p>

        {/* On a phone the actions take a row of their own, and the menu stays
            up beside Back; wider, everything is one row with the menu last. */}
        <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
          <Segmented
            legend={t("admin.cms.language")}
            hideLegend
            value={props.mode}
            onChange={props.onMode}
            options={[
              { value: "ro", label: "RO" },
              {
                value: "en",
                label: (
                  <>
                    EN
                    {props.english.total > 0 && (
                      <span className="text-xs opacity-80">
                        {props.english.filled}/{props.english.total}
                      </span>
                    )}
                  </>
                ),
              },
            ]}
          />
          {props.mode === "en" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={props.onTranslateMissing}
              disabled={props.translating || !props.canTranslate}
            >
              {props.translating ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Languages className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {props.translating ? t("admin.translating") : t("admin.cms.translate_missing")}
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={props.onPreview} disabled={!props.canPreview}>
            <Eye className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
            <span className="max-sm:sr-only">{t("admin.blog_editor.preview")}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={props.onPublish}
            disabled={props.publish === "published" || props.publishing}
          >
            {props.publishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {props.publish === "published" && <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />}
            {t(`admin.blog_editor.${props.publish}`)}
          </Button>
        </div>
        <div className="ml-auto sm:order-last sm:ml-0">
          <MenuButton
            label={t("admin.blog_editor.more")}
            align="end"
            triggerClassName="flex h-10 w-10 items-center justify-center rounded-full text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
            trigger={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
            items={[
              {
                id: "discard",
                label: t("admin.blog_editor.discard"),
                icon: <RotateCcw className="h-4 w-4" />,
                disabled: !props.canDiscard,
                onSelect: props.onDiscard,
              },
              {
                id: "delete",
                label: t("admin.blog_editor.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                tone: "danger",
                disabled: !props.canDelete,
                onSelect: props.onDelete,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
});
