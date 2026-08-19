import type { DocumentsProvider } from "@/lib/providers/documents-provider";
import type { IPODocument, IPOPeer, ProviderStatus } from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

const DOCUMENT_SOURCE_KINDS = ["REGULATOR", "EXCHANGE", "OFFER_DOCUMENT"] as const;

export class DatabaseDocumentsProvider implements DocumentsProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getDocuments(ipoId: string): Promise<IPODocument[]> {
    return this.repository.getDocuments(ipoId);
  }

  /** The Phase 2 D1 schema has no normalized peer-comparison table yet. */
  async getPeers(ipoId: string): Promise<IPOPeer[]> {
    void ipoId;
    return [];
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses(DOCUMENT_SOURCE_KINDS);
  }
}
