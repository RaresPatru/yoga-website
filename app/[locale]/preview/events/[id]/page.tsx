import type { Metadata } from "next";
import { EventPreview } from "./event-preview";

/**
 * An event as it will look once published: the unpublished version, in the
 * public site's own layout. The admin's event editor opens it in a frame
 * (Previzualizare).
 *
 * The event is read in the browser, with her session, for the reason given in
 * app/[locale]/preview/blog/[id]/page.tsx: a public page must not read the
 * session on the server. Anyone who is not the admin gets a page saying
 * preview is for the administrator. next.config.ts lets this path, alone, be
 * framed by the site itself.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewEventPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  return <EventPreview id={id} locale={locale} />;
}
