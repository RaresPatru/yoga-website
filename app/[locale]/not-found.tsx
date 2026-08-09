import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/lib/button-styles";

/**
 * The page shown when an event or article does not exist.
 *
 * Two reasons this file exists.
 *
 * 1. WHAT THE VISITOR SAW. Without it, Next.js falls back to its built-in
 *    error page: unstyled, in English, on a Romanian site, with no way back.
 *    Someone following a stale link from an Instagram story — a deleted event,
 *    a mistyped slug — hit a dead end.
 *
 * 2. WHAT GOOGLE SAW. A page that returns HTTP 200 while displaying "not
 *    found" is a *soft 404*. Search engines treat the 200 as "this is a real
 *    page" and may index it, so deleted events accumulate as thin duplicate
 *    results. Declaring a not-found boundary is what lets Next attach the
 *    correct 404 status to the response rather than serving the fallback at
 *    200.
 *
 * Note that `not-found.tsx` receives no params — Next.js does not pass them to
 * error boundaries — so the locale comes from next-intl's request context,
 * which the middleware in proxy.ts has already resolved from the URL.
 */
export default async function NotFound() {
  const locale = await getLocale();
  const ro = locale === "ro";

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-serif text-6xl text-rose-deep">404</p>

      <h1 className="mt-6 font-serif text-3xl text-charcoal md:text-4xl">
        {ro ? "Pagina nu a fost găsită" : "Page not found"}
      </h1>

      <p className="mt-4 text-charcoal-light">
        {ro
          ? "Poate evenimentul s-a încheiat, sau linkul are o greșeală. Hai să te ducem înapoi."
          : "The event may have finished, or the link may have a typo. Let's get you back."}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {/*
          Styled as buttons via buttonClasses rather than <Button asChild>.
          asChild clones its child, which silently does not work across a
          Server Component boundary — it renders a <button> wrapped around the
          link instead. See lib/button-styles.ts.
        */}
        <Link href="/events" className={buttonClasses({ size: "lg" })}>
          {ro ? "Vezi evenimentele" : "See the events"}
        </Link>
        <Link href="/" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          {ro ? "Înapoi la pagina principală" : "Back to the home page"}
        </Link>
      </div>
    </div>
  );
}
