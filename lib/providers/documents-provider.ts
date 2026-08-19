import { mockDocuments, mockPeers } from "@/data/mock-ipo-data";
import type { IPODocument, IPOPeer } from "@/types";

export interface DocumentsProvider {
  getDocuments(ipoId: string): Promise<IPODocument[]>;
  getPeers(ipoId: string): Promise<IPOPeer[]>;
}

export class MockDocumentsProvider implements DocumentsProvider {
  async getDocuments(ipoId: string): Promise<IPODocument[]> {
    return mockDocuments.filter((document) => document.ipoId === ipoId).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  async getPeers(ipoId: string): Promise<IPOPeer[]> {
    return mockPeers.filter((peer) => peer.ipoId === ipoId);
  }
}
