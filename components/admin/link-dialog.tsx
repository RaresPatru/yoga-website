"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Link as LinkIcon } from "lucide-react";
import { useAdminLocale } from "@/components/admin/locale-provider";

interface LinkDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (url: string) => void;
  initialUrl?: string;
}

export function LinkDialog({ open, onClose, onApply, initialUrl }: LinkDialogProps) {
  const { t } = useAdminLocale();
  const [url, setUrl] = useState(initialUrl || "");

  useEffect(() => {
    setUrl(initialUrl || "");
  }, [initialUrl, open]);

  const handleApply = () => {
    onApply(url);
    setUrl("");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-charcoal">
            {initialUrl ? t("admin.edit_link") : t("admin.add_link")}
          </h3>
          <button onClick={onClose} className="rounded-full p-1 text-charcoal-light hover:bg-white/40">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Input
          label="URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
        />
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>{t("admin.cancel")}</Button>
          <Button onClick={handleApply} disabled={!url.trim()}>
            <LinkIcon className="mr-2 h-4 w-4" />
            {initialUrl ? t("admin.update_link") : t("admin.add")}
          </Button>
        </div>
      </div>
    </div>
  );
}
