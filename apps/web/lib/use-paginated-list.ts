"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Append `incoming` to `existing`, dropping any item whose key is already
 * present — cursor pages can overlap if rows shifted between fetches. Returns
 * the same array reference when nothing new arrives (stable for memo deps).
 * Pure — unit-tested.
 */
export function mergeById<T>(existing: T[], incoming: T[], keyOf: (i: T) => string): T[] {
  const seen = new Set(existing.map(keyOf));
  const add = incoming.filter((i) => !seen.has(keyOf(i)));
  return add.length ? [...existing, ...add] : existing;
}

export type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Cursor-paginated list with infinite scroll. Seed it with the server's first
 * page; attach `sentinelRef` to an element at the bottom of the list and it
 * fetches the next page as that element nears the viewport. Idempotent and
 * single-flight: overlapping loads are ignored, and a failed fetch keeps the
 * cursor so the next scroll retries.
 *
 * `paramsKey` carries the server-side query (search/filter/sort) the pages are
 * fetched under. "" means the default view, seeded by the server-rendered
 * first page; any other value refetches page 1 (`fetchPage(null)`) and every
 * change bumps an epoch so in-flight responses for stale params are dropped.
 */
export function usePaginatedList<T>(opts: {
  initial: T[];
  initialCursor: string | null;
  keyOf: (item: T) => string;
  fetchPage: (cursor: string | null) => Promise<Page<T>>;
  paramsKey?: string;
}) {
  const { initial, initialCursor, keyOf, fetchPage } = opts;
  const paramsKey = opts.paramsKey ?? "";
  const [items, setItems] = useState<T[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [reseeding, setReseeding] = useState(false);

  // Keep callbacks/cursor in refs so loadMore and the observer stay stable
  // across renders (no observer churn on every parent state change).
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const loadingRef = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;
  const epochRef = useRef(0);

  // Reseed on a fresh server first page (e.g. router.refresh after mining/
  // importing) or on a params change. `initial`/`initialCursor` are stable
  // across client re-renders — they only change on a real server payload
  // change.
  useEffect(() => {
    const epoch = ++epochRef.current;
    if (!paramsKey) {
      setItems(initial);
      setCursor(initialCursor);
      setReseeding(false);
      return;
    }
    setReseeding(true);
    fetchRef
      .current(null)
      .then((page) => {
        if (epochRef.current !== epoch) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setReseeding(false);
      })
      .catch(() => {
        // Keep the current list; the stale pages are better than a blank grid.
        if (epochRef.current === epoch) setReseeding(false);
      });
  }, [paramsKey, initial, initialCursor]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    const epoch = epochRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchRef.current(cursorRef.current);
      if (epochRef.current === epoch) {
        setItems((cur) => mergeById(cur, page.items, keyRef.current));
        setCursor(page.nextCursor);
      }
    } catch {
      // Leave the cursor untouched so the next scroll retries.
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (node: Element | null) => {
      observerRef.current?.disconnect();
      if (!node) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) void loadMore();
        },
        // Pre-load before the sentinel is fully on screen.
        { rootMargin: "600px" },
      );
      observerRef.current.observe(node);
    },
    [loadMore],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { items, loading, reseeding, hasMore: cursor != null, sentinelRef };
}
