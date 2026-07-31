"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "./button";

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
}

export function ShareButton({ title, text, url }: ShareButtonProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url || window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleShare} aria-label={t("share")}>
      {copied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {copied ? t("copied") : t("share")}
    </Button>
  );
}
