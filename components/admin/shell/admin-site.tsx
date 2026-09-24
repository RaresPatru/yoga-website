"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { adminLabel } from "@/lib/admin/site-label";
import { useAdminLocale } from "@/components/admin/locale-provider";

/**
 * Facts about the site that every admin screen can read without asking the
 * database again: for now, the business name shown as "<name> Admin".
 *
 * The admin layout (app/admin/layout.tsx) reads it once on the server and
 * provides it here, for the signed-in panel and the sign-in pages alike.
 */
interface AdminSite {
  siteName: string;
}

const AdminSiteContext = createContext<AdminSite>({ siteName: "" });

export function AdminSiteProvider({ siteName, children }: AdminSite & { children: ReactNode }) {
  return <AdminSiteContext.Provider value={{ siteName }}>{children}</AdminSiteContext.Provider>;
}

export function useAdminSite(): AdminSite {
  return useContext(AdminSiteContext);
}

/**
 * Sets the browser tab's title to "<page> · <name> Admin".
 *
 * Every admin tab used to read the same title, so with several open there was
 * no telling them apart (audit B21). Set from the browser because the admin
 * pages are client components in the admin's own language, which the server
 * does not know; nothing here is read by a search engine.
 *
 * It waits for the translations, because until they load the title would be
 * the message key ("admin.events"). The server's title, "<name> Admin", shows
 * until then.
 *
 * Setting it once is not enough. On a full page load Next.js writes the
 * layout's metadata title into the <title> element after this effect has run,
 * which put "<name> Admin" back on every page opened from the address bar. So
 * the hook watches the document and sets the title again whenever something
 * else changes it, until the page unmounts.
 */
export function useDocumentTitle(title: string) {
  const { siteName } = useAdminSite();
  const { ready } = useAdminLocale();
  useEffect(() => {
    if (!ready) return;
    const wanted = siteName ? `${title} · ${adminLabel(siteName)}` : title;
    const apply = () => {
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [title, siteName, ready]);
}
