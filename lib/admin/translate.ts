"use client";

import { Editor } from "@tiptap/core";
import { getAuthToken } from "@/lib/get-auth-token";
import { compactEditorExtensions } from "@/lib/compact-editor";
import { translateDocument } from "@/lib/translate-document";

/**
 * Romanian to English, for the admin's "translate" buttons.
 *
 * Calls /api/translate, which only answers the admin (it checks the session
 * token) and sends many texts in one request.
 */
export async function translateTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const token = await getAuthToken();
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ texts, from: "ro", to: "en" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.translations)) throw new Error("Translation failed");
  return data.translations;
}

/**
 * Formatted text (HTML) to English, keeping every paragraph, list and link
 * where it was: only the words go to the translator, paragraph by paragraph
 * (lib/translate-document.ts explains why). Runs in an editor that is never
 * shown, built with the same extensions as the one on screen.
 */
export async function translateHtml(html: string): Promise<string> {
  const editor = new Editor({ extensions: compactEditorExtensions(), content: html });
  try {
    const translated = await translateDocument(editor, translateTexts);
    editor.commands.setContent(translated);
    return editor.getHTML();
  } finally {
    editor.destroy();
  }
}

/** Why a translation failed, when it is something she can act on. */
export class TranslationFailed extends Error {
  constructor(readonly reason: "too_long" | "failed") {
    super(`Translation failed: ${reason}`);
  }
}

/**
 * One request for every paragraph of a rich text (lib/translate-document.ts),
 * failing with a reason she can act on: a paragraph over the route's limit is
 * `too_long`, anything else `failed`.
 */
export async function translateBlocks(texts: string[]): Promise<string[]> {
  const token = await getAuthToken();
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ texts, from: "ro", to: "en" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TranslationFailed(data.code === "too_long" ? "too_long" : "failed");
  return data.translations;
}
