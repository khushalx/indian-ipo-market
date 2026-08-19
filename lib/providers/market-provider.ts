import { mockMarketIndices } from "@/data/mock-ipo-data";
import type { MarketIndex } from "@/types";

export interface MarketProvider {
  getMarketIndices(): Promise<MarketIndex[]>;
}

export class MockMarketProvider implements MarketProvider {
  async getMarketIndices(): Promise<MarketIndex[]> {
    return mockMarketIndices;
  }
}
