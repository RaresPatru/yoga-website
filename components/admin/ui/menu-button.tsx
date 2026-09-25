"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Makes the item one of a set of choices (`menuitemradio`), ticked when true. */
  checked?: boolean;
  /** For `aria-keyshortcuts`. */
  keys?: string;
  tone?: "danger";
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * A button that opens a short menu: the editor's Format and Alignment
 * choices, and the "more" menu in the post editor's bar.
 *
 * The keyboard works as the ARIA menu-button pattern expects: opening moves
 * focus to the ticked item (or the first), the arrow keys, Home and End move
 * between items, Escape closes and returns to the button, and Tab closes and
 * moves on. A click anywhere else closes it too.
 *
 * Positioned under the button by ordinary CSS rather than anchor positioning,
 * which Safari only gained in 26: this has to work on the phone she has.
 */
export function MenuButton({
  label,
  tooltip,
  trigger,
  items,
  triggerClassName,
  menuLabel,
  align = "start",
}: {
  /** The button's accessible name. */
  label: string;
  tooltip?: string;
  trigger: ReactNode;
  items: MenuItem[];
  triggerClassName: string;
  /** Names the menu itself; defaults to `label`. */
  menuLabel?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabled = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);

  useEffect(() => {
    if (!open) return;
    const all = enabled();
    (all.find((el) => el.getAttribute("aria-checked") === "true") ?? all[0])?.focus();

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const all = enabled();
    const at = all.indexOf(document.activeElement as HTMLElement);
    const move = (to: number) => {
      event.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    if (event.key === "ArrowDown") move(at + 1);
    else if (event.key === "ArrowUp") move(at - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(all.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tooltip={open ? undefined : (tooltip ?? label)}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel ?? label}
          onKeyDown={onMenuKey}
          className={cn(
            "absolute top-full z-50 mt-1.5 min-w-48 rounded-xl border border-sage/25 bg-warm-white p-1 shadow-[0_16px_32px_-12px_rgb(0_0_0/0.25)]",
            align === "end" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => {
            const radio = item.checked !== undefined;
            return (
              <button
                key={item.id}
                type="button"
                role={radio ? "menuitemradio" : "menuitem"}
                aria-checked={radio ? item.checked : undefined}
                aria-disabled={item.disabled || undefined}
                aria-keyshortcuts={item.keys}
                tabIndex={-1}
                onClick={() => {
                  if (item.disabled) return;
                  close(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm outline-none transition-colors focus-visible:bg-rose/10 pointer-coarse:min-h-11",
                  item.disabled
                    ? "cursor-not-allowed text-charcoal-light/50"
                    : item.tone === "danger"
                      ? "text-error hover:bg-error/10"
                      : item.checked
                        ? "text-rose-deep hover:bg-rose/10"
                        : "text-charcoal hover:bg-rose/5"
                )}
              >
                {item.icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.checked && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
