import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { ADMIN_STATE } from "./tests/auth-state";

/**
 * Minimal .env reader — Playwright's config runs before Next.js loads, so the
 * app's own env handling is not available here.
 *
 * Order matters: the first file to define a variable wins, because of the
 * `!(match[1] in process.env)` check. `.env.test` is read first so it overrides
 * the development values in `.env.local` / `.env`. That is what keeps the suite
 * pointed at the local database instead of production.
 */
function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}

loadEnvFile(".env.test");
loadEnvFile(".env.local");
loadEnvFile(".env");

// Tests run against a production build by default. Dev mode behaves differently
// in ways that have already hidden a real bug: notFound() returns HTTP 200 in
// dev but 404 in production, so a test written against dev asserted the wrong
// thing. Set PW_DEV=1 for a faster feedback loop while writing tests.
const useDevServer = process.env.PW_DEV === "1";

export default defineConfig({
  testDir: "./tests",
  // Requests every route once so the tests do not pay for cold starts. See the
  // file for why this was needed.
  globalSetup: "./tests/global-setup.ts",
  fullyParallel: true,
  // Two, not three. The suite drives two browser engines against a production
  // build while a local Postgres runs in Docker alongside it; at three workers
  // WebKit was being killed mid-test ("Target page, context or browser has been
  // closed") and taking unrelated specs down with it. Every one of those failures
  // passed when re-run on its own. A suite that is green because it is honest is
  // worth more than one that is fast and intermittently red.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One retry everywhere, not just on CI. Browser processes do occasionally die
  // for reasons that have nothing to do with the code, and a developer who sees
  // a red suite they cannot reproduce learns to ignore red suites.
  retries: 1,
  // `github` annotates the failing lines in the PR diff; `list` keeps the raw
  // log readable. `html` exists only so CI has something to attach — the
  // workflow uploads `playwright-report/` on failure, and without this reporter
  // that directory is never created, so every red build ended with "No files
  // were found with the provided path" and no trace to open.
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    navigationTimeout: 30_000,
    locale: "ro-RO",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: useDevServer
      ? "npm run dev -- -p 3100"
      : "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    // A cold production build takes a while on CI.
    timeout: 300_000,
    // Passed explicitly rather than relying on inheritance. Next.js loads its
    // own .env.local and .env, and working out which source wins is exactly the
    // kind of ambiguity that ends with a test run quietly pointed at the
    // production database. Naming them here removes the question.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY!,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY!,
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY!,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET!,
      RESEND_API_KEY: process.env.RESEND_API_KEY!,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL!,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      RATE_LIMIT_MULTIPLIER: process.env.RATE_LIMIT_MULTIPLIER ?? "200",
    },
  },
  projects: [
    {
      // Signs in once and saves the session for the `admin` project below.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Public pages, plus admin-login.spec.ts which needs to start signed out.
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // Chromium-only: the share button falls back to writing the URL to the
        // clipboard when navigator.share is unavailable. WebKit rejects these
        // permission names outright, which is why they cannot live in the
        // shared `use` block.
        permissions: ["clipboard-read", "clipboard-write"],
      },
      // All admin specs live in their own projects below.
      testIgnore: [/auth\.setup\.ts/, /admin-.*\.spec\.ts/],
    },
    {
      // Admin panel, already authenticated via the saved session.
      name: "admin",
      dependencies: ["setup"],
      testMatch: /admin-(?!login).*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: ADMIN_STATE,
      },
    },
    {
      // The sign-in/sign-out spec, deliberately last and starting signed out.
      //
      // It has to run after the `admin` project rather than alongside it,
      // because one of its tests logs out — and supabase.auth.signOut()
      // defaults to `scope: 'global'`, which revokes every refresh token the
      // user holds, not just this browser's. Running it in parallel therefore
      // invalidated the shared session mid-flight and took the entire admin
      // suite down with it.
      //
      // Sequencing it fixes the coupling without weakening sign-out: "log me
      // out everywhere" is the behaviour you want from an admin panel if a
      // device goes missing.
      name: "admin-auth",
      dependencies: ["admin"],
      testMatch: /admin-login\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // The instructor markets entirely on Instagram, so most real visitors
      // arrive on a phone — very often inside Instagram's in-app browser, which
      // on iOS is a WKWebView. iPhone 14 runs the same WebKit engine, making
      // this much closer to the typical visitor than desktop Chrome ever was.
      name: "mobile",
      use: { ...devices["iPhone 14"] },
      // Public pages only. The admin panel is a desktop tool the instructor
      // uses at a computer, and its layout collapses the sidebar below `lg`,
      // so running those specs here would test a screen nobody administers
      // from.
      testIgnore: [/auth\.setup\.ts/, /admin-.*\.spec\.ts/],
    },
  ],
});
