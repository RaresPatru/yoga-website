import { useTranslations } from "next-intl";

export default function ContactPage() {
  const t = useTranslations("contact");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-2 text-charcoal-light">{t("subtitle")}</p>
    </div>
  );
}
