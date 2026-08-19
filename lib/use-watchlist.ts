"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parseWatchlist } from "./validation";

export const WATCHLIST_KEY = "artha-watchlist-v1";
const WATCHLIST_EVENT = "artha:watchlist";

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === WATCHLIST_KEY) callback(); };
  window.addEventListener("storage", onStorage);
  window.addEventListener(WATCHLIST_EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(WATCHLIST_EVENT, callback);
  };
}

function clientSnapshot() { return window.localStorage.getItem(WATCHLIST_KEY) ?? "[]"; }
function serverSnapshot() { return "[]"; }

export function useWatchlist() {
  const raw = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const ids = useMemo(() => parseWatchlist(raw), [raw]);

  const save = useCallback((next: string[]) => {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(WATCHLIST_EVENT));
  }, []);

  const toggle = useCallback((ipoId: string) => {
    const current = parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY));
    save(current.includes(ipoId) ? current.filter((id) => id !== ipoId) : [...current, ipoId]);
  }, [save]);

  const remove = useCallback((ipoId: string) => {
    save(parseWatchlist(window.localStorage.getItem(WATCHLIST_KEY)).filter((id) => id !== ipoId));
  }, [save]);

  return { ids, toggle, remove };
}
