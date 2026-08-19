import { mockNews } from "@/data/mock-ipo-data";
import type { NewsArticle, NewsFilters } from "@/types";

export interface NewsProvider {
  getNews(filters?: NewsFilters): Promise<NewsArticle[]>;
}

export class MockNewsProvider implements NewsProvider {
  async getNews(filters: NewsFilters = {}): Promise<NewsArticle[]> {
    return mockNews
      .filter((article) => (!filters.ipoId || article.ipoId === filters.ipoId) && (!filters.companyId || article.companyId === filters.companyId) && (!filters.category || article.category === filters.category))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, filters.limit ?? mockNews.length);
  }
}
