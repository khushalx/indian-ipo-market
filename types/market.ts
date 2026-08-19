/**
 * Domain models used by the IPO data layer. Values are intentionally source-aware
 * so mock providers can be replaced with verified market-data integrations.
 */

export type IPOType = "mainboard" | "sme";
export type IPOStatus = "upcoming" | "open" | "closed" | "listed" | "withdrawn";
export type Exchange = "NSE" | "BSE" | "NSE_EMERGE" | "BSE_SME";
export type EventType =
  | "drhp_filed"
  | "sebi_observation"
  | "rhp_filed"
  | "anchor_allocation"
  | "ipo_open"
  | "ipo_close"
  | "basis_of_allotment"
  | "demat_credit"
  | "listing";
export type EventState = "completed" | "current" | "upcoming";
export type SourceType =
  | "regulator"
  | "exchange"
  | "registrar"
  | "offer_document"
  | "issuer"
  | "third_party"
  | "editorial";
export type DocumentType =
  | "drhp"
  | "rhp"
  | "final_offer_document"
  | "anchor_allocation"
  | "basis_of_allotment"
  | "annual_report"
  | "other";
export type NewsCategory = "ipo" | "markets" | "results" | "regulation" | "listing";

export interface Source {
  id: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: SourceType;
  lastUpdated: string;
  isOfficial?: boolean;
}

export interface IPORegistrar {
  id: string;
  name: string;
  website: string;
  allotmentUrl?: string;
  supportEmail?: string;
  source: Source;
}

export interface Company {
  id: string;
  name: string;
  legalName: string;
  slug: string;
  industry: string;
  sector: string;
  foundedYear: number;
  headquarters: string;
  website?: string;
  overview: string;
  promoters: string[];
  managingDirector?: string;
  keyProducts: string[];
  strengths: string[];
  risks: string[];
  source: Source;
}

export interface IPOUseOfProceeds {
  label: string;
  amountCr: number;
  percentage: number;
}

export interface IPO {
  id: string;
  slug: string;
  companyId: string;
  company: Company;
  type: IPOType;
  exchange: Exchange[];
  status: IPOStatus;
  faceValue: number;
  priceBandMin: number;
  priceBandMax: number;
  lotSize: number;
  issueSizeCr: number;
  freshIssueCr: number;
  offerForSaleCr: number;
  employeeReservationCr?: number;
  shareholderReservationCr?: number;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  dematDate?: string;
  listingDate?: string;
  listingPrice?: number;
  issuePrice?: number;
  estimatedListingPrice?: number;
  listingGainPercent?: number;
  registrar: IPORegistrar;
  leadManagers: string[];
  gmp?: number;
  gmpUpdatedAt?: string;
  subscriptionTotal?: number;
  preIssuePromoterHolding?: number;
  postIssuePromoterHolding?: number;
  marketCapAtUpperBandCr?: number;
  ipoPE?: number;
  industryPE?: number;
  priceToBook?: number;
  evToEbitda?: number;
  source: Source;
  useOfProceeds?: IPOUseOfProceeds[];
  mockDisclaimer: true;
}

export interface IPOEvent {
  id: string;
  ipoId: string;
  type: EventType;
  label: string;
  date: string;
  state: EventState;
  note?: string;
  source: Source;
}

export interface IPOFinancial {
  id: string;
  ipoId: string;
  fiscalYear: "FY22" | "FY23" | "FY24" | "FY25";
  revenueCr?: number;
  revenueGrowthPercent?: number;
  ebitdaCr?: number;
  ebitdaMarginPercent?: number;
  patCr?: number;
  patMarginPercent?: number;
  totalAssetsCr?: number;
  netWorthCr?: number;
  totalDebtCr?: number;
  operatingCashFlowCr?: number;
  roePercent?: number;
  rocePercent?: number;
  debtToEquity?: number;
  eps?: number;
  nav?: number;
  source: Source;
}

export interface IPOSubscription {
  id: string;
  ipoId: string;
  asOfDate: string;
  day: number;
  qib?: number;
  nii?: number;
  bnii?: number;
  snii?: number;
  retail?: number;
  employee?: number;
  shareholder?: number;
  total: number;
  source: Source;
}

export interface IPOGMPRecord {
  id: string;
  ipoId: string;
  date: string;
  gmp: number;
  estimatedListingPrice?: number;
  gmpPercent?: number;
  source: Source;
}

export interface IPODocument {
  id: string;
  ipoId: string;
  type: DocumentType;
  title: string;
  publishedAt: string;
  url: string;
  source: Source;
}

export interface IPOPeer {
  id: string;
  ipoId: string;
  companyName: string;
  revenueCr?: number;
  patCr?: number;
  pe?: number;
  roePercent?: number;
  marketCapCr?: number;
  source: Source;
}

export interface IPOShareholding {
  id: string;
  ipoId: string;
  category: "promoters" | "public" | "institutions" | "employees";
  preIssuePercent?: number;
  postIssuePercent?: number;
  source: Source;
}

export interface NewsArticle {
  id: string;
  headline: string;
  slug: string;
  summary: string;
  category: NewsCategory;
  companyId?: string;
  ipoId?: string;
  publishedAt: string;
  source: Source;
  imageUrl?: string;
}

export interface MarketIndex {
  id: string;
  name: "NIFTY 50" | "SENSEX" | "BANK NIFTY" | "INDIA VIX" | string;
  value: number;
  change: number;
  changePercent: number;
  asOf: string;
  source: Source;
  mockDisclaimer: true;
}

export interface WatchlistItem {
  id: string;
  ipoId: string;
  createdAt: string;
  updatedAt?: string;
  userId?: string;
}

export interface IPOFilters {
  type?: IPOType;
  status?: IPOStatus;
  exchange?: Exchange;
  year?: number;
  minIssueSizeCr?: number;
  maxIssueSizeCr?: number;
  query?: string;
}

export type IPOSort = "newest" | "issue_size" | "gmp_percent" | "subscription" | "listing_gain";

export interface NewsFilters {
  ipoId?: string;
  companyId?: string;
  category?: NewsCategory;
  limit?: number;
}
