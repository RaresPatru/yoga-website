import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalDocument, getSiteContent, getSiteName } from "@/lib/site-content";
import { FIELDS } from "@/lib/site-content-schema";
import { fillLegalTokens } from "@/lib/legal";
import { sanitizeHtml } from "@/lib/sanitize";
import { buildPageMetadata } from "@/lib/metadata";
import { absoluteUrl, siteUrl } from "@/lib/site-config";
import { formatDate } from "@/lib/utils";
import { TextPlaceholder } from "@/components/ui/content-placeholder";

export type LegalKind = "privacy" | "terms" | "cookies";

const KEYS = {
  privacy: "legal.privacy",
  terms: "legal.terms",
  cookies: "legal.cookies",
} as const;

function titleOf(kind: LegalKind, locale: string): string {
  return FIELDS[KEYS[kind]].label[locale === "en" ? "en" : "ro"];
}

export async function legalMetadata(kind: LegalKind, locale: string): Promise<Metadata> {
  return buildPageMetadata({
    title: titleOf(kind, locale),
    path: `/${kind}`,
    locale,
    image: absoluteUrl(`/api/og/default?locale=${locale}`),
  });
}

/**
 * One of the three legal pages, written by her (from a draft) in "Conținut
 * site" → "Pagini legale".
 *
 * The date under the title is when the document's row was last saved, which
 * the database keeps current by itself (the updated_at trigger), so it cannot
 * be forgotten.
 */
export async function LegalDocument({ kind, locale }: { kind: LegalKind; locale: string }) {
  if (locale !== "ro" && locale !== "en") notFound();
  const [document, content, siteName] = await Promise.all([
    getLegalDocument(KEYS[kind], locale),
    getSiteContent(locale),
    getSiteName(locale),
  ]);
  const title = titleOf(kind, locale);
  const ro = locale === "ro";

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal md:text-5xl">{title}</h1>
      {document ? (
        <>
          <p className="mt-3 text-sm text-charcoal-light">
            {ro ? "Ultima actualizare: " : "Last updated: "}
            <time dateTime={document.updatedAt}>{formatDate(document.updatedAt, locale)}</time>
          </p>
          <div
            className="prose mt-8 max-w-none text-charcoal-light prose-headings:font-serif prose-headings:font-normal prose-headings:text-charcoal prose-a:text-rose-deep prose-strong:text-charcoal"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(
                fillLegalTokens(document.html, content, locale, { siteName, siteUrl: siteUrl() })
              ),
            }}
          />
        </>
      ) : (
        <div className="mt-8">
          <TextPlaceholder label={title} />
        </div>
      )}
    </article>
  );
}
