"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { buttonClasses } from "@/lib/button-styles";

/**
 * "I cannot get in" — step one of two.
 *
 * Sends the recovery email. Step two is /admin/reset-password, which the link
 * in that email opens.
 */
export default function ForgotPasswordPage() {
  const { t } = useAdminLocale();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();

      // redirectTo has to be an absolute URL, and Supabase will only honour it
      // if it matches the Redirect URLs allowlist on the project. That
      // allowlist is the thing standing between this parameter and an open
      // redirect: without it, anyone could ask Supabase to mail a real recovery
      // token pointing at a site they control. Built from the browser's own
      // origin so the same code works on localhost, on a Vercel preview and in
      // production, without a build-time guess about which domain this is.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin/reset-password`,
      });
    } catch {
      // Swallowed on purpose, and the try/catch is not decoration: supabase-js
      // returns most failures as a value, but a genuine network error rejects.
      // Without this the handler stopped there — `setSent` never ran, `setLoading`
      // never ran, and the visitor was left staring at a form with a permanently
      // disabled button and no explanation. A dead form is a worse outcome than
      // any error message.
    } finally {
      setLoading(false);
    }

    // Deliberately not branching on the result.
    //
    // Supabase answers the same way whether or not the address has an account,
    // and this page must not undo that. A form that says "no such user" is an
    // account-enumeration oracle: someone can work out which addresses are
    // registered by watching which ones it rejects. The same reasoning is why
    // failures are silent — a rate-limit rejection shown only for real accounts
    // would confirm the address exists just as loudly.
    //
    // The honest phrasing matters too: the message says an email has been sent
    // *if* the address has an account, rather than claiming one was sent.
    setSent(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/60 p-8 shadow-xl backdrop-blur-xl">
        <h1 className="text-center font-serif text-2xl text-charcoal">
          {t("admin.forgot_title")}
        </h1>

        {sent ? (
          <>
            <p
              className="mt-6 rounded-xl bg-success/10 px-4 py-3 text-sm text-charcoal"
              role="status"
            >
              {t("admin.forgot_sent")}
            </p>
            <Link
              href="/admin/login"
              className={`${buttonClasses({ variant: "secondary" })} mt-6 w-full`}
            >
              {t("admin.back_to_login")}
            </Link>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-sm text-charcoal-light">
              {t("admin.forgot_intro")}
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Input
                label={t("admin.email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="admin@example.com"
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("admin.forgot_sending") : t("admin.forgot_submit")}
              </Button>
            </form>
            <Link
              href="/admin/login"
              className="mt-6 block text-center text-sm text-charcoal-light underline hover:text-charcoal"
            >
              {t("admin.back_to_login")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
