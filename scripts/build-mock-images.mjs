/**
 * Turns the throwaway pictures in ./mock-images into web-sized files the seed
 * data can point at.
 *
 * WHY THIS EXISTS AT ALL
 *
 * `supabase/seed.sql` fills a local database with plausible content so the site
 * is worth looking at while working on it, and half of that content is
 * photographs. Next's <Image> can only serve a local path out of `public/`, so
 * the pictures have to live there — but the originals are 2.6 MB screenshots,
 * and seven of those is 12 MB of binary in git forever plus a genuinely slow
 * page.
 *
 * So the originals stay out of the repository (see .gitignore) and the resized
 * WebP copies in public/mock are what gets committed: small enough to be
 * unremarkable, present on a fresh clone and in CI, and never regenerated
 * unless somebody drops new source pictures in.
 *
 * Run it by hand after changing ./mock-images:
 *
 *     node scripts/build-mock-images.mjs
 *
 * Deliberately NOT wired into predev/prebuild. It would be dead work on every
 * single build, and it needs a folder that most clones will not have.
 */

import sharp from "sharp";
import { readdirSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SOURCE = "mock-images";
const TARGET = join("public", "mock");

/**
 * Fixed names rather than whatever the files happen to be called.
 *
 * The seed file refers to these by name, so a rename in the source folder must
 * not silently empty a page. The order below is the order the files sort in;
 * anything past the list is ignored.
 */
const NAMES = [
  "hero",     // the instructor's portrait on the home page
  "about",    // the portrait on /about
  "event-1",
  "event-2",
  "event-3",
  "event-4",
  "spare",
];

// Wide enough for the 2x retina case of the largest slot the site has (the
// home page hero at ~45vw on a 1440 screen), and no wider.
const WIDTH = 1400;

if (!existsSync(SOURCE)) {
  console.error(`build-mock-images: no ./${SOURCE} folder — nothing to do.`);
  process.exit(0);
}

mkdirSync(TARGET, { recursive: true });

const files = readdirSync(SOURCE)
  .filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f))
  .sort();

if (!files.length) {
  console.error(`build-mock-images: ./${SOURCE} holds no images.`);
  process.exit(0);
}

let total = 0;
for (const [index, file] of files.entries()) {
  const name = NAMES[index];
  if (!name) break;

  const from = join(SOURCE, file);
  const to = join(TARGET, `${name}.webp`);

  await sharp(from)
    .rotate() // honours the EXIF orientation a phone photo carries
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(to);

  const before = statSync(from).size;
  const after = statSync(to).size;
  total += after;
  console.log(
    `  ${file.padEnd(34)} -> ${name}.webp   ${(before / 1e6).toFixed(1)} MB -> ${Math.round(after / 1024)} KB`
  );
}

console.log(`build-mock-images: ${Math.round(total / 1024)} KB written to ${TARGET}`);
