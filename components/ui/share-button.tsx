"use client";

import { useState } from "react";
import { Share2, Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
}

/**
 * Put this page's link wherever the visitor wants it.
 *
 * WHAT IT TRIES, IN ORDER, AND WHY THERE ARE THREE OF THEM
 *
 * `navigator.share` is the good one — it opens the platform's own sheet, so on
 * the phone this audience arrives on they get WhatsApp and Instagram in the
 * list. It is also the one that is least often available: it needs a secure
 * context, and it does not exist on most desktop browsers at all.
 *
 * `navigator.clipboard` is the fallback, and it needs a secure context too, so
 * on a plain-http origin *both* are missing. That is not a hypothetical: this
 * button did nothing at all when the site was opened from another device on the
 * local network at `http://192.168.x.x:3100`, because `navigator.share` was
 * undefined, the code fell through to `navigator.clipboard.writeText(...)`,
 * and reading `.writeText` off `undefined` threw a TypeError that nothing
 * caught. `localhost` is treated as secure and production is HTTPS, so the only
 * place it showed was the one nobody tests on.
 *
 * The third is the old `execCommand("copy")` on a detached textarea. It is
 * deprecated and it works everywhere, including the insecure origins where the
 * other two do not — which is exactly the case it is here for.
 *
 * And if all three fail, it says so. Silently doing nothing is what it used to
 * do, and a button that does nothing reads as a broken site.
 */
export function ShareButton({ title, text, url }: ShareButtonProps) {
  const t = useTranslations("common");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const flash = (next: "copied" | "failed") => {
    setState(next);
    // Failure is worth reading twice; success is self-evident.
    window.setTimeout(() => setState("idle"), next === "failed" ? 5000 : 2000);
  };

  const handleShare = async () => {
    const shareUrl = url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl });
        return;
      } catch (error) {
        /*
         * Backing out of the share sheet is not a failure, and must not fall
         * through to copying: quietly putting the link on someone's clipboard
         * after they dismissed the sheet is not what they asked for. Every
         * other error — a browser that advertises the API and refuses to use
         * it — falls through to the copy path below.
         */
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    flash((await copyToClipboard(shareUrl)) ? "copied" : "failed");
  };

  const Icon = state === "copied" ? Check : state === "failed" ? AlertCircle : Share2;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleShare}
      // No `aria-label`. It used to carry "Distribuie", which overrode the
      // visible text — so the label never changed when the state did and a
      // screen reader was told "Distribuie" while the button read "Link
      // copiat!". The visible text is the name, and `aria-live` is what
      // announces it changing.
      className={state === "failed" ? "text-error" : undefined}
    >
      <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
      <span aria-live="polite">
        {state === "copied" ? t("copied") : state === "failed" ? t("copy_failed") : t("share")}
      </span>
    </Button>
  );
}

/**
 * True if the link is now on their clipboard.
 *
 * Never throws: every caller wants to know whether it worked, and the ways this
 * fails — no secure context, a permission refusal, a browser that has neither
 * API — are all things to tell the visitor about rather than crash on.
 */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Permission refused, or no secure context. Try the old way.
  }

  const field = document.createElement("textarea");
  try {
    field.value = value;
    field.setAttribute("readonly", "");
    // Off-screen rather than hidden: `display:none` and `visibility:hidden`
    // cannot be selected, and `position: fixed` keeps the page from scrolling
    // to it the way an absolutely positioned one would.
    field.style.position = "fixed";
    field.style.top = "-9999px";
    field.style.opacity = "0";
    document.body.appendChild(field);

    /*
     * Both, because `select()` alone is not enough on the phones this audience
     * uses. iOS Safari ignores it on a `readonly` textarea and copies nothing,
     * which is the one platform where this fallback matters most — it is the
     * path taken on any insecure origin, where neither `navigator.share` nor
     * the clipboard API exists. `setSelectionRange` is what actually selects
     * there, and is harmless everywhere else.
     */
    field.select();
    field.setSelectionRange(0, value.length);

    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    /*
     * In `finally`, so a throw from `select()` or `execCommand` cannot leave
     * the node behind. It used to be removed only on the success path, which
     * meant every failed attempt added another invisible textarea to the body
     * for the life of the page.
     */
    field.remove();
  }
}
