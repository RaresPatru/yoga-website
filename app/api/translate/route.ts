import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/is-admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/** The only pair the admin translates between; anything else is a bad request. */
const LANGUAGES = new Set(["ro", "en"]);

/** Google's web translator stops at 5,000 characters per text. */
const MAX_TEXT = 5000;

/**
 * A whole blog post, sent as one text per paragraph (lib/translate-document.ts).
 *
 * 60,000 characters is roughly 10,000 words, several times any post she is
 * likely to write. The endpoint takes that in one request: measured on
 * 23 September, 60 blocks and 66,531 characters came back in under a second,
 * markup intact.
 */
const MAX_TOTAL = 60000;
const MAX_BLOCKS = 500;

/**
 * Translates for the admin editors.
 *
 * Two shapes:
 *   { text }  → { translatedText }   a title, or an event's plain description
 *   { texts } → { translations }     the blocks of a blog post, in order
 *
 * The blocks carry inline HTML, which the endpoint translates around rather
 * than through. Nothing here sanitises it, because nothing here renders it:
 * the editor that receives the result keeps only what its schema knows, and
 * every public page sanitises what it prints.
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!rateLimit(`translate:${clientIp(request)}`, 60)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "A JSON body is required" }, { status: 400 });
    }

    const from = body.from ?? "ro";
    const to = body.to ?? "en";
    if (!LANGUAGES.has(from) || !LANGUAGES.has(to)) {
      return NextResponse.json({ error: "Only ro and en are supported" }, { status: 400 });
    }

    const { default: translate } = await import("google-translate-api-x");

    if (body.texts !== undefined) {
      const texts: unknown = body.texts;
      if (
        !Array.isArray(texts) ||
        texts.length === 0 ||
        texts.length > MAX_BLOCKS ||
        !texts.every((t) => typeof t === "string" && t.trim().length > 0)
      ) {
        return NextResponse.json(
          { error: `texts must be 1 to ${MAX_BLOCKS} non-empty strings` },
          { status: 400 }
        );
      }
      const blocks = texts as string[];
      // `code` lets the editor say which limit it hit: a paragraph too long
      // to split is something she can fix, a failed request is not.
      if (blocks.some((t) => t.length > MAX_TEXT)) {
        return NextResponse.json(
          { error: `A paragraph is over ${MAX_TEXT} characters`, code: "too_long" },
          { status: 400 }
        );
      }
      if (blocks.reduce((sum, t) => sum + t.length, 0) > MAX_TOTAL) {
        return NextResponse.json(
          { error: `The text is over ${MAX_TOTAL} characters`, code: "too_long" },
          { status: 400 }
        );
      }

      // One request for the whole post: the library sends an array as a
      // single batch and answers in the same order.
      const results = await translate(blocks, { from, to, forceBatch: true });
      return NextResponse.json({ translations: results.map((r) => r.text) });
    }

    const { text } = body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    if (text.length > MAX_TEXT) {
      return NextResponse.json(
        { error: `Text too long (max ${MAX_TEXT} chars)`, code: "too_long" },
        { status: 400 }
      );
    }

    const result = await translate(text, { from, to, forceBatch: true });

    return NextResponse.json({ translatedText: result.text });
  } catch (err) {
    console.error("Translation error:", err);
    return NextResponse.json(
      { error: "Translation failed. Please try again." },
      { status: 500 }
    );
  }
}
