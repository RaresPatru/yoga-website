import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A participant's photo, made safe to publish.
 *
 * The browser has already shrunk it (components/testimonials/review-form.tsx),
 * which keeps the upload small on a phone connection, but nothing a browser
 * sends can be trusted. Here the server decodes it, turns it the right way up,
 * caps it at 1600 pixels a side and re-saves it as WebP. Re-saving is what
 * strips what a photo carries besides its pixels: sharp writes no metadata
 * unless asked, so the camera's EXIF, including the GPS position of where it
 * was taken, does not reach the public site. Anything that does not decode as
 * an image is refused.
 *
 * Stored in the public `media` bucket under `testimonials/`, with a random
 * name. It is only linked from a page once she approves the testimonial.
 */

export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_MAX_SIDE = 1600;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);
const FOLDER = "testimonials";

export type PhotoResult = { ok: true; url: string; path: string } | { ok: false; reason: "photo_size" | "photo_type" };

export async function storeReviewPhoto(file: File): Promise<PhotoResult> {
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, reason: "photo_size" };
  if (!ACCEPTED.has(file.type)) return { ok: false, reason: "photo_type" };

  let webp: Buffer;
  try {
    webp = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(PHOTO_MAX_SIDE, PHOTO_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return { ok: false, reason: "photo_type" };
  }

  const path = `${FOLDER}/${randomUUID()}.webp`;
  const storage = createAdminClient().storage.from("media");
  const { error } = await storage.upload(path, webp, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  return { ok: true, url: storage.getPublicUrl(path).data.publicUrl, path };
}

/** Removes a stored photo, for a submission that did not go through. */
export async function deleteReviewPhoto(path: string): Promise<void> {
  const { error } = await createAdminClient().storage.from("media").remove([path]);
  if (error) console.error("Could not remove an unused testimonial photo:", error);
}
