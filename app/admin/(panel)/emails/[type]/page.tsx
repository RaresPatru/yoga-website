import { notFound } from "next/navigation";
import { isTemplateType } from "@/lib/email-content";
import { TemplateEditor } from "@/components/admin/emails/template-editor";

/** One automatic email, at /admin/emails/<type>, such as /admin/emails/spot_available. */
export default async function EmailTemplatePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isTemplateType(type)) notFound();
  return <TemplateEditor type={type} />;
}
