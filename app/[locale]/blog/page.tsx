import { useTranslations } from "next-intl";

export default function BlogPage() {
  const t = useTranslations("blog");

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-4 text-charcoal-light">{t("no_posts")}</p>
    </div>
  );
}
