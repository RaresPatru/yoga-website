/**
 * The two icons on the sidebar's toggle, drawn after the pair Rares chose:
 * three lines with a chevron that points the way the panel will move.
 *
 *   narrow  lines on the left, chevron on the right pointing left
 *   widen   chevron on the left pointing right, lines on the right
 *
 * The proportions are Chrome's own toggle for its vertical tab strip
 * (views::kMenuOpenIcon and kMenuCloseCustomIcon in Chromium). The middle line
 * is short, leaving room for the chevron's point, and the top and bottom lines
 * stop well short of its arms. They used to run the full width, so at the
 * height where an arm ends they touched it, and the chevron read as part of
 * the lines rather than as an arrow beside them. Drawn in the same 24-unit
 * grid and 2-unit stroke as the lucide icons around them, so they read as one
 * set.
 */
export function SidebarToggleIcon({
  action,
  className,
}: {
  action: "narrow" | "widen";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {action === "narrow" ? (
        <>
          <path d="M4 7h11" />
          <path d="M4 12h8" />
          <path d="M4 17h11" />
          <polyline points="20.25 7.75 16 12 20.25 16.25" />
        </>
      ) : (
        <>
          <path d="M9 7h11" />
          <path d="M12 12h8" />
          <path d="M9 17h11" />
          <polyline points="3.75 7.75 8 12 3.75 16.25" />
        </>
      )}
    </svg>
  );
}
