import type { Metadata } from "next";
import { getSiteContent } from "@/lib/site-content";
import { PostPreview } from "./post-preview";

/**
 * A blog post as it will look once published: the unpublished version, in the
 * public site's own layout. The admin's editor opens it in a frame
 * (Previzualizare), at phone or computer width, in either language.
 *
 * WHY THE POST IS READ IN THE BROWSER
 *
 * Only the admin may read an unpublished post, so this needs her session. A
 * public page must not read the session on the server: a Server Component
 * that finds an expired token makes Supabase refresh it and write a cookie,
 * which it may not do, and the request hangs until Vercel answers 504
 * (CLAUDE.md, "Public pages must not use lib/supabase/server.ts"). The browser
 * client refreshes its own session safely, and the row policies decide what it
 * may read: anyone else gets a page saying preview is for the admin.
 *
 * This server part only fetches what is public anyway, the blog's default
 * author. next.config.ts lets this path, alone, be framed by the site itself.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const content = await getSiteContent(locale);
  return (
    <PostPreview
      id={id}
      locale={locale}
      defaultAuthor={content["blog.default_author"] || content["seo.person_name"] || null}
    />
  );
}
