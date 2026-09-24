import { cookies } from "next/headers";
import { NAV_COOKIE } from "@/lib/admin/nav-cookie";
import { AdminShell } from "@/components/admin/shell/admin-shell";

/**
 * The signed-in admin panel: every page inside the sidebar and top bar.
 *
 * A server component so it can read, before any HTML is sent, whether she
 * pinned the sidebar narrow. Worked out in the browser instead, the page would
 * first draw the sidebar wide and then snap it narrow, on every page load.
 *
 * Reaching this layout at all already means proxy.ts found an admin session;
 * the sign-in pages live in the (auth) group beside it and never render this.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const collapsed = (await cookies()).get(NAV_COOKIE)?.value === "collapsed";

  return <AdminShell initialCollapsed={collapsed}>{children}</AdminShell>;
}
