import type { DocumentType } from "@/types";

const entityMap: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
};

export function decodeHtml(value: string): string {
  return value
    .replace(/&(amp|quot|#39|apos|nbsp|ndash|mdash);/gi, (entity) => entityMap[entity.toLowerCase()] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompanyName(value: string): string {
  return stripHtml(value)
    .toLowerCase()
    .replace(/\b(limited|ltd\.?|pvt\.?|private)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function companyNameFromFilingTitle(title: string): string {
  return stripHtml(title)
    .replace(/\s*[-–—:]\s*(updated\s+)?(draft\s+)?(red\s+herring\s+prospectus|drhp|udrhp|rhp|abridged\s+prospectus|draft\s+abridged\s+prospectus|prospectus|corrigendum.*|addendum.*)$/i, "")
    .trim();
}

export function slugifyCompany(value: string): string {
  return normalizeCompanyName(value).replace(/\s+/g, "-") || "unresolved-company";
}

export function stableId(namespace: string, ...values: Array<string | number | undefined>): string {
  const input = `${namespace}:${values.map((value) => String(value ?? "")).join("|")}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${namespace}_${(hash >>> 0).toString(36)}`;
}

export function filingDocumentType(title: string): DocumentType {
  const value = stripHtml(title).toLowerCase();
  if (value.includes("corrigendum")) return "corrigendum";
  if (value.includes("addendum")) return "addendum";
  if (value.includes("abridged")) return "abridged_prospectus";
  if (value.includes("udrhp") || value.includes("updated drhp")) return "updated_drhp";
  if (value.includes("drhp") || value.includes("dp_drhp") || value.includes("draft offer")) return "drhp";
  if (value.includes("rhp") || value.includes("red herring")) return "rhp";
  if (value.includes("final offer")) return "final_offer_document";
  if (value.includes("prospectus") || /\bprosp\b/.test(value)) return "prospectus";
  return "other";
}

export function parseSebiDate(value: string): string | null {
  const parsed = new Date(`${value.trim()} 00:00:00 GMT+0530`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function finiteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
}
