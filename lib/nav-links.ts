/**
 * The site's sections, in the order they are offered.
 *
 * One list, three renderings: the bar across the top, the drawer behind the
 * hamburger, and the index in the footer. It lived inside header.tsx until the
 * footer needed it too, and a second copy is how two navigations quietly stop
 * agreeing — a page added to one and forgotten in the other is invisible until
 * somebody notices the footer is short.
 *
 * `key` is the translation key under `nav`, not a label. The words are in
 * messages/*.json so they can be translated; only the structure is here.
 *
 * Plain data with no imports, so a Server Component and a client component can
 * both read it without dragging the other's runtime along.
 */
export const NAV_LINKS = [
  { href: "/", key: "home" },
  { href: "/about", key: "about" },
  { href: "/blog", key: "blog" },
  { href: "/events", key: "events" },
  { href: "/testimonials", key: "testimonials" },
  { href: "/contact", key: "contact" },
] as const;

export type NavLink = (typeof NAV_LINKS)[number];
