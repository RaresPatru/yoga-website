import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

/**
 * Whether this process is `next dev`.
 *
 * CLAUDE.md warns against gating behaviour on NODE_ENV, because it reads
 * `production` in a production *build* even when that build points at the local
 * database — so it answers "is this a production build", not "is this the live
 * site". That warning does not bite here: both things below are read only by
 * the dev server, which always sets NODE_ENV to `development`. The question
 * being asked really is "is this a build or the dev server".
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Every address this machine can be reached on, for `allowedDevOrigins` below.
 *
 * Computed rather than written down because it changes: the router hands out a
 * different one whenever the lease expires or the laptop joins another network,
 * and a hardcoded `192.168.1.138` would work until the day it silently did not.
 *
 * Only ever called in development — see the note on `allowedDevOrigins`.
 */
function localAddresses(): string[] {
  const external = Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === "IPv4" && !net.internal)
    .map((net) => net!.address);

  // The loopback is filtered out as `internal` and has to be put back by hand.
  // `127.0.0.1` is the same machine by a different name, so trusting it is
  // exactly as safe as trusting `localhost`, which Next already does — and it
  // is what half the tooling here types.
  return ["127.0.0.1", ...external];
}

/**
 * Content Security Policy.
 *
 * A CSP is an allowlist the browser enforces: it tells the browser which
 * origins may supply scripts, styles, images and so on. If an attacker ever
 * manages to inject a <script> into a page, the browser refuses to run it
 * because the source is not on this list. It is the safety net *behind* input
 * sanitisation, not a replacement for it — you want both, because they fail in
 * different ways.
 *
 * Each entry below exists for a specific reason:
 *
 *   'unsafe-inline' (script)  Next.js inlines a small bootstrap script and the
 *                             serialised server data into the page. Removing
 *                             this needs per-request nonces, which is a
 *                             worthwhile follow-up but not a small change.
 *   'unsafe-eval' (dev only)  React Fast Refresh needs it while developing. It
 *                             is not present in production builds.
 *   'unsafe-inline' (style)   Tailwind and Motion both set inline styles.
 *   challenges.cloudflare.com The Turnstile CAPTCHA widget and its iframe.
 *   *.posthog.com             Analytics.
 *   *.supabase.co             The database/API and the public media bucket.
 *   youtube / vimeo / instagram  Embedded video in blog posts.
 *
 * frame-ancestors 'none' stops the site being loaded inside an iframe on
 * another domain, which is what clickjacking relies on.
 */
