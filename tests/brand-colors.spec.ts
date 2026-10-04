import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { BRAND, BRAND_TOKENS } from "../lib/brand-colors";

/**
 * The share images and emails cannot read CSS variables, so lib/brand-colors.ts
 * keeps a hex copy of the palette. This fails the moment the copy and
 * app/globals.css disagree, which is how the share images had come to use a
 * rose the rest of the site no longer used.
 */
test("the hex palette matches the colour tokens in globals.css", () => {
  const css = readFileSync("app/globals.css", "utf8");

  for (const [name, token] of Object.entries(BRAND_TOKENS)) {
    const match = css.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})\\s*;`));
    expect(match, `${token} is defined in globals.css`).not.toBeNull();
    expect(BRAND[name as keyof typeof BRAND].toUpperCase(), `${name} equals ${token}`).toBe(
      match![1].toUpperCase()
    );
  }
});
