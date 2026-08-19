import { getRuntimeConfig } from "@/lib/env";
import type {
  NormalizedGMPRecord,
  NormalizedSubscriptionSnapshot,
  StructuredIPORecord,
} from "@/lib/ingestion/schemas";

import { endpointWithIdentifier, ExternalJSONClient } from "../shared/external-json";
import {
  normalizeCalendarEntries,
  normalizeGMPRecords,
  normalizeIPORecord,
  normalizeIPORecords,
  normalizeListingData,
  normalizeSubscriptionRecords,
} from "./normalizers";
import type { NormalizedIPOCalendarEntry, NormalizedListingData } from "./schemas";
import type { StructuredIPOProvider, ThirdPartyIPOEndpoints, ThirdPartyIPOProviderOptions } from "./types";

const defaultEndpoints: ThirdPartyIPOEndpoints = {
  current: "/ipos/current",
  upcoming: "/ipos/upcoming",
  detail: "/ipos/:identifier",
  subscription: "/ipos/:identifier/subscription",
  gmp: "/ipos/:identifier/gmp",
  gmpHistory: "/ipos/:identifier/gmp/history",
  listing: "/ipos/:identifier/listing",
  calendar: "/ipos/calendar",
};

export class ThirdPartyIPOProvider implements StructuredIPOProvider {
  private readonly client: ExternalJSONClient;
  private readonly endpoints: ThirdPartyIPOEndpoints;

  constructor(options: ThirdPartyIPOProviderOptions = {}) {
    const runtime = getRuntimeConfig();
    this.client = new ExternalJSONClient({
      providerName: options.providerName ?? runtime.IPO_DATA_PROVIDER ?? "IPO API",
      baseUrl: options.baseUrl ?? runtime.IPO_API_BASE_URL ?? "",
      apiKey: options.apiKey ?? runtime.IPO_API_KEY,
      apiKeyHeader: options.apiKeyHeader ?? runtime.IPO_API_KEY_HEADER,
      apiKeyPrefix: options.apiKeyPrefix
        ?? runtime.IPO_API_KEY_PREFIX
        ?? (runtime.IPO_API_KEY_HEADER && runtime.IPO_API_KEY_HEADER.toLowerCase() !== "authorization" ? "" : undefined),
      attempts: options.attempts,
      timeoutMs: options.timeoutMs,
    }, { requireApiKey: true });
    this.endpoints = { ...defaultEndpoints, ...options.endpoints };
  }

  async getCurrentIPOs(): Promise<StructuredIPORecord[]> {
    const payload = await this.client.get(this.endpoints.current, "get-current-ipos");
    return normalizeIPORecords(payload, this.client.providerName, ["currentIPOs", "current_ipos", "ipos"]);
  }

  async getUpcomingIPOs(): Promise<StructuredIPORecord[]> {
    const payload = await this.client.get(this.endpoints.upcoming, "get-upcoming-ipos");
    return normalizeIPORecords(payload, this.client.providerName, ["upcomingIPOs", "upcoming_ipos", "ipos"]);
  }

  async getIPO(identifier: string): Promise<StructuredIPORecord | null> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.detail, identifier), "get-ipo");
    const record = normalizeIPORecords(payload, this.client.providerName, ["ipo"])[0];
    if (record) return record;
    const candidate = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    return candidate ? normalizeIPORecord(candidate, this.client.providerName, identifier) : null;
  }

  async getSubscription(identifier: string): Promise<NormalizedSubscriptionSnapshot[]> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.subscription, identifier), "get-subscription");
    return normalizeSubscriptionRecords(payload, this.client.providerName, identifier);
  }

  async getGMP(identifier: string): Promise<NormalizedGMPRecord | null> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.gmp, identifier), "get-gmp");
    return normalizeGMPRecords(payload, this.client.providerName, identifier).at(-1) ?? null;
  }

  async getGMPHistory(identifier: string): Promise<NormalizedGMPRecord[]> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.gmpHistory, identifier), "get-gmp-history");
    return normalizeGMPRecords(payload, this.client.providerName, identifier);
  }

  async getListingData(identifier: string): Promise<NormalizedListingData | null> {
    const payload = await this.client.get(endpointWithIdentifier(this.endpoints.listing, identifier), "get-listing-data");
    return normalizeListingData(payload, this.client.providerName, identifier);
  }

  async getIPOCalendar(): Promise<NormalizedIPOCalendarEntry[]> {
    const payload = await this.client.get(this.endpoints.calendar, "get-ipo-calendar");
    return normalizeCalendarEntries(payload, this.client.providerName);
  }
}
