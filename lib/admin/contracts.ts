export const adminSyncJobs = [
  "all",
  "sync-nse-offer-documents",
  "sync-sebi-filings",
  "sync-ipo-details",
  "sync-gmp",
  "sync-subscriptions",
  "sync-news",
  "sync-market",
  "sync-listed-performance",
] as const;

export type AdminSyncJob = (typeof adminSyncJobs)[number];

export const adminIpoFields = [
  "board",
  "issueType",
  "status",
  "statusReason",
  "isin",
  "faceValue",
  "priceBandMin",
  "priceBandMax",
  "issuePrice",
  "lotSize",
  "issueSizeCr",
  "freshIssueCr",
  "offerForSaleCr",
  "anchorDate",
  "openDate",
  "closeDate",
  "allotmentDate",
  "refundDate",
  "dematDate",
  "listingDate",
  "registrarName",
  "registrarUrl",
] as const;

export type AdminIpoField = (typeof adminIpoFields)[number];

export const adminIpoFieldLabels: Record<AdminIpoField, string> = {
  board: "Board",
  issueType: "Issue type",
  status: "Cancellation status (withdrawn/deferred)",
  statusReason: "Status reason",
  isin: "ISIN",
  faceValue: "Face value",
  priceBandMin: "Price band minimum",
  priceBandMax: "Price band maximum",
  issuePrice: "Issue price",
  lotSize: "Lot size",
  issueSizeCr: "Issue size (crore)",
  freshIssueCr: "Fresh issue (crore)",
  offerForSaleCr: "Offer for sale (crore)",
  anchorDate: "Anchor date",
  openDate: "Open date",
  closeDate: "Close date",
  allotmentDate: "Allotment date",
  refundDate: "Refund date",
  dematDate: "Demat date",
  listingDate: "Listing date",
  registrarName: "Registrar name",
  registrarUrl: "Registrar URL",
};

export type AdminActionResult = {
  ok: true;
  message: string;
  actionId?: string;
};
