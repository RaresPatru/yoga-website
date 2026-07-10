import { useTranslations } from "next-intl";

export default function EventsPage() {
  const t = useTranslations("events");

  return (
    <div className="mx-auto max-w-7xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">{t("title")}</h1>
      <p className="mt-4 text-charcoal-light">{t("no_events")}</p>
    </div>
  );
}
