import { test, expect } from "@playwright/test";
import { countSentence, pluralForm } from "../lib/admin/plural";

/**
 * lib/admin/plural.ts: which of the dashboard's sentences fits a count.
 * Romanian has three forms, and the third is easy to get wrong because it
 * comes back after 100: 101 plăți, not 101 de plăți.
 */
test.describe("plural forms", () => {
  test("Romanian: one, few, other, and zero on its own", () => {
    const cases: Array<[number, string]> = [
      [0, "zero"],
      [1, "one"],
      [2, "few"],
      [19, "few"],
      [20, "other"],
      [100, "other"],
      [101, "few"],
      [119, "few"],
      [120, "other"],
    ];
    for (const [count, form] of cases) {
      expect(pluralForm(count, "ro"), `${count}`).toBe(form);
    }
  });

  test("English: one and other", () => {
    expect(pluralForm(0, "en")).toBe("zero");
    expect(pluralForm(1, "en")).toBe("one");
    expect(pluralForm(2, "en")).toBe("other");
    expect(pluralForm(21, "en")).toBe("other");
  });

  test("fills the count into the sentence for its form", () => {
    const messages: Record<string, string> = {
      "admin.dash.payments.one": "{count} plată în așteptare",
      "admin.dash.payments.few": "{count} plăți în așteptare",
      "admin.dash.payments.other": "{count} de plăți în așteptare",
      "admin.dash.payments.zero": "Totul la zi",
    };
    const t = (key: string) => messages[key] ?? key;
    expect(countSentence(t, "ro", "admin.dash.payments", 1)).toBe("1 plată în așteptare");
    expect(countSentence(t, "ro", "admin.dash.payments", 3)).toBe("3 plăți în așteptare");
    expect(countSentence(t, "ro", "admin.dash.payments", 25)).toBe("25 de plăți în așteptare");
    expect(countSentence(t, "ro", "admin.dash.payments", 0)).toBe("Totul la zi");
  });
});
