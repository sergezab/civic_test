import { useCallback, useState } from "react";

const STORAGE_KEY = "civic_bookmarks";

function load(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function persist(set: Set<number>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export interface UseBookmarks {
  bookmarks: Set<number>;
  toggle: (id: number) => void;
  isBookmarked: (id: number) => boolean;
  count: number;
}

export function useBookmarks(): UseBookmarks {
  const [bookmarks, setBookmarks] = useState<Set<number>>(load);

  const toggle = useCallback((id: number) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const isBookmarked = useCallback(
    (id: number) => bookmarks.has(id),
    [bookmarks],
  );

  return { bookmarks, toggle, isBookmarked, count: bookmarks.size };
}
