import type { GMPProvider } from "@/lib/providers/gmp-provider";
import type { IPOGMPRecord, ProviderStatus } from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

export class DatabaseGMPProvider implements GMPProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getGMPHistory(ipoId: string): Promise<IPOGMPRecord[]> {
    return this.repository.getGMPHistory(ipoId);
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses(["GMP_PROVIDER"]);
  }
}
