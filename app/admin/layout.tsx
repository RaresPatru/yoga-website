import type { Metadata } from "next";
import { getSiteName } from "@/lib/site-content";
import { adminLabel } from "@/lib/admin/site-label";
import { AdminLocaleProvider } from "@/components/admin/locale-provider";
import { ToastProvider } from "@/components/admin/ui/toaster";
import { ConfirmProvider } from "@/components/admin/ui/confirm-dialog";
import { AdminSiteProvider } from "@/components/admin/shell/admin-site";

/**
 * Everything under /admin, signed in or not.
 *
 * It provides what both halves need: her site name (read once here, on the
 * server), the admin's language, toasts and the confirmation dialog. What each
 * half looks like is decided one level down, by route group:
 *
 *   (auth)   sign in, forgot password, reset password: bare pages, because
 *            every link in the sidebar leads somewhere proxy.ts would bounce a
 *            signed-out visitor from.
 *   (panel)  everything else, inside the sidebar and top bar
 *            ((panel)/layout.tsx).
 *
 * The groups do not change any address. Which pages a signed-out visitor may
 * reach is still decided by PUBLIC_ADMIN_ROUTES in proxy.ts.
 */

/** The tab title until a page sets its own ("Evenimente · flow4ward Admin"). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: adminLabel(await getSiteName()) };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const siteName = await getSiteName();

  return (
    <AdminSiteProvider siteName={siteName}>
      <AdminLocaleProvider>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </AdminLocaleProvider>
    </AdminSiteProvider>
  );
}
