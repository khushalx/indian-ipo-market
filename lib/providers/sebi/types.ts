export type SebiPublicIssueSection = 10 | 11 | 12;

export type SebiLinkedDocument = {
  title: string;
  documentUrl: string;
};

export type ParsedSebiListingEntry = {
  section: SebiPublicIssueSection;
  filingDate: string;
  title: string;
  detailUrl: string;
  linkedDocuments: SebiLinkedDocument[];
};

export type SEBIProviderOptions = {
  /** Kept injectable for deterministic contract tests; production should use the official default. */
  origin?: string;
  detailConcurrency?: number;
  maxEntriesPerSection?: number;
  attempts?: number;
  timeoutMs?: number;
};
