import { test, expect } from "@playwright/test";
import { toPlainParagraphs, toPlainText } from "../lib/plain-text";

/**
 * Her rich text without its markup (lib/plain-text.ts): what meta
 * descriptions, cards and calendar entries show.
 */
test.describe("rich text as plain text", () => {
  test("decodes the entities text is stored with, once (audit B28)", () => {
    expect(toPlainText("<p>5 &lt; 6 &amp; 7 &gt; 3, &quot;da&quot; &#039;nu&#039;&nbsp;azi</p>")).toBe(
      `5 < 6 & 7 > 3, "da" 'nu' azi`
    );
    // Decoded once: the text "&lt;" written by someone stays "&lt;".
    expect(toPlainText("&amp;lt;")).toBe("&lt;");
  });

  test("keeps paragraphs for a calendar entry", () => {
    expect(toPlainParagraphs("<p>Prima parte.</p><p>A doua<br>linie.</p><ul><li>unu</li><li>doi</li></ul>")).toBe(
      "Prima parte.\n\nA doua\nlinie.\n\nunu\n\ndoi"
    );
  });
});
