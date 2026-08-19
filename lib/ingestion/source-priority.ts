import type { DocumentType, SourceType } from "@/types";

export const SOURCE_PRIORITY = {
  manualVerified: 1000,
  sebi: 900,
  offerDocument: 850,
  exchange: 750,
  registrar: 700,
  structuredProvider: 500,
  editorial: 300,
  derived: 200,
} as const;

export function sourcePriority(sourceName: string, sourceType: SourceType, fieldName?: string): number {
  const normalized = sourceName.toLowerCase();
  if (sourceType === "manual") return SOURCE_PRIORITY.manualVerified;
  if (normalized.includes("sebi") || sourceType === "regulator") return SOURCE_PRIORITY.sebi;
  if (sourceType === "offer_document") return SOURCE_PRIORITY.offerDocument;
  if (sourceType === "exchange") return SOURCE_PRIORITY.exchange;
  if (sourceType === "registrar") return SOURCE_PRIORITY.registrar;
  if (fieldName === "gmp") return sourceType === "third_party" ? SOURCE_PRIORITY.structuredProvider : 0;
  if (sourceType === "third_party") return SOURCE_PRIORITY.structuredProvider;
  if (sourceType === "editorial") return SOURCE_PRIORITY.editorial;
  if (sourceType === "derived") return SOURCE_PRIORITY.derived;
  return 100;
}

export function documentPriority(type: DocumentType): number {
  if (type === "rhp" || type === "prospectus" || type === "final_offer_document") return 950;
  if (type === "updated_drhp") return 910;
  if (type === "drhp") return 900;
  if (type === "corrigendum" || type === "addendum") return 925;
  if (type === "abridged_prospectus") return 875;
  return 500;
}
