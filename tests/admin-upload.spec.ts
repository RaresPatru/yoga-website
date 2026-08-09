import { test, expect } from "@playwright/test";
import { adminAccessToken, anonStorageClient } from "./helpers";

/**
 * The media upload flow, which previously had no coverage at all.
 *
 * Uploads now go browser -> Supabase directly, using a single-use signed URL
 * that /api/upload issues after checking the caller is an admin. The route no
 * longer receives the file itself, because Vercel rejects request bodies over
 * 4.5 MB — so the old "50 MB" promise in the UI was false for anything real.
 *
 * A 1x1 PNG is enough to prove the mechanism; the size limit is asserted
 * against the declared size rather than by uploading 50 MB.
 */

// Smallest valid PNG, as raw bytes.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("media upload", () => {
  test("an admin can upload a file straight to storage", async ({ request }) => {
    const token = await adminAccessToken();

    // Step 1: ask for permission. The server names the file, not us.
    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      data: { fileName: "poza.png", contentType: "image/png", size: TINY_PNG.length },
    });

    expect(res.status()).toBe(200);
    const { path, token: uploadToken, publicUrl } = await res.json();
    expect(path).toMatch(/^\d+-[a-z0-9]+\.png$/);
    expect(uploadToken).toBeTruthy();

    // Step 2: send the bytes directly to Supabase with that token.
    const storage = await anonStorageClient();
    const { error } = await storage.storage
      .from("media")
      .uploadToSignedUrl(path, uploadToken, TINY_PNG, { contentType: "image/png" });
    expect(error, error?.message).toBeNull();

    // The file is really there and publicly readable.
    const fetched = await request.get(publicUrl);
    expect(fetched.status()).toBe(200);

    // Clean up through the same route the admin UI uses.
    const deleted = await request.delete("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      data: { bucket: "media", fileName: path },
    });
    expect(deleted.status()).toBe(200);
  });

  test("the original filename cannot control where the file lands", async ({ request }) => {
    const token = await adminAccessToken();

    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fileName: "../../escape/evil.png",
        contentType: "image/png",
        size: TINY_PNG.length,
      },
    });

    expect(res.status()).toBe(200);
    const { path } = await res.json();
    // Only the extension survives; the server generates the rest.
    expect(path).not.toContain("..");
    expect(path).not.toContain("/");
    expect(path).toMatch(/\.png$/);
  });

  test("rejects SVG, which can carry script", async ({ request }) => {
    const token = await adminAccessToken();

    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      data: { fileName: "logo.svg", contentType: "image/svg+xml", size: 100 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("File type not allowed");
  });

  test("rejects a file over the size limit", async ({ request }) => {
    const token = await adminAccessToken();

    const res = await request.post("/api/upload", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        fileName: "film.mp4",
        contentType: "video/mp4",
        size: 51 * 1024 * 1024,
      },
    });

    expect(res.status()).toBe(400);
  });

  test("refuses a caller with no admin session", async ({ request }) => {
    const res = await request.post("/api/upload", {
      data: { fileName: "poza.png", contentType: "image/png", size: 100 },
    });

    expect(res.status()).toBe(401);
  });
});
