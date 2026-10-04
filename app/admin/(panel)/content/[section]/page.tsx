import { notFound } from "next/navigation";
import { sectionById } from "@/lib/site-content-schema";
import { ContentScreen } from "@/components/admin/content/content-screen";

/** One section of "Conținut site", at /admin/content/<section>. */
export default async function ContentSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sectionById(section)) notFound();
  return <ContentScreen sectionId={section} />;
}
