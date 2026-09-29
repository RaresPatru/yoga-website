import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Where the statistics run (components/providers/analytics.tsx).
 *
 * PostHog counts visits to the public site and nothing else: the admin panel
 * never loads it, it is not part of any page's own JavaScript (it is fetched
 * once the page has loaded and gone quiet), and a server on this machine
 * never sends it anything, so local runs and this suite stay out of her
 * statistics.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test.describe("analytics", () => {
  test("only the public layout renders it, and the library is fetched later, not bundled", () => {
    expect(source("app/[locale]/layout.tsx")).toMatch(/<Analytics \/>/);
    expect(source("app/layout.tsx"), "the root layout wraps the admin panel too").not.toMatch(
      /providers\/analytics|posthog/
    );

    // A static import would put posthog-js into the page's own JavaScript.
    const staticImports = ["app", "components", "lib"]
      .flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((file) => /^import(?! type)[^;]*from ["']posthog-js/m.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(staticImports).toEqual([]);
    expect(source("components/providers/analytics.tsx")).toMatch(/await import\("posthog-js"\)/);

    const admin = ["app/admin", "components/admin"]
      .flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((file) => /posthog|providers\/analytics/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd(), ""));
    expect(admin, "the admin panel must not load the statistics").toEqual([]);
  });

  test("a page on this machine sends PostHog nothing", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (/posthog/i.test(request.url())) calls.push(request.url());
    });
    await page.goto("/ro");
    await page.locator("next-route-announcer").waitFor({ state: "attached" });
    // Past the page's load and the quiet moment the library waits for.
    await page.waitForTimeout(2500);
    await page.getByRole("navigation", { name: "Secțiunile site-ului" }).getByRole("link", { name: "Blog", exact: true }).click();
    await expect(page).toHaveURL(/\/ro\/blog$/);
    await page.waitForTimeout(500);
    expect(calls).toEqual([]);
  });
});
