/**
 * Copy country flag SVGs into public/flags so the phone country picker can
 * render them as plain <img> tags.
 *
 * WHY NOT EMOJI
 *
 * The picker used flag emoji, which are free and render beautifully on iOS and
 * Android. Windows ships no flag glyphs at all and draws the two-letter country
 * code instead, and Chrome on macOS is inconsistent about it. The audience is
 * mobile, but the instructor administers the site from a desktop, and "works on
 * the phone only" is not good enough for a control she uses.
 *
 * WHY NOT IMPORT THEM
 *
 * `country-flag-icons/react/3x2` exports every flag as a React component, so
 * importing the namespace pulls all 267 into the JavaScript bundle — about a
 * megabyte shipped to a phone to draw one 20px image. As files in public/ they
 * are separate lazy-loaded requests: the browser fetches the one selected, plus
 * whichever rows of the list are actually scrolled into view.
 *
 * WHY A SCRIPT RATHER THAN COMMITTING THEM
 *
 * 267 files of vendored artwork in the repository makes every diff harder to
 * read, and they would then need updating by hand when borders change. The
 * package is the source of truth; this copies from it.
 *
 * Runs from `predev` and `prebuild`, so both a local dev server and a Vercel
 * build produce them. It deliberately throws rather than warning: a build that
 * quietly ships a picker with no flags is exactly the silent failure this
 * project keeps having to dig out.
 */
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const source = path.join(process.cwd(), "node_modules", "country-flag-icons", "3x2");
const destination = path.join(process.cwd(), "public", "flags");

if (!existsSync(source)) {
  throw new Error(
    `copy-flags: ${source} is missing. country-flag-icons is a devDependency — ` +
      `run npm install (including dev dependencies) before building.`
  );
}

// Cleared first so a flag removed upstream does not linger in public/.
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

const copied = (await readdir(destination)).filter((file) => file.endsWith(".svg"));
if (copied.length < 200) {
  throw new Error(`copy-flags: only ${copied.length} flags copied, expected ~267.`);
}

console.log(`copy-flags: ${copied.length} flags -> public/flags`);
