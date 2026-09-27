"use client";

import { useCallback, useState } from "react";

/**
 * Which rows of a list are ticked, for the actions that work on several at
 * once (export, delete for good).
 *
 * Two ways to have chosen: the rows ticked one by one (kept across pages, so
 * she can tick some here and some on page 2), or "everyone who matches", which
 * is a promise rather than a list: the ids are fetched when an action runs, so
 * it covers people on pages she never opened.
 *
 * Anything that changes which rows are listed (a tab, a filter, a search)
 * starts again with nothing ticked: a selection she can no longer see is one
 * she could delete without meaning to.
 */
export function useSelection(listKey: string) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [key, setKey] = useState(listKey);
  if (key !== listKey) {
    setKey(listKey);
    setIds(new Set());
    setAllMatching(false);
  }

  const toggle = useCallback((id: string, on: boolean) => {
    setAllMatching(false);
    setIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  /** Ticks or unticks every row on the page. */
  const setMany = useCallback((pageIds: string[], on: boolean) => {
    setAllMatching(false);
    setIds((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds(new Set());
    setAllMatching(false);
  }, []);

  return { ids, allMatching, setAllMatching, toggle, setMany, clear };
}
