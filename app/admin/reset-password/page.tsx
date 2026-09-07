"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminLocale } from "@/components/admin/locale-provider";
import { buttonClasses } from "@/lib/button-styles";

/**
 * Must match the "Minimum password length" set on the Supabase project.
 *
 * Supabase enforces the real rule server-side; this only exists so the
 * requirement is visible while typing instead of arriving as a rejection after
 * submitting. If the dashboard value changes, change this to match — a local
 * check that is *stricter* than the server merely annoys, but one that is
 * looser produces a form that accepts input the server will refuse.
 */
const MIN_PASSWORD_LENGTH = 15;

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const { t } = useAdminLocale();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase reports a dead link by redirecting back here with an error
    // rather than a token — `?error=access_denied&error_code=otp_expired`, or
    // the same pair in the fragment depending on the flow. Both are checked,
    // and checked *first*.
    //
    // Order matters more than it looks. A browser that has just completed a
    // reset still holds the session that reset created, so asking "is there a
    // session?" first would answer yes and show the form again for a link
    // Supabase had already refused. That is precisely how this page ended up
    // looking reusable: the token was consumed correctly and single-use, but
    // the page never noticed, because it was reading the wrong signal.
    const search = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const linkWasRejected = Boolean(search.get("error") || fragment.get("error"));

    const supabase = createClient();

    // The token arrives in the URL fragment as `#access_token=...&type=recovery`
    // (or as `?code=` when the project is on the PKCE flow). Either way the
    // browser client picks it up on creation — `detectSessionInUrl` is on by
    // default — exchanges it for a session, and strips it back out of the
    // address bar so the token does not linger in history or get handed to the
    // next site via the Referer header.
    //
    // That work is asynchronous, so both paths below are needed. getSession()
    // waits for the client to finish initialising, which covers the ordinary
    // case; the listener catches the PASSWORD_RECOVERY event if it lands first.
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (linkWasRejected) return;
        if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      // The rejected-link case is settled here rather than with an early return
      // above, so that every state change in this effect happens in an async
      // callback. A synchronous setState in an effect body is what
      // `react-hooks/set-state-in-effect` exists to catch — it renders once,
      // throws that render away and renders again.
      if (linkWasRejected) {
        setStatus("invalid");
        return;
      }

      // No session means no usable token: the link was already used, has
      // expired, or somebody navigated here directly.
      setStatus((current) =>
        data.session ? "ready" : current === "checking" ? "invalid" : current
      );
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("admin.password_too_short"));
      return;
    }
    if (password !== confirm) {
      setError(t("admin.password_mismatch"));
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    // End every session, including this one.
    //
    // Two things at once. The reason someone resets a password is usually that
    // they believe it is known to somebody else — a shared computer, a
    // keylogger, a phone left somewhere — and changing a password does not by
    // itself end sessions that already exist. Without this, an attacker holding
    // a stolen refresh token keeps their access and the reset accomplishes
    // nothing against the threat that prompted it.
    //
    // It also closes this page behind itself. The recovery link is single-use
    // and Supabase does consume it, but completing a reset leaves *this*
    // browser holding the session that link created — so the form stayed
    // available for as long as that session lived, and the page could be used
    // to set the password again and again without a new email. Revoking the
    // session is what makes "the link is spent" true from the visitor's side as
    // well as Supabase's.
    //
    // `global` rather than `others` for exactly that reason: leaving this
    // browser signed in is the thing that kept the door open. The visitor logs
    // in again with the password they just chose, which also proves they
    // remember it.
    //
    // Failure is non-fatal. The password did change — that is what they asked
    // for — so an error here is not something they can act on.
    await supabase.auth.signOut({ scope: "global" }).catch(() => {});

    setStatus("done");
    setSaving(false);
  };

  if (status === "checking") {
    return (
      <Shell>
        <p className="text-center text-sm text-charcoal-light" role="status">
          {t("admin.reset_checking")}
        </p>
      </Shell>
    );
  }

  if (status === "invalid") {
    return (
      <Shell title={t("admin.reset_title")}>
        <p
          className="mt-6 rounded-xl bg-error/10 px-4 py-3 text-sm text-error"
          role="alert"
        >
          {t("admin.reset_invalid")}
        </p>
        <Link
          href="/admin/forgot-password"
          className={`${buttonClasses()} mt-6 w-full`}
        >
          {t("admin.forgot_submit")}
        </Link>
      </Shell>
    );
  }

  if (status === "done") {
    return (
      <Shell title={t("admin.reset_title")}>
        <p
          className="mt-6 rounded-xl bg-success/10 px-4 py-3 text-sm text-charcoal"
          role="status"
        >
          {t("admin.reset_done")}
        </p>
        <Link href="/admin/login" className={`${buttonClasses()} mt-6 w-full`}>
          {t("admin.back_to_login")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell title={t("admin.reset_title")}>
      <p className="mt-4 text-center text-sm text-charcoal-light">
        {t("admin.reset_intro").replace("{min}", String(MIN_PASSWORD_LENGTH))}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label={t("admin.new_password")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          // Tells a password manager to offer a generated password rather than
          // autofilling the old one, which is the opposite of helpful here.
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <Input
          label={t("admin.confirm_password")}
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? t("admin.reset_saving") : t("admin.reset_submit")}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/30 bg-white/60 p-8 shadow-xl backdrop-blur-xl">
        {title && (
          <h1 className="text-center font-serif text-2xl text-charcoal">
            {title}
          </h1>
        )}
        {children}
      </div>
    </div>
  );
}
