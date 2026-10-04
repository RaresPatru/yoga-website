import type { ReactNode } from "react";

/**
 * The top of every admin page: its heading, an optional line saying what the
 * page is for, and the page's main actions.
 *
 * The heading repeats the page's name in the sidebar word for word, so the
 * link she pressed and the page she landed on say the same thing. The actions
 * sit to the right on a computer and drop below the heading on a phone.
 *
 * The browser tab's title is set separately, by useDocumentTitle() at the top
 * of each page, because some pages replace this header with an editor and the
 * tab should keep its name while they do.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="break-words font-serif text-2xl text-charcoal sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-prose text-sm text-charcoal-light">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
