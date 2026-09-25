"use client";

import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/admin/ui/segmented";
import { useAdminLocale } from "@/components/admin/locale-provider";

/**
 * The bar above a site-content form: the RO / EN switch with how much
 * English is filled in, the "translate everything" button while editing
 * English, whether there are unsaved changes, and Save.
 *
 * It sticks under the admin's top bar, so Save is in reach at the bottom of a
 * long section such as the home page.
 */
export function FormBar({
  mode,
  onMode,
  english,
  dirty,
  saving,
  translating,
  onTranslate,
  canTranslate,
  bilingual = true,
}: {
  mode: "ro" | "en";
  onMode: (mode: "ro" | "en") => void;
  /** Translatable fields with English written, out of those with Romanian written. */
  english: { filled: number; total: number };
  dirty: boolean;
  saving: boolean;
  translating: boolean;
  onTranslate: () => void;
  canTranslate: boolean;
  /** False for a section with nothing to translate (names, addresses, pictures). */
  bilingual?: boolean;
}) {
  const { t } = useAdminLocale();
  return (
    <div className="sticky top-(--admin-header-h) z-20 -mx-4 mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-sage/20 bg-cream/90 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
      {bilingual && (
        <Segmented
          legend={t("admin.cms.language")}
          hideLegend
          value={mode}
          onChange={onMode}
          options={[
            { value: "ro", label: "RO" },
            {
              value: "en",
              label: (
                <>
                  EN
                  {english.total > 0 && (
                    <span className="text-xs opacity-80">
                      {english.filled}/{english.total}
                    </span>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
      {bilingual && mode === "en" && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onTranslate}
          disabled={translating || !canTranslate}
        >
          {translating ? (
            <Loader2
              className="mr-1.5 h-4 w-4 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Languages className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {translating
            ? t("admin.translating")
            : t("admin.cms.translate_missing")}
        </Button>
      )}
      <div className="ml-auto flex items-center gap-3">
        <p className="text-sm text-charcoal-light" role="status">
          {dirty ? t("admin.cms.unsaved") : t("admin.cms.all_saved")}
        </p>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? t("admin.saving") : t("admin.cms.save")}
        </Button>
      </div>
    </div>
  );
}
