#!/usr/bin/env node
/**
 * Brings the site up the way the test suite does, for driving by hand:
 * a production build on http://localhost:3100 against the local database,
 * with the suite's stand-ins for Stripe (:12111) and PostHog (:12112)
 * running in this process.
 *
 *   node .claude/skills/verify/serve.mjs --build   # build, then serve
 *   node .claude/skills/verify/serve.mjs           # serve the last build
 *   node .claude/skills/verify/serve.mjs --stop    # stop a running one
 *
 * Prints "READY http://localhost:3100" once the site answers, then keeps
 * running until stopped. Run it in the background; its own log lines and the
 * server's go to stdout.
 *
 * The environment is playwright.config.ts's: .env.test first, then
 * .env.local and .env for anything missing, then the suite's overrides
 * (stand-ins, a placeholder PostHog key, the site's address, the cron
 * secret). NEXT_PUBLIC_* values are baked into the build, so after changing
 * code, or after a build made with other values, build again (--build).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { parseEnv } from "node:util";

const ROOT = process.cwd();
const STATE_DIR = join(ROOT, ".playwright", "verify");
const PID_FILE = join(STATE_DIR, "serve.pid");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const PORT = Number(option("--port", "3100"));
const BASE = `http://localhost:${PORT}`;
const log = (...parts) => console.log("[serve]", ...parts);

/** Ends a process and everything it started (npm on Windows starts a cmd, which starts node). */
function killTree(pid) {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
}

if (flag("--stop")) {
  if (!existsSync(PID_FILE)) {
    log("nothing to stop (no", PID_FILE, ")");
    process.exit(0);
  }
  const pid = Number(readFileSync(PID_FILE, "utf8"));
  killTree(pid);
  rmSync(PID_FILE, { force: true });
  log("stopped", pid);
  process.exit(0);
}

if (!existsSync(join(ROOT, "package.json")) || !existsSync(join(ROOT, "playwright.config.ts"))) {
  console.error("[serve] run this from the repository root");
  process.exit(1);
}

// --- The environment, as playwright.config.ts builds it ----------------------
for (const file of [".env.test", ".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (!(key in process.env)) process.env[key] = value;
  }
}
Object.assign(process.env, {
  STRIPE_API_BASE: "http://127.0.0.1:12111",
  FAKE_STRIPE_WEBHOOK_URL: `${BASE}/api/stripe/webhook`,
  NEXT_PUBLIC_POSTHOG_KEY: "phc_test_stand_in",
  NEXT_PUBLIC_POSTHOG_HOST: "http://127.0.0.1:12112",
  NEXT_PUBLIC_POSTHOG_DEBUG: "",
  NEXT_PUBLIC_SITE_URL: BASE,
});
process.env.RATE_LIMIT_MULTIPLIER ??= "200";
process.env.CRON_SECRET ??= "local-test-cron-secret-not-for-production";

// The same refusal as tests/helpers.ts: never against a database that is not this machine's.
const database = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(database)) {
  console.error(`[serve] refusing: NEXT_PUBLIC_SUPABASE_URL is "${database}", not the local stack. Is .env.test there?`);
  process.exit(1);
}

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)))
      .listen(port);
  });
if (!(await portFree(PORT))) {
  console.error(`[serve] port ${PORT} is taken. Stop the old server first (--stop, or see SKILL.md, Troubleshooting).`);
  process.exit(1);
}

// --- The stand-ins -------------------------------------------------------------
async function standIn(name, load) {
  try {
    const server = await load();
    log(`${name} stand-in listening`);
    return server;
  } catch (error) {
    if (error?.code !== "EADDRINUSE") throw error;
    log(`${name} stand-in's port is taken; using whatever listens there`);
    return null;
  }
}
const stripe = await standIn("Stripe", async () => (await import("../../../tests/fake-stripe.ts")).startFakeStripe());
const posthog = await standIn("PostHog", async () => (await import("../../../tests/fake-posthog.ts")).startFakePosthog());

// --- Build, then serve ---------------------------------------------------------
mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(PID_FILE, String(process.pid));

const run = (command, commandArgs) =>
  spawn(command, commandArgs, { stdio: "inherit", shell: process.platform === "win32", detached: process.platform !== "win32" });

if (flag("--build")) {
  log("building (a few minutes)…");
  const build = run("npm", ["run", "build"]);
  const code = await new Promise((resolve) => build.on("exit", resolve));
  if (code !== 0) {
    console.error("[serve] build failed");
    rmSync(PID_FILE, { force: true });
    process.exit(code ?? 1);
  }
}

const server = run("npm", ["run", "start", "--", "-p", String(PORT)]);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  killTree(server.pid);
  stripe?.close();
  posthog?.close();
  rmSync(PID_FILE, { force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", (code) => {
  if (!stopping) {
    console.error(`[serve] the server exited (${code})`);
    shutdown();
  }
});

for (let i = 0; i < 120; i++) {
  try {
    const res = await fetch(`${BASE}/ro`, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      console.log(`READY ${BASE}`);
      break;
    }
  } catch {
    // Not up yet.
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
