import type {
  DatabaseIngestionErrorSummary,
  DatabaseIngestionRunSummary,
} from "@/lib/repositories";
import type { IPO, ProviderStatus } from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

export class DatabaseProviderStatusProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses();
  }

  getRecentIngestionRuns(limit = 25): Promise<DatabaseIngestionRunSummary[]> {
    return this.repository.getRecentIngestionRuns(limit);
  }

  getRecentErrors(limit = 25): Promise<DatabaseIngestionErrorSummary[]> {
    return this.repository.getRecentErrors(limit);
  }

  async getRecentIPOs(limit = 25): Promise<IPO[]> {
    const rows = await this.repository.getIPOs();
    const normalizedLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 25;
    return [...rows]
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, normalizedLimit);
  }
}
