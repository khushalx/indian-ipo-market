/**
 * PostgreSQL-ready schema for Neon or Supabase. This intentionally coexists with
 * the starter D1 schema; choose this file in a future PostgreSQL Drizzle config.
 */
import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const ipoTypeEnum = pgEnum("ipo_type", ["mainboard", "sme"]);
export const ipoStatusEnum = pgEnum("ipo_status", ["upcoming", "open", "closed", "listed", "withdrawn"]);
export const exchangeEnum = pgEnum("exchange", ["NSE", "BSE", "NSE_EMERGE", "BSE_SME"]);
export const eventTypeEnum = pgEnum("ipo_event_type", ["drhp_filed", "sebi_observation", "rhp_filed", "anchor_allocation", "ipo_open", "ipo_close", "basis_of_allotment", "demat_credit", "listing"]);
export const eventStateEnum = pgEnum("ipo_event_state", ["completed", "current", "upcoming"]);
export const sourceTypeEnum = pgEnum("source_type", ["regulator", "exchange", "registrar", "offer_document", "issuer", "third_party", "editorial"]);
export const documentTypeEnum = pgEnum("ipo_document_type", ["drhp", "rhp", "final_offer_document", "anchor_allocation", "basis_of_allotment", "annual_report", "other"]);
export const newsCategoryEnum = pgEnum("news_category", ["ipo", "markets", "results", "regulation", "listing"]);
export const shareholdingCategoryEnum = pgEnum("shareholding_category", ["promoters", "public", "institutions", "employees"]);

