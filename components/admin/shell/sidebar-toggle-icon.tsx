/**
 * The two icons on the sidebar's toggle, drawn after the pair Rares chose:
 * three lines with a chevron that points the way the panel will move.
 *
 *   narrow  lines on the left, chevron on the right pointing left
 *   widen   chevron on the left pointing right, lines on the right
 *
 * The top and bottom lines run the full width and the middle one is short,
 * leaving room for the chevron beside it. Drawn in the same 24-unit grid and
 * 2-unit stroke as the lucide icons around them, so they read as one set.
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
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
      {action === "narrow" ? (
        <>
          <line x1="3" y1="12" x2="13" y2="12" />
          <polyline points="21 8 17 12 21 16" />
        </>
      ) : (
        <>
          <line x1="11" y1="12" x2="21" y2="12" />
          <polyline points="3 8 7 12 3 16" />
        </>
      )}
    </svg>
  );
}
