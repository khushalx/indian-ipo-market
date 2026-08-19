import { DatabaseReadRepository } from "@/lib/repositories";

export type DatabaseProviderInput = DatabaseReadRepository | D1Database | undefined;

export function databaseRepository(input?: DatabaseProviderInput): DatabaseReadRepository {
  return input instanceof DatabaseReadRepository
    ? input
    : new DatabaseReadRepository({ database: input });
}
