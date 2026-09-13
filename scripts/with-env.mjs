/**
 * Says which database you are about to talk to, and optionally forces a
 * different one.
 *
 * WHY
 *
 * Next.js loads .env.local after .env and lets it win, which is the mechanism
 * that points `npm run dev` at the local Supabase stack. That is the right
 * default — "try something in the admin panel" and "change the live website"
 * should not be the same action — but it is invisible: both databases serve the
 * same pages, and a local database with no content looks exactly like a broken
 * query. That ambiguity has already cost an afternoon.
 *
 * So every dev start prints one line naming the target, and reaching production
 * is something you type on purpose.
 *
 * TWO MODES
 *
 *   node scripts/with-env.mjs --print
 *       Resolve the target the way Next will and print it. Nothing else.
 *       Wired into `predev`.
 *
 *   node scripts/with-env.mjs --env .env next dev
 *       Load that file as real environment variables — which outrank every
 *       dotenv file Next reads, including .env.local — then run the command.
 *       This is `npm run dev:prod`.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Minimal dotenv parser. Same shape as the one in playwright.config.ts. */
function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * Resolves NEXT_PUBLIC_SUPABASE_URL exactly as Next would in development: a
 * real environment variable wins, then .env.local, then .env.
 */
function resolveTarget(env = process.env) {
  if (env.NEXT_PUBLIC_SUPABASE_URL) return env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    parseEnvFile(".env.local").NEXT_PUBLIC_SUPABASE_URL ??
    parseEnvFile(".env").NEXT_PUBLIC_SUPABASE_URL ??
    "(not set)"
  );
}

function describe(url) {
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
  if (isLocal) {
    // The sign-in for /admin, printed because the alternative is guessing.
    //
    // The local administrator is created by supabase/seed.sql, so its password
    // is neither the production one nor anything a browser has remembered —
    // typing the live credentials here just returns "invalid credentials",
    // which reads like a broken login rather than the wrong database. It is
    // written in plain text in seed.sql on purpose and only exists on a
    // throwaway database, so there is nothing here to keep quiet.
    const creds = parseEnvFile(".env.test");
    const email = creds.TEST_ADMIN_EMAIL ?? "(see supabase/seed.sql)";
    const password = creds.TEST_ADMIN_PASSWORD ?? "(see supabase/seed.sql)";
    return (
      `LOCAL database — ${url}\n` +
      `   Safe to break. Rebuild it any time with \`npx supabase db reset\`.\n` +
      `   /admin sign-in:  ${email}  /  ${password}`
    );
  }
  // Only the project ref, never the key.
  const ref = url.match(/https:\/\/([a-z0-9]+)\./)?.[1] ?? url;
  return `PRODUCTION database — project ${ref}\n   Anything you change in the admin panel changes the live site. There is no undo.`;
}

const args = process.argv.slice(2);

if (args[0] === "--print") {
  const url = resolveTarget();
  console.log(`\n  ▸ ${describe(url)}\n`);
  process.exit(0);
}

if (args[0] !== "--env" || args.length < 3) {
  console.error(
    "usage:\n" +
      "  node scripts/with-env.mjs --print\n" +
      "  node scripts/with-env.mjs --env <file> <command...>"
  );
  process.exit(1);
}

const [, file, ...command] = args;

if (!existsSync(file)) {
  console.error(`with-env: ${file} does not exist.`);
  process.exit(1);
}

const loaded = parseEnvFile(file);
const env = { ...process.env, ...loaded };

console.log(`\n  ▸ ${describe(resolveTarget(env))}\n`);

// `shell: true` so the .bin shims npm puts on PATH resolve on Windows as well
// as on a Unix shell.
const child = spawn(command.join(" "), { stdio: "inherit", shell: true, env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