const id = () => uuid("id").defaultRandom().primaryKey();
const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const sources = pgTable("sources", {
  id: id(),
  sourceName: varchar("source_name", { length: 160 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull(),
  isOfficial: boolean("is_official").notNull().default(false),
  ...auditColumns,
});

export const companies = pgTable("companies", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  legalName: varchar("legal_name", { length: 220 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull(),
  industry: varchar("industry", { length: 120 }).notNull(),
  sector: varchar("sector", { length: 120 }).notNull(),
  foundedYear: integer("founded_year"),
  headquarters: varchar("headquarters", { length: 160 }),
  website: text("website"),
  overview: text("overview"),
  promoters: jsonb("promoters").$type<string[]>().notNull().default([]),
  managingDirector: varchar("managing_director", { length: 160 }),
  keyProducts: jsonb("key_products").$type<string[]>().notNull().default([]),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  risks: jsonb("risks").$type<string[]>().notNull().default([]),
  sourceId: uuid("source_id").references(() => sources.id),
  ...auditColumns,
}, (table) => [uniqueIndex("companies_slug_unique").on(table.slug), index("companies_sector_idx").on(table.sector)]);

export const registrars = pgTable("registrars", {
  id: id(),
  name: varchar("name", { length: 180 }).notNull(),
  website: text("website").notNull(),
  allotmentUrl: text("allotment_url"),
  supportEmail: varchar("support_email", { length: 254 }),
  sourceId: uuid("source_id").references(() => sources.id),
  ...auditColumns,
}, (table) => [uniqueIndex("registrars_name_unique").on(table.name)]);

export const ipos = pgTable("ipos", {
  id: id(),
  slug: varchar("slug", { length: 220 }).notNull(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  type: ipoTypeEnum("type").notNull(),
  status: ipoStatusEnum("status").notNull(),
  exchanges: jsonb("exchanges").$type<Array<"NSE" | "BSE" | "NSE_EMERGE" | "BSE_SME">>().notNull(),
  faceValue: numeric("face_value", { precision: 12, scale: 2 }).notNull(),
  priceBandMin: numeric("price_band_min", { precision: 12, scale: 2 }).notNull(),
  priceBandMax: numeric("price_band_max", { precision: 12, scale: 2 }).notNull(),
  lotSize: integer("lot_size").notNull(),
  issueSizeCr: numeric("issue_size_cr", { precision: 16, scale: 2 }).notNull(),
  freshIssueCr: numeric("fresh_issue_cr", { precision: 16, scale: 2 }).notNull(),
  offerForSaleCr: numeric("offer_for_sale_cr", { precision: 16, scale: 2 }).notNull(),
  employeeReservationCr: numeric("employee_reservation_cr", { precision: 16, scale: 2 }),
  shareholderReservationCr: numeric("shareholder_reservation_cr", { precision: 16, scale: 2 }),
  openDate: date("open_date"),
  closeDate: date("close_date"),
  allotmentDate: date("allotment_date"),
  dematDate: date("demat_date"),
  listingDate: date("listing_date"),
  listingPrice: numeric("listing_price", { precision: 12, scale: 2 }),
  issuePrice: numeric("issue_price", { precision: 12, scale: 2 }),
  estimatedListingPrice: numeric("estimated_listing_price", { precision: 12, scale: 2 }),
  listingGainPercent: numeric("listing_gain_percent", { precision: 9, scale: 2 }),
  registrarId: uuid("registrar_id").references(() => registrars.id),
  leadManagers: jsonb("lead_managers").$type<string[]>().notNull().default([]),
  gmp: numeric("gmp", { precision: 12, scale: 2 }),
  gmpUpdatedAt: timestamp("gmp_updated_at", { withTimezone: true }),
  subscriptionTotal: numeric("subscription_total", { precision: 14, scale: 2 }),
  preIssuePromoterHolding: numeric("pre_issue_promoter_holding", { precision: 7, scale: 2 }),
  postIssuePromoterHolding: numeric("post_issue_promoter_holding", { precision: 7, scale: 2 }),
  marketCapAtUpperBandCr: numeric("market_cap_upper_band_cr", { precision: 18, scale: 2 }),
  ipoPe: numeric("ipo_pe", { precision: 12, scale: 2 }),
  industryPe: numeric("industry_pe", { precision: 12, scale: 2 }),
  priceToBook: numeric("price_to_book", { precision: 12, scale: 2 }),
  evToEbitda: numeric("ev_to_ebitda", { precision: 12, scale: 2 }),
  sourceId: uuid("source_id").references(() => sources.id),
  isMock: boolean("is_mock").notNull().default(false),
  ...auditColumns,
}, (table) => [uniqueIndex("ipos_slug_unique").on(table.slug), index("ipos_status_open_date_idx").on(table.status, table.openDate), index("ipos_company_idx").on(table.companyId)]);

export const ipoUseOfProceeds = pgTable("ipo_use_of_proceeds", {
  id: id(),
  ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }),
  label: varchar("label", { length: 220 }).notNull(),
  amountCr: numeric("amount_cr", { precision: 16, scale: 2 }).notNull(),
  percentage: numeric("percentage", { precision: 7, scale: 2 }).notNull(),
  sourceId: uuid("source_id").references(() => sources.id),
  ...auditColumns,
}, (table) => [index("proceeds_ipo_idx").on(table.ipoId)]);

export const ipoEvents = pgTable("ipo_events", {
  id: id(),
  ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }),
  type: eventTypeEnum("type").notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  eventDate: date("event_date").notNull(),
  state: eventStateEnum("state").notNull(),
  note: text("note"),
  sourceId: uuid("source_id").references(() => sources.id),
  ...auditColumns,
}, (table) => [index("ipo_events_date_idx").on(table.eventDate), index("ipo_events_ipo_idx").on(table.ipoId)]);

export const ipoFinancials = pgTable("ipo_financials", {
  id: id(),
  ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }),
  fiscalYear: varchar("fiscal_year", { length: 8 }).notNull(),
  revenueCr: numeric("revenue_cr", { precision: 16, scale: 2 }), revenueGrowthPercent: numeric("revenue_growth_percent", { precision: 9, scale: 2 }), ebitdaCr: numeric("ebitda_cr", { precision: 16, scale: 2 }), ebitdaMarginPercent: numeric("ebitda_margin_percent", { precision: 9, scale: 2 }), patCr: numeric("pat_cr", { precision: 16, scale: 2 }), patMarginPercent: numeric("pat_margin_percent", { precision: 9, scale: 2 }), totalAssetsCr: numeric("total_assets_cr", { precision: 16, scale: 2 }), netWorthCr: numeric("net_worth_cr", { precision: 16, scale: 2 }), totalDebtCr: numeric("total_debt_cr", { precision: 16, scale: 2 }), operatingCashFlowCr: numeric("operating_cash_flow_cr", { precision: 16, scale: 2 }), roePercent: numeric("roe_percent", { precision: 9, scale: 2 }), rocePercent: numeric("roce_percent", { precision: 9, scale: 2 }), debtToEquity: numeric("debt_to_equity", { precision: 10, scale: 2 }), eps: numeric("eps", { precision: 12, scale: 2 }), nav: numeric("nav", { precision: 12, scale: 2 }),
  sourceId: uuid("source_id").references(() => sources.id),
  ...auditColumns,
}, (table) => [uniqueIndex("ipo_financial_year_unique").on(table.ipoId, table.fiscalYear)]);

