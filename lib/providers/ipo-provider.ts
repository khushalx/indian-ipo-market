import { mockFinancials, mockIPOEvents, mockIPOs, mockShareholdings, mockSubscriptions } from "@/data/mock-ipo-data";
import type { IPO, IPOEvent, IPOFilters, IPOFinancial, IPOShareholding, IPOSort, IPOSubscription } from "@/types";

export interface IPOProvider {
  getIPOs(filters?: IPOFilters, sort?: IPOSort): Promise<IPO[]>;
  getIPOBySlug(slug: string): Promise<IPO | null>;
  getIPOFinancials(ipoId: string): Promise<IPOFinancial[]>;
  getSubscription(ipoId: string): Promise<IPOSubscription[]>;
  /** Without an ID, returns the calendar feed across every IPO. */
  getIPOEvents(ipoId?: string): Promise<IPOEvent[]>;
  getShareholding(ipoId: string): Promise<IPOShareholding[]>;
}

const newestFirst = (left: IPO, right: IPO) => (right.openDate ?? "").localeCompare(left.openDate ?? "");

export class MockIPOProvider implements IPOProvider {
  async getIPOs(filters: IPOFilters = {}, sort: IPOSort = "newest"): Promise<IPO[]> {
    const query = filters.query?.trim().toLowerCase();
    const filtered = mockIPOs.filter((ipo) => {
      const matchesQuery = !query || [ipo.company.name, ipo.company.legalName, ipo.company.industry, ipo.slug].some((value) => value.toLowerCase().includes(query));
      const matchesYear = !filters.year || ipo.openDate?.startsWith(String(filters.year));
      return (!filters.type || ipo.type === filters.type) && (!filters.status || ipo.status === filters.status) && (!filters.exchange || ipo.exchange.includes(filters.exchange)) && (!filters.minIssueSizeCr || ipo.issueSizeCr >= filters.minIssueSizeCr) && (!filters.maxIssueSizeCr || ipo.issueSizeCr <= filters.maxIssueSizeCr) && matchesYear && matchesQuery;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "issue_size") return b.issueSizeCr - a.issueSizeCr;
      if (sort === "subscription") return (b.subscriptionTotal ?? -1) - (a.subscriptionTotal ?? -1);
      if (sort === "listing_gain") return (b.listingGainPercent ?? -Infinity) - (a.listingGainPercent ?? -Infinity);
      if (sort === "gmp_percent") return ((b.gmp ?? -Infinity) / b.priceBandMax) - ((a.gmp ?? -Infinity) / a.priceBandMax);
      return newestFirst(a, b);
    });
  }

  async getIPOBySlug(slug: string): Promise<IPO | null> {
    return mockIPOs.find((ipo) => ipo.slug === slug) ?? null;
  }

  async getIPOFinancials(ipoId: string): Promise<IPOFinancial[]> {
    return mockFinancials.filter((financial) => financial.ipoId === ipoId);
  }

  async getSubscription(ipoId: string): Promise<IPOSubscription[]> {
    return mockSubscriptions.filter((subscription) => subscription.ipoId === ipoId).sort((a, b) => a.day - b.day);
  }

  async getIPOEvents(ipoId?: string): Promise<IPOEvent[]> {
    return mockIPOEvents.filter((event) => !ipoId || event.ipoId === ipoId).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getShareholding(ipoId: string): Promise<IPOShareholding[]> {
    return mockShareholdings.filter((holding) => holding.ipoId === ipoId);
  }
}
