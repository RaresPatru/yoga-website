import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { contentText, getSiteContent, getSiteName, navLabels } from "@/lib/site-content";
import { NAV_LINKS } from "@/lib/nav-links";
import { socialUrl, type SocialNetwork } from "@/lib/social";

/**
 * The site footer: the sections index, the social links, and the copyright.
 *
 * WHY THE SECTIONS ARE DOWN HERE AS WELL AS UP THERE
 *
 * Not for symmetry. On a phone the top bar renders none of them: the link row
 * is `hidden lg:flex` and the drawer is `display: none` until it is opened, so
 * an audit of a rendered phone page found twenty anchors of which eight had a
 * box, and every single one of the eight was a blog post. Twelve links to the
 * site's own sections existed in the markup and none of them was drawn.
 *
 * That is normal for a hamburger menu and mostly fine for people, who know what
 * the three lines mean. It is less fine for Google, which indexes the rendered
 * mobile page — so the version being evaluated had no internal navigation at
 * all, and no route at all to the home page once the wordmark stopped being a
 * link. Discovery was never at risk (the sitemap lists every page); the weight
 * the site passes to its own sections was.
 *
 * So the footer carries them, at every width, in real markup. It is also the
 * honest answer for a visitor at the bottom of a long article who wants to go
 * somewhere else and would otherwise have to scroll all the way back up.
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
  tiktok: {
    label: "TikTok",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  linkedin: {
    label: "LinkedIn",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
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
  const nav = await getTranslations("nav");
  const content = await getSiteContent(locale);
  /* Same request-cached table the line above just read. */
  const siteName = await getSiteName(locale);

  const labels = navLabels(content, locale);
  const links = (
    [
      ["instagram", content["contact.instagram_url"]],
      ["facebook", content["contact.facebook_url"]],
      ["tiktok", content["contact.tiktok_url"]],
      ["linkedin", content["contact.linkedin_url"]],
    ] as const
  )
    .map(([network, value]) => ({ network, href: socialUrl(value, network) }))
    .filter((link): link is { network: SocialNetwork; href: string } =>
      Boolean(link.href)
    );

  return (
    <footer className="mt-auto border-t border-sage/20 bg-white/40">
      {/*
        SIX LINKS ARE A LINE, NOT A DIRECTORY

        The reflex for "put the navigation in the footer" is the four-column
        sitemap with a tracked-out heading over each column. That shape exists to
        impose order on forty links across four unrelated groups. This site has
        six, all of one kind, and columns would invent a hierarchy that is not
        there — plus three headings naming categories that do not exist.

        So it is one row that wraps, reading as a sentence of places to go.

        A real <ul>: it hands assistive technology a count before the first item
        and a single gesture to skip the whole group, which a run of loose <a>
        elements does not. Safari drops list semantics from a `display: flex`
        list with no markers — but only OUTSIDE a <nav>, and this is inside one,
        so no `role="list"` patch is needed. That exemption is worth knowing
        rather than guessing at, on the browser most of this audience uses.

        The label is "Secțiunile site-ului", not "Navigare secțiuni": a <nav> is
        already announced as a navigation, so naming it one reads back as
        "navigation navigation".
      */}
      <nav
        aria-label={nav("landmark.sections")}
        className="mx-auto max-w-7xl px-6 pt-8"
      >
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 md:justify-start">
          {NAV_LINKS.map(({ href, key }) => (
            <li key={key}>
              {/*
                The underline that gains a colour, borrowed from the wordmark
                rather than the bar's pill.

                Six filled pills in a row would make the quietest part of the
                page the busiest. An underline is what a footer link has looked
                like since before any of this, and because the rule is already
                there and only transparent, nothing moves when it arrives — the
                same reason the wordmark uses it.

                Darkening the text as well is the second cue. It is the pattern
                the bar uses (wash plus darker text) with the wash swapped for
                something appropriate to the density down here, and it means the
                hover does not depend on colour alone.
              */}
              <Link
                href={href}
                className="rounded-sm text-sm text-charcoal-light underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:text-charcoal hover:decoration-sage-deep"
              >
                {labels[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-sage/15 px-6 py-6 mt-8 md:flex-row">
        <p className="text-sm text-charcoal-light">
          &copy; {new Date().getFullYear()} {siteName}. {contentText(content, "footer.rights", locale)}
        </p>
        {links.length > 0 && (
          <div className="flex items-center gap-4">
            <p className="text-sm text-charcoal-light">{contentText(content, "footer.follow", locale)}</p>
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

      {/*
        The legal pages, and the ANPC pictogram Romanian consumer law requires
        on a site that sells to consumers: 250×50 px, linking to the
        alternative dispute resolution platform (ANPC Order 449/2022, as
        amended by Order 270/2026). The official image is hers to upload in
        "Conținut site" → "Pagini legale"; until then the same link stands as
        text, so the obligation is met in substance and nothing invented
        stands in for the official artwork.
      */}
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 border-t border-sage/15 px-6 py-5 md:flex-row md:justify-between">
        <nav aria-label={t("legal")}>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
            {(["privacy", "terms", "cookies"] as const).map((page) => (
              <li key={page}>
                <Link
                  href={`/${page}`}
                  className="rounded-sm text-charcoal-light underline decoration-transparent underline-offset-4 transition-colors hover:text-charcoal hover:decoration-sage-deep"
                >
                  {t(page)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <a
          href="https://reclamatiisal.anpc.ro"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm text-sm text-charcoal-light underline underline-offset-4 hover:text-charcoal"
        >
          {content["legal.sal_badge"] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={content["legal.sal_badge"]}
              alt={t("sal")}
              width={250}
              height={50}
              className="h-[50px] w-[250px] max-w-full object-contain"
            />
          ) : (
            t("sal")
          )}
        </a>
      </div>
    </footer>
  );
}
