import type { FreshnessState } from "@/types";

function configuredMinutes(name: string, fallback: number): number {
  const value = typeof process !== "undefined" ? Number(process.env[name]) : Number.NaN;
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function ageMinutes(value?: string, now = new Date()): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
}

export function gmpFreshness(value?: string, now = new Date()): FreshnessState {
  const age = ageMinutes(value, now);
  if (age == null) return "unknown";
  if (age < configuredMinutes("GMP_FRESH_MINUTES", 30)) return "fresh";
  if (age < configuredMinutes("GMP_RECENT_MINUTES", 120)) return "recent";
  if (age < configuredMinutes("GMP_DELAYED_MINUTES", 360)) return "delayed";
  return "stale";
}

export function relativeUpdatedAt(value?: string, now = new Date()): string {
  const age = ageMinutes(value, now);
  if (age == null) return "Update time unavailable";
  if (age < 1) return "Updated just now";
  if (age < 60) return `Updated ${age} min ago`;
  const hours = Math.floor(age / 60);
  if (hours < 24) return `Updated ${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}