function contentSecurityPolicy(): string {

  // The browser talks to Supabase directly (public pages read events, the admin
  // panel signs in), so its origin has to be on the allowlist.
  //
  // Deriving it from the environment rather than hardcoding `https://*.supabase.co`
  // does two things. It pins the policy to THIS project instead of permitting
  // every Supabase project on the internet — a wildcard here would let an
  // injected script exfiltrate to an attacker's own Supabase. And it works
  // locally, where the stack runs on http://127.0.0.1:54321. The wildcard
  // version silently blocked every local request: the pages rendered but were
  // permanently empty, and the admin login did nothing at all.
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    } catch {
      return "";
    }
  })();

  // Realtime/websocket equivalent of the same origin (http -> ws, https -> wss).
  const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");

  // Storage serves uploaded images from the same origin as the API.
  const supabase = [supabaseOrigin, supabaseSocket].filter(Boolean).join(" ");

  // Next.js's dev server uses a websocket for hot reload.
  //
  // Every address this machine answers on, not just `localhost`, for the same
  // reason `allowedDevOrigins` lists them: a phone on the Wi-Fi reaches the dev
  // server as `192.168.x.x`, and a CSP that only names `localhost` would block
  // the socket a second time after Next had been persuaded to accept it.
  // `'self'` arguably covers the same-origin case already; naming them costs
  // nothing and does not depend on how each browser reads that.
  const devSocket = isDev
    ? [
        "",
        ...localAddresses().flatMap((address) => [`ws://${address}:*`, `http://${address}:*`]),
        "ws://localhost:*",
        "http://localhost:*",
      ].join(" ")
    : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://*.posthog.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin} https://media.istockphoto.com https://*.posthog.com`,
    `media-src 'self' blob: ${supabaseOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} https://*.posthog.com https://challenges.cloudflare.com${devSocket}`,
    // Google is deliberately absent. An embedded map was tried here and taken
    // out again: it cost 1.23MB across 39 requests from Google on a page that
    // otherwise contacts them not at all, handed over every visitor's IP address
    // before anyone asked to see a map, and leaned on an undocumented
    // `output=embed` endpoint outside the terms of the Maps Embed API. The
    // address on the event page is a plain link to a map instead, which sends
    // nothing until somebody presses it. Do not re-add this without re-reading
    // that list.
    "frame-src https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    // Restricts where <form action="..."> may submit. Stripe redirects the
    // visitor via a normal navigation rather than a form post, so it does not
    // need listing here.
    "form-action 'self'",
    "object-src 'none'",
    // Tells the browser to rewrite any http:// subresource request to https://.
    //
    // Gated on the backend actually being https rather than on NODE_ENV. A
    // production *build* pointed at a local stack (which is exactly what the
    // test suite runs) still has NODE_ENV=production, so a NODE_ENV check left
    // this directive on and the browser tried to reach the local Supabase over
    // https, where nothing is listening.
    //
    // What made that genuinely nasty: Chromium exempts loopback addresses from
    // the upgrade, so it worked there. WebKit does not, so the event page hung
    // on its loading spinner and rendered an empty <main> — on iPhone only.
    // Since almost every real visitor arrives from Instagram on a phone, a
    // desktop-only test suite would have shipped a site that looked fine to us
    // and was unusable for them.
    ...(supabaseOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const nextConfig: NextConfig = {
  /**
   * WHO MAY TALK TO THE DEV SERVER.
   *
   * Development only — Next ignores this in a production build, and none of it
   * reaches a deployed site.
   *
   * THE BUG THIS FIXES, WHICH DOES NOT LOOK LIKE A NETWORK PROBLEM AT ALL
   *
   * `next dev` trusts exactly one origin out of the box: `localhost`. Open the
   * same dev server by any other name — the phone on the Wi-Fi reaching
   * `http://192.168.1.138:3000`, or even `http://127.0.0.1:3000` on the machine
   * itself — and Next refuses the hot-reload websocket because the `Origin`
   * header does not match. Measured, by replaying the handshake by hand:
   *
   *   Origin: http://localhost:3000     -> 101 Switching Protocols
   *   Origin: http://127.0.0.1:3000     -> connection closed, no response
   *   Origin: http://192.168.1.138:3000 -> connection closed, no response
   *
   * That is a guard against a hostile page on another origin driving your dev
   * server, and it is right to have. What makes it expensive is the symptom:
   * the dev client never finishes bootstrapping without that socket, so React
   * never hydrates, so **nothing on the page is interactive**. The HTML arrives
   * and looks perfect. The menu does not open, the carousel does not move, no
   * form submits, and the console says only that a websocket failed — which
   * reads like a hot-reload nuisance rather than the cause.
   *
   * It is worst exactly where it is hardest to see: testing on a real phone,
   * which can only reach this machine by its LAN address, and which has no
   * console to look at.
   *
   * Listing this machine's own addresses is the supported fix. It widens
   * nothing in production and nothing beyond the interfaces this computer
   * already answers on.
   */
  // Gated, so the helper's "only ever called in development" is true of the
  // code and not just of the comment. Next ignores this key in a build, but
  // calling it there still enumerated the Vercel build container's network
  // interfaces and baked their addresses into the config object.
  allowedDevOrigins: isDev ? localAddresses() : [],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "media.istockphoto.com",
      },
    ],
  },

  async headers() {
    return [
      {
        // Applies to every route.
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy(),
          },
          {
            // Tells browsers to only ever reach this site over HTTPS, for the
            // next two years, including subdomains. Prevents an attacker on a
            // shared network downgrading the first request to plain HTTP.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Stops the browser second-guessing a file's declared type. Without
            // it, a file served as text/plain that happens to look like
            // JavaScript may be executed as JavaScript.
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Older cousin of frame-ancestors, for browsers that predate CSP
            // level 2. Harmless to keep alongside it.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Send the full URL to our own pages, but only the bare domain to
            // third parties — so an event URL someone was reading is not leaked
            // in the Referer header when they click an outbound link.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Switches off browser features the site never uses. If a
            // compromised script tried to open the camera it would be denied at
            // the browser level.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
