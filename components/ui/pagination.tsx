import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Numbered pages, as links: `?page=2` in the address, so a page can be shared,
 * read by a search engine, and returned to with the back button. Used by the
 * public blog (12 a page) and the admin's post list (25).
 *
 * Page numbers near the current one and at both ends are shown, the rest
 * folded into an ellipsis, so the row stays one line on a phone.
 *
 * No hooks, so a Server Component can render it and pass `href` as a
 * function. `href` returns the full address, locale included.
 */
export function Pagination({
  page,
  pageCount,
  href,
  labels,
  className,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  labels: { label: string; previous: string; next: string; page: (page: number) => string };
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const shown = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const items: (number | "gap")[] = [];
  for (const p of [...shown].sort((a, b) => a - b)) {
    const last = items[items.length - 1];
    if (typeof last === "number" && p - last > 1) items.push("gap");
    items.push(p);
  }

  const cell =
    "flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm transition-colors";

  return (
    <nav aria-label={labels.label} className={cn("flex justify-center", className)}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={href(page - 1)} aria-label={labels.previous} className={cn(cell, "text-charcoal-light hover:bg-sage/15 hover:text-charcoal")}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(cell, "text-charcoal-light/35")}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
        </li>
        {items.map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} aria-hidden="true" className="px-1 text-charcoal-light">
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={href(item)}
                aria-label={labels.page(item)}
                aria-current={item === page ? "page" : undefined}
                className={cn(
                  cell,
                  item === page
                    ? "bg-charcoal text-cream"
                    : "text-charcoal-light hover:bg-sage/15 hover:text-charcoal"
                )}
              >
                {item}
              </Link>
            </li>
          )
        )}
        <li>
          {page < pageCount ? (
            <Link href={href(page + 1)} aria-label={labels.next} className={cn(cell, "text-charcoal-light hover:bg-sage/15 hover:text-charcoal")}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(cell, "text-charcoal-light/35")}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
