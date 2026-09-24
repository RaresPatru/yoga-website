"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { toAdminError, type AdminError } from "@/lib/admin/db";

/**
 * Loads an admin screen's data from a single loader function: once on arrival,
 * again whenever `key` changes, and on demand through `reload()`.
 *
 * Every admin page used to repeat itself: a `load()` callback for after a
 * change, plus an effect holding a second copy of the same query for the first
 * load. On the events page the two copies had already drifted apart (audit R4).
 * One loader means one query to read and to fix.
 *
 * `key` is anything the loader depends on, such as a filter or an id; pass a
 * string or number, not a fresh object or array (those would reload on every
 * render). A result that arrives after the key has changed, or after the
 * screen has closed, is dropped, so a slow old response never overwrites a
 * newer one.
 */
export function useAdminData<T>(loader: () => Promise<T>, key: string | number = "") {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<AdminError | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped by reload(); a change re-runs the effect below.
  const [version, setVersion] = useState(0);

  // Always calls the loader from the latest render, without making the loader
  // itself a reason to reload (it is a new function on every render).
  const load = useEffectEvent(() => loader());

  useEffect(() => {
    let current = true;
    load().then(
      (result) => {
        if (!current) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (failure: unknown) => {
        if (!current) return;
        setError(toAdminError(failure));
        setLoading(false);
      }
    );
    return () => {
      current = false;
    };
  }, [key, version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  return { data, setData, error, loading, reload };
}
