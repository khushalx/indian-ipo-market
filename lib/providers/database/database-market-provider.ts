import type { MarketProvider } from "@/lib/providers/market-provider";
import type { MarketIndex, ProviderStatus } from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

export class DatabaseMarketProvider implements MarketProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getMarketIndices(): Promise<MarketIndex[]> {
    return this.repository.getMarketIndices();
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses(["MARKET_DATA"]);
  }
}
