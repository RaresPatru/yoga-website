import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

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
  const isDev = process.env.NODE_ENV !== "production";

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
  const devSocket = isDev ? " ws://localhost:* http://localhost:*" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com https://*.posthog.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin} https://media.istockphoto.com https://*.posthog.com`,
    `media-src 'self' blob: ${supabaseOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} https://*.posthog.com https://challenges.cloudflare.com${devSocket}`,
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
