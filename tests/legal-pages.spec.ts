import { test, expect } from "@playwright/test";
import { contentSnapshot, putContent, restoreContent } from "./helpers";

/**
 * The privacy policy, terms and cookie policy (components/legal/*), written in
 * "Conținut site" → "Pagini legale" from the drafts seeded by
 * 20260925000000_faq_hidden_and_legal_drafts.sql.
 */

const PAGES = [
  { path: "privacy", ro: "Politica de confidențialitate", en: "Privacy policy" },
  { path: "terms", ro: "Termeni și condiții", en: "Terms and conditions" },
  { path: "cookies", ro: "Politica de cookie-uri", en: "Cookie policy" },
];

test.describe("the legal pages", () => {
  for (const { path, ro, en } of PAGES) {
    test(`/${path} answers in both languages, with the date it last changed`, async ({ page }) => {
      const res = await page.goto(`/ro/${path}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: ro })).toBeVisible();
      await expect(page.getByText(/Ultima actualizare:/)).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(`^${ro} · `));

      await page.goto(`/en/${path}`);
      await expect(page.getByRole("heading", { level: 1, name: en })).toBeVisible();
      await expect(page.getByText(/Last updated:/)).toBeVisible();
    });
  }

  test("a missing business fact is a visible marker, and a supplied one is plain text", async ({
    page,
  }) => {
    const before = await contentSnapshot("legal.business_name");
    try {
      await restoreContent("legal.business_name", null);
      await page.goto("/ro/privacy");
      await expect(
        page.locator('[data-placeholder="true"]', { hasText: "Denumirea firmei" }).first()
      ).toBeVisible();
      await expect(page.getByText("{{business_name}}")).toHaveCount(0);

      // Her text is text: an ampersand stays one, and markup is not obeyed.
      await putContent("legal.business_name", "Ana & <b>Co</b> PFA");
      await page.reload();
      await expect(page.getByText("Ana & <b>Co</b> PFA").first()).toBeVisible();
      await expect(page.locator("article b")).toHaveCount(0);
    } finally {
      await restoreContent("legal.business_name", before);
    }
  });

  test("the VAT choice becomes a sentence in the terms", async ({ page }) => {
    const before = await contentSnapshot("legal.vat");
    try {
      await putContent("legal.vat", "non_payer");
      await page.goto("/ro/terms");
      await expect(page.getByText(/nu este plătitor de TVA/)).toBeVisible();
    } finally {
      await restoreContent("legal.vat", before);
    }
  });

  test("every page's footer links to the three documents and to ANPC SAL", async ({ page }) => {
    await page.goto("/ro");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Confidențialitate" })).toHaveAttribute(
      "href",
      "/ro/privacy"
    );
    await expect(footer.getByRole("link", { name: "Termeni și condiții" })).toHaveAttribute(
      "href",
      "/ro/terms"
    );
    await expect(footer.getByRole("link", { name: "Cookie-uri" })).toHaveAttribute(
      "href",
      "/ro/cookies"
    );
    await expect(footer.getByRole("link", { name: /ANPC/ })).toHaveAttribute(
      "href",
      "https://reclamatiisal.anpc.ro"
    );
  });

  test("the sitemap lists them", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    for (const { path } of PAGES) expect(xml).toContain(`/ro/${path}`);
  });
});
