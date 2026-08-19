import type { NewsProvider } from "@/lib/providers/news-provider";
import type { NewsArticle, NewsFilters, ProviderStatus } from "@/types";
import { databaseRepository, type DatabaseProviderInput } from "./provider-base";

export class DatabaseNewsProvider implements NewsProvider {
  private readonly repository;

  constructor(input?: DatabaseProviderInput) {
    this.repository = databaseRepository(input);
  }

  getNews(filters: NewsFilters = {}): Promise<NewsArticle[]> {
    return this.repository.getNews(filters);
  }

  getProviderStatuses(): Promise<ProviderStatus[]> {
    return this.repository.getProviderStatuses(["NEWS_PUBLISHER"]);
  }
}
