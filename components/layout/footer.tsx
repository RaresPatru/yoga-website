import { getTranslations } from "next-intl/server";
import { SITE_NAME } from "@/lib/site-config";
import { getSiteContent } from "@/lib/site-content";
import { socialUrl, type SocialNetwork } from "@/lib/social";

/**
 * The site footer, and the only place the social links come out.
 *
 * Both icons used to be `href="#"` — hardcoded, going nowhere, on every page.
 * The admin panel has had a field for the Instagram address since the beginning
 * and nothing ever read it, so the effect was a section in her content screen
 * that appeared to do nothing. It now feeds these two links.
 *
 * An icon with no address behind it is simply not rendered. A social button that
 * looks live and goes nowhere is the same failure as an invented statistic: it
 * tells a visitor something about the business that is not true. The whole
 * "follow me" block disappears when she has filled in neither.
 *
 * Async, and therefore a Server Component: it reads from the database. That is
 * why the translations come from `getTranslations` rather than the
 * `useTranslations` hook — hooks cannot be called in an async component.
 */

const ICONS: Record<SocialNetwork, { label: string; path: string }> = {
  instagram: {
    label: "Instagram",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  facebook: {
    label: "Facebook",
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  },
};

export async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations("footer");
  const content = await getSiteContent(locale);

  const links = (
    [
      ["instagram", content["contact.instagram_url"]],
      ["facebook", content["contact.facebook_url"]],
    ] as const
  )
    .map(([network, value]) => ({ network, href: socialUrl(value, network) }))
    .filter((link): link is { network: SocialNetwork; href: string } =>
      Boolean(link.href)
    );

  return (
    <footer className="mt-auto border-t border-sage/20 bg-white/40">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <p className="text-sm text-charcoal-light">
          &copy; {new Date().getFullYear()} {SITE_NAME}. {t("rights")}
        </p>
        {links.length > 0 && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-charcoal-light">{t("follow")}</p>
            <div className="flex gap-3">
              {links.map(({ network, href }) => (
                <a
                  key={network}
                  href={href}
                  // Her account lives on somebody else's site, so it opens in
                  // its own tab. `noopener` is what stops that tab from reaching
                  // back into this one through `window.opener`.
                  target="_blank"
                  rel="noopener noreferrer me"
                  className="rounded-full bg-white/60 p-2 text-charcoal-light transition-colors hover:bg-rose/10 hover:text-rose-deep"
                  aria-label={ICONS[network].label}
                >
                  <svg
                    className="h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d={ICONS[network].path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
