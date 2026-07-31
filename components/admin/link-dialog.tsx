"use client";

import { useState, useEffect, useRef } from "react";
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
  const [prevOpen, setPrevOpen] = useState(open);
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setUrl(initialUrl || "");
  }

  useEffect(() => {
    if (open && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const handleClose = () => onClose();
    dialog?.addEventListener("close", handleClose);
    return () => dialog?.removeEventListener("close", handleClose);
  }, [onClose]);

  const handleApply = () => {
    onApply(url);
    setUrl("");
    onClose();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl bg-transparent p-0 backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-white/30 bg-white/90 p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg text-charcoal">
            {initialUrl ? t("admin.edit_link") : t("admin.add_link")}
          </h3>
          <button
            onClick={onClose}
            aria-label={t("admin.close")}
            className="rounded-full p-1 text-charcoal-light hover:bg-white/40"
          >
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
    </dialog>
  );
}
