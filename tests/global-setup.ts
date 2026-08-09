import type { FullConfig } from "@playwright/test";

/**
 * Warms the server once before any test runs.
 *
 * Playwright considers the web server "ready" as soon as `/` responds, but
 * every other route is still cold: on a production build each dynamic page
 * compiles its module graph and opens its first database connection on the
 * initial request. With three workers starting at once, several tests land on
 * cold routes simultaneously and a simple page load was taking 10-20 seconds —
 * long enough to trip the navigation timeout and fail for reasons that have
 * nothing to do with the code under test.
 *
 * Requesting each route once, sequentially, moves that cost out of the tests.
 * It also surfaces a genuinely broken route immediately and clearly, instead of
 * as a puzzling timeout inside an unrelated spec.
 */
async function globalSetup(config: FullConfig) {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3100";

  const routes = [
    "/ro",
    "/en",
    "/ro/events",
    "/ro/blog",
    "/ro/testimonials",
    "/ro/contact",
    "/en/events",
    "/en/blog",
    "/en/testimonials",
    "/en/contact",
    "/admin/login",
    "/sitemap.xml",
    "/robots.txt",
  ];

  for (const route of routes) {
    try {
      await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(60_000) });
    } catch {
      // A failure here is not fatal — the route's own test will report it
      // properly. Warming is best effort.
    }
  }
}

export default globalSetup;
