"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useAdminLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // proxy.ts redirects here with ?error=forbidden when someone is signed in but
  // is not on the admin list. Without this message they would just see the
  // login form again after a successful login and assume it was broken.
  const forbidden = searchParams.get("error") === "forbidden";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/admin");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/60 p-8 shadow-xl backdrop-blur-xl">
        <h1 className="text-center font-serif text-2xl text-charcoal">
          {t("admin.login_title")}
        </h1>
        {forbidden && (
          <p className="mt-4 rounded-xl bg-error/10 px-4 py-3 text-sm text-error" role="alert">
            {t("admin.login_forbidden")}
          </p>
        )}
        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <Input
            label={t("admin.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
          />
          <Input
            label={t("admin.password")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("admin.logging_in") : t("admin.login")}
          </Button>
        </form>
      </div>
    </div>
  );
}

// useSearchParams() needs a Suspense boundary above it so Next.js can render
// the rest of the page while the URL is resolved.
export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
