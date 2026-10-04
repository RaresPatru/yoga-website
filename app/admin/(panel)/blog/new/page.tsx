"use client";

import { adminErrorKey } from "@/lib/admin/db";
import { defaultAuthor } from "@/lib/admin/blog";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { PostEditor } from "@/components/admin/blog/post-editor";

/**
 * A new post. Nothing is created until she writes something; the first save
 * creates the post and the address becomes /admin/blog/<id>.
 */
export default function NewPostPage() {
  const { t } = useAdminLocale();
  const { data: author, error, loading } = useAdminData(defaultAuthor);

  if (loading) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  return <PostEditor initial={null} defaultAuthor={author ?? ""} />;
}
