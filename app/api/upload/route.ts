import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRequest } from "@/lib/is-admin";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Only these buckets may be written to. `bucket` arrives from the browser, and
// even though this route is admin-only, an allowlist keeps a typo or a tampered
// request from creating files somewhere unexpected.
const ALLOWED_BUCKETS = new Set(["media"]);

// SVG is deliberately absent. An SVG is XML, and XML can carry <script> — so an
// SVG uploaded to a public bucket becomes a live page that runs JavaScript when
// opened directly. That is a stored cross-site-scripting vector. Every other
// format here is inert image, audio or video data.
//
// The same list is set on the bucket itself (see the migration
// 20260807000005_media_bucket_limits.sql), which is what actually enforces it:
// the browser now uploads straight to Supabase, so this copy is a courtesy that
// produces a clear error before a large file is sent, not the real control.
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/opus",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/aac",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
]);

/**
 * Issues a short-lived signed URL that lets the admin's browser upload one file
 * straight to Supabase Storage.
 *
 * WHY NOT JUST ACCEPT THE FILE HERE?
 *
 * Because Vercel refuses request bodies over 4.5 MB on serverless functions.
 * This route used to receive the whole file and forward it, so it worked
 * perfectly in local development and then failed on anything bigger than a
 * modest photo in production — which is exactly the case the instructor hits
 * when uploading video or pictures straight off a phone.
 *
 * Handing back a signed URL keeps the permission check on the server (only a
 * verified admin gets a token) while the bytes travel directly from the browser
 * to storage, never touching our function.
 *
 * The token is single-use and tied to the exact path named below, so it cannot
 * be replayed to overwrite something else.
 */
export async function POST(req: Request) {
  try {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileName, contentType, size, bucket = "media" } = await req.json();

    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    if (typeof size !== "number" || size <= 0 || size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 50 MB limit" },
        { status: 400 }
      );
    }

    if (typeof contentType !== "string" || !ALLOWED_MIME.has(contentType)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
    }

    // The server names the file, not the client. The original name is never
    // used as a path, so nothing the admin happens to call a file — including
    // "../" or a leading slash — can influence where it lands.
    const ext = fileName.split(".").pop()?.toLowerCase() || "bin";
    const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : "bin";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

    const supabase = createAdminClient();

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);

    // `token` is what the browser passes to uploadToSignedUrl().
    return NextResponse.json({ path: data.path, token: data.token, publicUrl });
  } catch (error) {
    console.error("Signed upload URL error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    if (!(await isAdminRequest(req))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bucket, fileName } = await req.json();
    const targetBucket = bucket || "media";

    if (!ALLOWED_BUCKETS.has(targetBucket)) {
      return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
    }

    if (!fileName || typeof fileName !== "string") {
      return NextResponse.json({ error: "Missing fileName" }, { status: 400 });
    }

    // Blocks path traversal: "../../other-bucket/file.png" would otherwise
    // escape the intended folder and delete something else.
    if (fileName.includes("..") || fileName.startsWith("/")) {
      return NextResponse.json({ error: "Invalid fileName" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.storage.from(targetBucket).remove([fileName]);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
