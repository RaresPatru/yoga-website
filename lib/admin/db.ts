import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Turns failed admin reads and writes into something the admin can act on.
 *
 * Supabase returns `{ data, error }` and never throws, so a save whose `error`
 * nobody checks looks exactly like a save that worked. That is how the admin
 * editors lost whole posts (audit B5): a duplicate slug or an expired session
 * failed silently, and the editor closed anyway. Everything here exists so a
 * failure stops the flow and says what happened.
 */

/** The cases an admin can do something about. Each has a sentence in messages/*.json under admin.errors. */
export type AdminErrorKind =
  | "duplicate" // a value that must be unique is already used, such as a slug
  | "missing" // a required field is empty
  | "invalid" // a value breaks a rule: a negative price, a malformed date
  | "session" // the sign-in has expired
  | "permission" // signed in, but not allowed to do this
  | "network" // the database could not be reached
  | "unknown";

export class AdminError extends Error {
  constructor(
    public readonly kind: AdminErrorKind,
    message: string,
    /** The column the database named, when it named one (e.g. "slug"). */
    public readonly field?: string
  ) {
    super(message);
    this.name = "AdminError";
  }
}

/** Columns whose unique or check constraints the admin can meet, and can fix. */
const NAMED_COLUMNS = ["slug", "email", "type", "key"];

/**
 * Works out which column an error is about.
 *
 * Postgres names it in three possible places. `details` ("Key (slug)=(x)
 * already exists.") is the clearest, but Postgres leaves it empty for users
 * under row-level security, because the key's value could reveal a row they may
 * not read, and the admin is such a user. The constraint name in `message`
 * survives: a unique constraint is called `<table>_<column>_key` by default
 * (`blog_posts_slug_key`). A NULL in a required column names the column
 * directly (`null value in column "slug"`).
 */
function columnFrom(error: Partial<PostgrestError>): string | undefined {
  const text = `${error.details ?? ""} ${error.message ?? ""}`;
  const fromDetails = text.match(/Key \(([^)]+)\)=/)?.[1] ?? text.match(/column "([^"]+)"/)?.[1];
  if (fromDetails) return fromDetails;

  const constraint = text.match(/constraint "([^"]+)"/)?.[1];
  return NAMED_COLUMNS.find((column) => constraint?.endsWith(`_${column}_key`));
}

/**
 * Sorts any error from a Supabase call (or a failed fetch) into an AdminError.
 *
 * The Postgres codes are the standard ones: 23505 unique violation, 23502 a
 * NULL in a required column, 23514 a CHECK constraint, 22xxx a malformed value,
 * 42501 no permission. PGRST30x are PostgREST's codes for a missing or expired
 * sign-in token.
 */
export function toAdminError(error: unknown): AdminError {
  if (error instanceof AdminError) return error;

  const e = (error ?? {}) as Partial<PostgrestError> & { name?: string };
  const message = e.message ?? String(error);

  switch (e.code) {
    case "23505":
      return new AdminError("duplicate", message, columnFrom(e));
    case "23502":
      return new AdminError("missing", message, columnFrom(e));
    case "23514":
    case "23503":
    case "22P02":
    case "22007":
    case "22008":
      return new AdminError("invalid", message, columnFrom(e));
    case "42501":
      return new AdminError("permission", message);
    case "PGRST301":
    case "PGRST302":
    case "PGRST303":
      return new AdminError("session", message);
  }

  if (/jwt|token.*expired|not authenticated/i.test(message)) {
    return new AdminError("session", message);
  }
  if (/row-level security/i.test(message)) {
    return new AdminError("permission", message);
  }
  if (e.name === "TypeError" || /failed to fetch|network|load failed/i.test(message)) {
    return new AdminError("network", message);
  }
  return new AdminError("unknown", message);
}

/**
 * Returns a Supabase result's data, or throws its error as an AdminError.
 *
 *     const posts = must(await supabase.from("blog_posts").select("*"));
 */
export function must<T>(result: { data: T; error: PostgrestError | null }): T {
  if (result.error) throw toAdminError(result.error);
  return result.data;
}

/** The messages/*.json key whose sentence explains this error to the admin. */
export function adminErrorKey(error: AdminError): string {
  if (error.kind === "duplicate" && error.field === "slug") return "admin.errors.duplicate_slug";
  return `admin.errors.${error.kind}`;
}
