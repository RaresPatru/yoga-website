"use client";

import { use } from "react";
import Link from "next/link";
import { adminErrorKey } from "@/lib/admin/db";
import { defaultAuthor, loadPost } from "@/lib/admin/blog";
import { useAdminData } from "@/lib/admin/use-admin-data";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { PostEditor } from "@/components/admin/blog/post-editor";

/** An existing post, with any unpublished changes it has. */
export default function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useAdminLocale();
  const { data, error, loading } = useAdminData(
    async () => {
      const [post, author] = await Promise.all([loadPost(id), defaultAuthor()]);
      return { post, author };
    },
    id
  );

  if (loading) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (error) {
    return (
      <p role="alert" className="text-error">
        {t(adminErrorKey(error))}
      </p>
    );
  }
  if (!data?.post) {
    return (
      <div className="py-16 text-center">
        <p className="text-charcoal-light">{t("admin.blog_editor.not_found")}</p>
        <Link href="/admin/blog" className="mt-4 inline-block text-rose-deep underline underline-offset-2">
          {t("admin.blog_editor.back")}
        </Link>
      </div>
    );
  }
  // Keyed by id, so opening another post starts a fresh editor.
  return <PostEditor key={id} initial={data.post} defaultAuthor={data.author} />;
}
