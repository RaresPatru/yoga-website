/**
 * Turns what she typed into the `events.map_link` field into something safe to
 * put in an `href`.
 *
 * THIS IS A SECURITY BOUNDARY, NOT A CONVENIENCE
 *
 * The value is free text from the admin panel and its whole purpose is to end
 * up as the destination of a link on a public page. `javascript:alert(1)` is a
 * perfectly good URL as far as `new URL()` is concerned, and a `data:` URL can
 * carry a whole HTML document. So the scheme is checked against a list of two
 * rather than against a list of things to reject — an allowlist cannot be
 * out-thought by a scheme nobody here has heard of.
 *
 * Unrecognised input returns null and the address renders as plain text. That
 * is deliberately not an error shown to a visitor: a link that goes nowhere is
 * worse than no link, and she is the only person who can fix it anyway.
 */

/**
 * A bare coordinate pair: "46.7712, 23.5949", give or take whitespace and a
 * leading minus. Longitude has three integer digits to allow for, latitude two.
 */
const COORDINATE_PAIR = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** The only two schemes that may reach an href from this field. */
const SAFE_SCHEMES = ["http:", "https:"];

export interface MapTarget {
  /** Where the address on the page should link to. */
  href: string;
}

/**
 * @param mapLink the `map_link` column: a pasted URL, a coordinate pair, or null
 */
export function mapTarget(mapLink: string | null | undefined): MapTarget | null {
  const raw = mapLink?.trim();
  if (!raw) return null;

  const coordinates = raw.match(COORDINATE_PAIR);
  if (coordinates) {
    const latitude = Number(coordinates[1]);
    const longitude = Number(coordinates[2]);
    // A pair that parses but cannot exist is a typo, and sending somebody to
    // latitude 95 would open a map of nowhere with no hint why.
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

    const pin = `${latitude},${longitude}`;
    return {
      /*
       * `/maps/search/?api=1` is Google's documented cross-platform URL. On
       * Android and on an iPhone with the app installed it opens the app; on
       * everything else it opens the web map. It never opens Apple Maps — an
       * iPhone without Google Maps gets Google in Safari, which works and
       * offers directions. Switching Apple devices to `maps.apple.com` would
       * need the platform read in the browser, and would only apply to
       * coordinates: a link she pasted has to be used as given.
       */
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pin)}`,
    };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a coordinate pair and not a URL — most likely a half-pasted link.
    return null;
  }

  if (!SAFE_SCHEMES.includes(url.protocol)) return null;

  return { href: url.toString() };
}
