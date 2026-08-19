import type { IpoSyncTarget } from "@/lib/ingestion/store";

export type TargetSyncKind = "ipo-details" | "gmp" | "subscriptions" | "listed-performance";

const DAY = 86_400_000;

function dateAgeDays(value: string | null, now: Date): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00+05:30`).getTime();
  return Number.isFinite(parsed) ? Math.floor((now.getTime() - parsed) / DAY) : null;
}

/** Status-aware refresh policy; job-level intervals still enforce provider rate limits. */
export function isTargetEligible(kind: TargetSyncKind, target: IpoSyncTarget, now = new Date()): boolean {
  if (kind === "gmp") {
    return ["RHP_FILED", "UPCOMING", "OPEN", "CLOSED", "ALLOTMENT_PENDING", "ALLOTMENT_COMPLETE", "LISTING_UPCOMING"]
      .includes(target.status);
  }
  if (kind === "subscriptions") {
    return ["OPEN", "CLOSED", "ALLOTMENT_PENDING"].includes(target.status);
  }
  if (kind === "listed-performance") {
    const age = dateAgeDays(target.listingDate, now);
    return target.status === "LISTED" && (age == null || age <= 730);
  }
  if (["WITHDRAWN", "DEFERRED"].includes(target.status)) {
    return now.getTime() - target.lastSyncedAt.getTime() >= 7 * DAY;
  }
  if (target.status === "LISTED") {
    const age = dateAgeDays(target.listingDate, now);
    return age == null || age <= 90 || now.getTime() - target.lastSyncedAt.getTime() >= 30 * DAY;
  }
  return true;
}

