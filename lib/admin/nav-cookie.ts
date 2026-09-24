/**
 * The cookie that remembers whether the admin pinned the sidebar narrow.
 *
 * Kept outside the client component that writes it so the server layout
 * (app/admin/(panel)/layout.tsx) can read it too. A value imported from a
 * "use client" module into a Server Component arrives as a reference, not as
 * the string.
 */
export const NAV_COOKIE = "admin-nav";

/** One year, so the choice survives until she changes it. */
export const NAV_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
