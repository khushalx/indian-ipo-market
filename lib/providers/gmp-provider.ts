import { mockGMPHistory } from "@/data/mock-ipo-data";
import type { IPOGMPRecord } from "@/types";

export interface GMPProvider {
  getGMPHistory(ipoId: string): Promise<IPOGMPRecord[]>;
}

export class MockGMPProvider implements GMPProvider {
  async getGMPHistory(ipoId: string): Promise<IPOGMPRecord[]> {
    return mockGMPHistory.filter((record) => record.ipoId === ipoId).sort((a, b) => a.date.localeCompare(b.date));
  }
}
