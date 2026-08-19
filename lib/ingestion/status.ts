import type { IPOStatus } from "@/types";

export type StatusInput = {
  hasDRHP?: boolean;
  hasRHP?: boolean;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  explicitStatus?: "withdrawn" | "deferred";
};

export type ExplicitStatusAuthority = {
  status?: string | null;
  sourceKind?: string | null;
  authorityLevel?: string | null;
  isOfficial?: boolean | null;
  verifiedAt?: Date | string | null;
};

/**
 * A provider status can only interrupt the date/document lifecycle when it is
 * an explicit cancellation from an official source, or a verified manual
 * decision. Other provider status text remains raw audit data and must not
 * become canonical state.
 */
export function authoritativeExplicitStatus(
  candidate: ExplicitStatusAuthority | undefined,
): StatusInput["explicitStatus"] {
  if (!candidate?.status) return undefined;
  const normalized = candidate.status.trim().toUpperCase().replace(/[ -]+/g, "_");
  const status = ["WITHDRAWN", "WITHDRAW", "CANCELLED", "CANCELED"].includes(normalized)
    ? "withdrawn"
    : normalized === "DEFERRED" || normalized === "POSTPONED" || normalized === "POSTPONE"
      ? "deferred"
      : undefined;
  if (!status) return undefined;

  const official = candidate.isOfficial === true
    && (candidate.authorityLevel === "OFFICIAL" || candidate.authorityLevel === "AUTHORIZED");
  const verifiedManual = candidate.sourceKind === "MANUAL"
    && candidate.authorityLevel === "MANUAL"
    && candidate.verifiedAt != null;
  return official || verifiedManual ? status : undefined;
}

const istDay = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

export function calculateIPOStatus(input: StatusInput, now = new Date()): IPOStatus {
  if (input.explicitStatus) return input.explicitStatus;
  const today = istDay(now);
  if (input.listingDate && today >= input.listingDate) return "listed";
  if (input.listingDate && input.allotmentDate && today >= input.allotmentDate) return "listing_upcoming";
  if (input.allotmentDate && input.closeDate && today >= input.allotmentDate) return "allotment_complete";
  if (input.closeDate && today > input.closeDate) return "allotment_pending";
  if (input.openDate && input.closeDate && today >= input.openDate && today <= input.closeDate) return "open";
  if (input.openDate && today < input.openDate) return "upcoming";
  if (input.hasRHP) return "rhp_filed";
  if (input.hasDRHP) return "drhp_filed";
  return "upcoming";
}

export function eventState(date: string, now = new Date()): "completed" | "current" | "upcoming" {
  const today = istDay(now);
  if (date < today) return "completed";
  if (date === today) return "current";
  return "upcoming";
}