export const ipoSubscriptions = pgTable("ipo_subscriptions", {
  id: id(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), asOfDate: date("as_of_date").notNull(), day: integer("day").notNull(), qib: numeric("qib", { precision: 14, scale: 2 }), nii: numeric("nii", { precision: 14, scale: 2 }), bnii: numeric("bnii", { precision: 14, scale: 2 }), snii: numeric("snii", { precision: 14, scale: 2 }), retail: numeric("retail", { precision: 14, scale: 2 }), employee: numeric("employee", { precision: 14, scale: 2 }), shareholder: numeric("shareholder", { precision: 14, scale: 2 }), total: numeric("total", { precision: 14, scale: 2 }).notNull(), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [uniqueIndex("ipo_subscription_day_unique").on(table.ipoId, table.day)]);

export const ipoGmpRecords = pgTable("ipo_gmp_records", {
  id: id(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), recordDate: date("record_date").notNull(), gmp: numeric("gmp", { precision: 12, scale: 2 }).notNull(), estimatedListingPrice: numeric("estimated_listing_price", { precision: 12, scale: 2 }), gmpPercent: numeric("gmp_percent", { precision: 9, scale: 2 }), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [uniqueIndex("ipo_gmp_day_unique").on(table.ipoId, table.recordDate)]);

export const ipoDocuments = pgTable("ipo_documents", {
  id: id(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), type: documentTypeEnum("type").notNull(), title: varchar("title", { length: 220 }).notNull(), publishedAt: date("published_at").notNull(), url: text("url").notNull(), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [index("ipo_documents_ipo_idx").on(table.ipoId)]);

export const ipoPeers = pgTable("ipo_peers", {
  id: id(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), companyName: varchar("company_name", { length: 180 }).notNull(), revenueCr: numeric("revenue_cr", { precision: 16, scale: 2 }), patCr: numeric("pat_cr", { precision: 16, scale: 2 }), pe: numeric("pe", { precision: 12, scale: 2 }), roePercent: numeric("roe_percent", { precision: 9, scale: 2 }), marketCapCr: numeric("market_cap_cr", { precision: 18, scale: 2 }), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [index("ipo_peers_ipo_idx").on(table.ipoId)]);

export const ipoShareholdings = pgTable("ipo_shareholdings", {
  id: id(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), category: shareholdingCategoryEnum("category").notNull(), preIssuePercent: numeric("pre_issue_percent", { precision: 7, scale: 2 }), postIssuePercent: numeric("post_issue_percent", { precision: 7, scale: 2 }), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [uniqueIndex("ipo_shareholding_category_unique").on(table.ipoId, table.category)]);

export const newsArticles = pgTable("news_articles", {
  id: id(), slug: varchar("slug", { length: 220 }).notNull(), headline: text("headline").notNull(), summary: text("summary").notNull(), category: newsCategoryEnum("category").notNull(), companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }), ipoId: uuid("ipo_id").references(() => ipos.id, { onDelete: "set null" }), publishedAt: timestamp("published_at", { withTimezone: true }).notNull(), imageUrl: text("image_url"), sourceId: uuid("source_id").references(() => sources.id), ...auditColumns,
}, (table) => [uniqueIndex("news_slug_unique").on(table.slug), index("news_published_at_idx").on(table.publishedAt)]);

export const marketIndices = pgTable("market_indices", {
  id: id(), name: varchar("name", { length: 80 }).notNull(), value: numeric("value", { precision: 18, scale: 4 }).notNull(), change: numeric("change", { precision: 18, scale: 4 }).notNull(), changePercent: numeric("change_percent", { precision: 10, scale: 4 }).notNull(), asOf: timestamp("as_of", { withTimezone: true }).notNull(), sourceId: uuid("source_id").references(() => sources.id), isMock: boolean("is_mock").notNull().default(false), ...auditColumns,
}, (table) => [index("market_indices_name_as_of_idx").on(table.name, table.asOf)]);

export const watchlistItems = pgTable("watchlist_items", {
  id: id(), userId: varchar("user_id", { length: 255 }).notNull(), ipoId: uuid("ipo_id").notNull().references(() => ipos.id, { onDelete: "cascade" }), ...auditColumns,
}, (table) => [uniqueIndex("watchlist_user_ipo_unique").on(table.userId, table.ipoId)]);
