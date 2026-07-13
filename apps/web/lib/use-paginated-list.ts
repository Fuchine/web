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
 */
export function usePaginatedList<T>(opts: {
  initial: T[];
  initialCursor: string | null;
  keyOf: (item: T) => string;
  fetchPage: (cursor: string) => Promise<Page<T>>;
}) {
  const { initial, initialCursor, keyOf, fetchPage } = opts;
  const [items, setItems] = useState<T[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  // Keep callbacks/cursor in refs so loadMore and the observer stay stable
  // across renders (no observer churn on every parent state change).
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const loadingRef = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyRef = useRef(keyOf);
  keyRef.current = keyOf;

  // Reseed when the server sends a fresh first page (e.g. router.refresh after
  // mining/importing). `initial`/`initialCursor` are stable across client
  // re-renders — they only change on a real server payload change.
  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
  }, [initial, initialCursor]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchRef.current(cursorRef.current);
      setItems((cur) => mergeById(cur, page.items, keyRef.current));
      setCursor(page.nextCursor);
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

  return { items, loading, hasMore: cursor != null, sentinelRef };
}
