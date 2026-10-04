#!/usr/bin/env node
/**
 * Drives the site that serve.mjs brought up, the way a visitor (or she) would,
 * and prints what is true on the page. Screenshots go to .playwright/verify/shots/.
 *
 *   node .claude/skills/verify/driver.mjs shot <path> [--phone] [--admin] [--full]
 *   node .claude/skills/verify/driver.mjs eval <path> "<js expression>" [--phone] [--admin]
 *   node .claude/skills/verify/driver.mjs book <event-slug> [--email you@example.com] [--phone]
 *   node .claude/skills/verify/driver.mjs mail <address>
 *   node .claude/skills/verify/driver.mjs stats [--reset]
 *
 * --phone is an iPhone 14 in WebKit, the engine most visitors use; the
 * default is desktop Chromium. --admin signs in first, as the seed's admin.
 * --base http://localhost:3100 points it elsewhere.
 *
 * Every page is opened the way that works on this site: the default "load",
 * never "networkidle" (Turnstile keeps a request open forever), then a wait
 * for <next-route-announcer>, which only exists once React has hydrated; a
 * click before that is silently lost.
 */
import { chromium, devices, webkit } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const [command, ...rest] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && ["--email", "--base", "--name", "--linger"].includes(args[i - 1])));
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = option("--base", "http://localhost:3100");
const OUT = join(process.cwd(), ".playwright", "verify");
const SHOTS = join(OUT, "shots");
const ADMIN_STATE = join(OUT, "admin-state.json");
const STRIPE = "http://127.0.0.1:12111";
const POSTHOG = "http://127.0.0.1:12112";
const MAILPIT = "http://127.0.0.1:54324";
mkdirSync(SHOTS, { recursive: true });

const print = (label, value) => console.log(`${label.padEnd(14)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
const slug = (text) => text.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "root";

/**
 * A browser that looks like a person's. Playwright's are flagged as automated
 * (navigator.webdriver, "HeadlessChrome"), and the site's statistics leave
 * automated browsers out, so without this `stats` would never see a visit.
 */
async function openBrowser({ phone = false, state } = {}) {
  const browser = phone ? await webkit.launch() : await chromium.launch();
  const context = await browser.newContext({
    ...(phone ? devices["iPhone 14"] : { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } }),
    baseURL: BASE,
    locale: "ro-RO",
    ...(state ? { storageState: state } : {}),
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
    const data = navigator.userAgentData;
    if (data) {
      const brands = data.brands.filter((b) => !/headless/i.test(b.brand));
      Object.defineProperty(navigator, "userAgentData", { get: () => ({ brands, mobile: data.mobile, platform: data.platform }), configurable: true });
    }
  });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("requestfailed", (r) => {
    // Next prefetches the pages its links lead to and drops them on the next navigation: noise.
    // WebKit calls the same thing "Frame load interrupted" or "cancelled".
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|Frame load interrupted/i.test(r.failure()?.errorText ?? "")) {
      problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`);
    }
  });
  return { browser, context, page, problems };
}

/**
 * A path as typed. Git Bash rewrites an argument that starts with "/" into a
 * Windows path ("/ro" arrives as "C:/Program Files/Git/ro"), so that is
 * undone here, and "ro/events" without the slash works too.
 */
function sitePath(typed) {
  const rewritten = typed.match(/^[A-Za-z]:[\\/].*?[\\/]Git[\\/](.*)$/);
  const path = rewritten ? rewritten[1].replace(/\\/g, "/") : typed;
  return /^https?:\/\//.test(path) || path.startsWith("/") ? path : `/${path}`;
}

/**
 * Opens a path and waits until React has hydrated it and the page has
 * finished loading its own data. Admin pages fetch theirs in the browser after
 * hydrating and show a spinner (.animate-spin) or aria-busy until then; on a
 * public page that is the booking card checking a payment.
 */
async function open(page, typed) {
  const response = await page.goto(sitePath(typed));
  await page.locator("next-route-announcer").waitFor({ state: "attached", timeout: 30_000 });
  await page
    .waitForFunction(() => !document.querySelector('.animate-spin, [aria-busy="true"]'), null, { timeout: 15_000 })
    .catch(() => console.log("[driver] still loading after 15 s; the screenshot shows it as it is"));
  return response;
}

/** Signs in as the seed's admin, reusing the saved session while it still works. */
async function signedInBrowser(phone) {
  const session = await openBrowser({ phone, state: existsSync(ADMIN_STATE) ? ADMIN_STATE : undefined });
  await open(session.page, "/admin");
  if (/\/admin\/login/.test(session.page.url())) {
    await session.page.getByLabel("Email").fill(process.env.TEST_ADMIN_EMAIL ?? "playwright-admin@test.local");
    await session.page.getByLabel("Parolă").fill(process.env.TEST_ADMIN_PASSWORD ?? "playwright-test-password");
    await session.page.getByRole("button", { name: "Autentificare" }).click();
    await session.page.waitForURL(/\/admin$/);
    await session.context.storageState({ path: ADMIN_STATE });
  }
  return session;
}

async function summary(page, response, problems, shotName, full) {
  const file = join(SHOTS, `${shotName}.png`);
  await page.screenshot({ path: file, fullPage: full });
  const facts = await page.evaluate(() => ({
    title: document.title,
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim()).filter(Boolean),
    // Links styled as buttons must be links, never a button inside a link or the reverse.
    nestedInteractive: document.querySelectorAll("a button, button a").length,
  }));
  print("url", page.url());
  print("status", response?.status() ?? "(no response)");
  print("title", facts.title);
  print("h1", facts.h1);
  print("nested a/button", facts.nestedInteractive);
  print("problems", problems.length ? problems : "none");
  print("screenshot", file);
}

