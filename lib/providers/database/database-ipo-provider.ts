import type { IPOProvider } from "@/lib/providers/ipo-provider";
import type {
  IPO,
  IPOEvent,
  IPOFilters,
  IPOFinancial,
  IPOShareholding,
  IPOSort,
  IPOSubscription,
  ProviderStatus,
} from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

const IPO_SOURCE_KINDS = [
  "REGULATOR",
  "EXCHANGE",
  "REGISTRAR",
  "OFFER_DOCUMENT",
  "ISSUER",
  "STRUCTURED_API",
  "MANUAL",
  "DERIVED",
] as const;

export class DatabaseIPOProvider implements IPOProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getIPOs(filters: IPOFilters = {}, sort: IPOSort = "newest"): Promise<IPO[]> {
    return this.repository.getIPOs(filters, sort);
  }

  getIPOBySlug(slug: string): Promise<IPO | null> {
    return this.repository.getIPOBySlug(slug);
  }

  getIPOFinancials(ipoId: string): Promise<IPOFinancial[]> {
    return this.repository.getIPOFinancials(ipoId);
  }

  getSubscription(ipoId: string): Promise<IPOSubscription[]> {
    return this.repository.getSubscriptions(ipoId);
  }

  getIPOEvents(ipoId?: string): Promise<IPOEvent[]> {
    return this.repository.getIPOEvents(ipoId);
  }

  /** The Phase 2 D1 schema has no normalized shareholding table yet. */
  async getShareholding(ipoId: string): Promise<IPOShareholding[]> {
    void ipoId;
    return [];
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses(IPO_SOURCE_KINDS);
  }
}
