"use client";

import { Bookmark } from "lucide-react";
import { useWatchlist } from "@/lib/use-watchlist";
import styles from "./watchlist-button.module.css";

type Props = {
  ipoId: string;
  compact?: boolean;
  className?: string;
};

export function WatchlistButton({ ipoId, compact = false, className = "" }: Props) {
  const { ids, toggle } = useWatchlist();
  const saved = ids.includes(ipoId);

  return (
    <button
      type="button"
      className={`${styles.button} ${saved ? styles.saved : ""} ${compact ? styles.compact : ""} ${className}`}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(ipoId); }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
      title={saved ? "Remove from watchlist" : "Add to watchlist"}
    >
      <Bookmark size={compact ? 14 : 15} fill={saved ? "currentColor" : "none"} aria-hidden="true" />
      {!compact && <span>{saved ? "Watching" : "Add to Watchlist"}</span>}
    </button>
  );
}
