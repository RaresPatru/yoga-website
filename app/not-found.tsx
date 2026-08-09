import Link from "next/link";
import { buttonClasses } from "@/lib/button-styles";

/**
 * Root not-found boundary.
 *
 * Handles two cases:
 *
 *  - a URL that matches no route at all (`/complete-nonsense`), which never
 *    enters the `[locale]` segment and so cannot use its layout or its
 *    translations;
 *  - `notFound()` thrown from inside a page, which Next resolves to the
 *    nearest boundary — and with next-intl's routing that resolution lands
 *    here rather than at `app/[locale]/not-found.tsx`.
 *
 * Because it renders outside `[locale]/layout.tsx` there is no next-intl
 * request context and no `useTranslations`, so the copy is written bilingually
 * rather than translated. That is a deliberate trade: a plain page in both
 * languages beats a crash or an English-only stock error page.
 *
 * Getting a boundary in place is also what attaches the correct 404 status to
 * the response. Without one, these URLs answered HTTP 200 while displaying
 * "not found" — a soft 404, which search engines treat as a real page and may
 * index, so deleted events would pile up as thin duplicate results.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-serif text-6xl text-rose-deep">404</p>

      <h1 className="mt-6 font-serif text-3xl text-charcoal md:text-4xl">
        Pagina nu a fost găsită
      </h1>
      <p className="mt-2 text-lg text-charcoal-light">Page not found</p>

      <p className="mt-6 text-charcoal-light">
        Poate evenimentul s-a încheiat, sau linkul are o greșeală.
        <br />
        <span className="text-sm">
          The event may have finished, or the link may have a typo.
        </span>
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/ro/events" className={buttonClasses({ size: "lg" })}>
          Vezi evenimentele
        </Link>
        <Link href="/ro" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Pagina principală
        </Link>
      </div>
    </div>
  );
}
