"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AdminLocaleProvider, useAdminLocale } from "@/components/admin/locale-provider";
import {
  LayoutDashboard,
  FileText,
  Calendar,
  Users,
  MessageSquare,
  Mail,
  Star,
  LogOut,
  Menu,
  X,
  Globe,
} from "lucide-react";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { locale, setLocale, t } = useAdminLocale();

  const adminLinks = [
    { href: "/admin", icon: LayoutDashboard, key: "dashboard" },
    { href: "/admin/blog", icon: FileText, key: "blog" },
    { href: "/admin/events", icon: Calendar, key: "events" },
    { href: "/admin/registrations", icon: Users, key: "registrations" },
    { href: "/admin/testimonials", icon: Star, key: "testimonials" },
    { href: "/admin/emails", icon: Mail, key: "emails" },
    { href: "/admin/messages", icon: MessageSquare, key: "messages" },
  ];

  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/admin/login");
      } else {
        setLoading(false);
      }
    });
  }, [router, isLoginPage]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose border-t-transparent" />
      </div>
    );
  }

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-cream">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform border-r border-sage/20 bg-white/80 backdrop-blur-xl transition-transform duration-300 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sage/20 px-6">
          <Link href="/admin" className="font-serif text-xl text-sage-dark">
            Yoga Admin
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-full p-1 text-charcoal-light hover:bg-white/40 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {adminLinks.map(({ href, icon: Icon, key }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors",
                pathname === href
                  ? "bg-rose/10 text-rose font-medium"
                  : "text-charcoal-light hover:bg-white/40 hover:text-charcoal"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(`admin.${key}`)}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sage/20 p-4">
          <button
            onClick={() => setLocale(locale === "ro" ? "en" : "ro")}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-charcoal-light transition-colors hover:bg-white/40 hover:text-charcoal mb-1"
          >
            <Globe className="h-4 w-4" />
            {locale === "ro" ? "English" : "Română"}
          </button>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-charcoal-light transition-colors hover:bg-white/40 hover:text-error"
          >
            <LogOut className="h-4 w-4" />
            {t("admin.logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex h-16 items-center gap-4 border-b border-sage/20 bg-white/40 px-6 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-full p-2 text-charcoal-light hover:bg-white/40 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="font-serif text-lg text-charcoal">{t("admin.dashboard")}</h2>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLocaleProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminLocaleProvider>
  );
}
