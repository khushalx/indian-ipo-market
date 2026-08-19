import type {
  NormalizedGMPRecord,
  NormalizedSubscriptionSnapshot,
  StructuredIPORecord,
} from "@/lib/ingestion/schemas";

import type { NormalizedIPOCalendarEntry, NormalizedListingData } from "./schemas";

export interface StructuredIPOProvider {
  getCurrentIPOs(): Promise<StructuredIPORecord[]>;
  getUpcomingIPOs(): Promise<StructuredIPORecord[]>;
  getIPO(identifier: string): Promise<StructuredIPORecord | null>;
  getSubscription(identifier: string): Promise<NormalizedSubscriptionSnapshot[]>;
  getGMP(identifier: string): Promise<NormalizedGMPRecord | null>;
  getGMPHistory(identifier: string): Promise<NormalizedGMPRecord[]>;
  getListingData(identifier: string): Promise<NormalizedListingData | null>;
  getIPOCalendar(): Promise<NormalizedIPOCalendarEntry[]>;
}

export type ThirdPartyIPOEndpoints = {
  current: string;
  upcoming: string;
  detail: string;
  subscription: string;
  gmp: string;
  gmpHistory: string;
  listing: string;
  calendar: string;
};

export type ThirdPartyIPOProviderOptions = {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyHeader?: string;
  apiKeyPrefix?: string;
  attempts?: number;
  timeoutMs?: number;
  endpoints?: Partial<ThirdPartyIPOEndpoints>;
};