async function shot(path) {
  const session = flag("--admin") ? await signedInBrowser(flag("--phone")) : await openBrowser({ phone: flag("--phone") });
  const response = await open(session.page, path);
  // The statistics load a few seconds after the page and send in batches:
  // --linger 8 keeps the page open long enough for `stats` to see the visit.
  const linger = Number(option("--linger", "0"));
  if (linger) await session.page.waitForTimeout(linger * 1000);
  await summary(session.page, response, session.problems, option("--name", `${flag("--phone") ? "phone" : "desktop"}-${slug(sitePath(path))}`), flag("--full"));
  await session.browser.close();
}

async function evaluate(path, expression) {
  const session = flag("--admin") ? await signedInBrowser(flag("--phone")) : await openBrowser({ phone: flag("--phone") });
  await open(session.page, path);
  console.log(JSON.stringify(await session.page.evaluate(expression), null, 2));
  if (session.problems.length) print("problems", session.problems);
  await session.browser.close();
}

/** Scrolls an element to the middle of the screen, clear of the fixed top bar. */
const centre = (locator) => locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));

/**
 * Books a place on an event through its page, as a visitor: the free form, a
 * paid one through the Stripe stand-in's payment page, or the waiting list
 * when it is full. The Turnstile test keys pass on their own.
 */
async function book(eventSlug) {
  const email = option("--email", `verify-${Date.now()}@example.com`);
  const phone = flag("--phone");
  const { browser, page, problems } = await openBrowser({ phone });
  const name = `${phone ? "phone" : "desktop"}-book-${slug(eventSlug)}`;
  await open(page, `/ro/events/${eventSlug}`);

  const waitlist = page.getByRole("button", { name: "Intră pe lista de așteptare" });
  if (await waitlist.count()) await waitlist.click();
  await page.locator('[data-verified="true"]').waitFor({ state: "attached", timeout: 30_000 });
  await page.getByLabel("Nume complet").fill("Verify Visitor");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Telefon", { exact: true }).fill("0722000111");
  // On a phone the booking card is below the description: bring it into the picture.
  await centre(page.getByLabel("Nume complet"));
  await page.screenshot({ path: join(SHOTS, `${name}-1-form.png`) });

  const submit = page.getByRole("button", { name: /^(Înscrie-te gratuit|Continuă la plată|Înscrie-te pe lista de așteptare)$/ });
  const label = (await submit.textContent())?.trim();
  await submit.click();

  // Whichever comes first: Stripe's page, the outcome card, or a refusal under
  // the form (one seat per email per event, sold out meanwhile, a bad phone…).
  const outcome = page.locator("[role=status] h2").first();
  const refusal = page.locator('p.text-error[role="alert"]').first();
  const settled = () =>
    Promise.any([
      outcome.waitFor({ timeout: 30_000 }).then(() => "outcome"),
      refusal.waitFor({ timeout: 30_000 }).then(() => "refused"),
    ]);
  let result = await Promise.any([
    page.waitForURL(/127\.0\.0\.1:12111\/pay\//, { timeout: 30_000 }).then(() => "stripe"),
    settled(),
  ]);
  if (result === "stripe") {
    await page.screenshot({ path: join(SHOTS, `${name}-2-stripe.png`) });
    await page.getByRole("button", { name: "Plătește" }).click();
    await page.waitForURL((url) => url.origin === new URL(BASE).origin, { timeout: 30_000 });
    result = await settled();
  }
  const shown = result === "refused" ? refusal : outcome;
  await centre(shown);
  await page.screenshot({ path: join(SHOTS, `${name}-3-${result}.png`) });
  print("pressed", label);
  print("email", email);
  print(result, (await shown.textContent())?.trim());
  print("problems", problems.length ? problems : "none");
  print("screenshots", join(SHOTS, `${name}-*.png`));
  await browser.close();
}

/** What the local mailbox (Mailpit) holds for an address, newest first, with the newest one's text. */
async function mail(address) {
  const search = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)).json();
  const messages = search.messages ?? [];
  if (!messages.length) return print("mail", `nothing for ${address}`);
  for (const m of messages) print(m.Created?.slice(0, 19) ?? "", m.Subject);
  const latest = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
  console.log(`\n${latest.Text}`);
}

/** The site's own properties on its events (lib/analytics.ts, AnalyticsEvents); PostHog adds dozens more. */
const OWN = ["event_slug", "phase", "paid", "sold_out", "waitlist", "via", "reason", "post_slug", "reading_minutes"];

/** What the PostHog stand-in received: one line per event. */
async function stats() {
  if (flag("--reset")) {
    await fetch(`${POSTHOG}/__control`, { method: "POST" });
    return print("stats", "cleared");
  }
  const events = await (await fetch(`${POSTHOG}/__events`)).json();
  if (!events.length) return print("stats", "nothing received (a page sends a few seconds after it loads)");
  for (const e of events) {
    const own = Object.fromEntries(OWN.filter((k) => k in e.properties).map((k) => [k, e.properties[k]]));
    console.log(`${e.event.padEnd(18)} ${String(e.properties.$current_url ?? "").replace(BASE, "")}  ${Object.keys(own).length ? JSON.stringify(own) : ""}`);
  }
}

const commands = { shot, eval: evaluate, book, mail, stats };
if (!commands[command]) {
  console.log("usage: driver.mjs shot|eval|book|mail|stats … (see the top of this file)");
  process.exit(1);
}
try {
  await commands[command](...rest);
} catch (error) {
  console.error(`[driver] ${command} failed: ${error.message}`);
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/.test(error.message)) {
    console.error("[driver] is the site up? node .claude/skills/verify/serve.mjs, and wait for READY");
  }
  process.exit(1);
}
