import { newsRecordSchema, type NormalizedNewsRecord } from "@/lib/ingestion/schemas";
import { stableId } from "@/lib/ingestion/normalize";
import type { NewsCategory } from "@/types";

import {
  arrayValue,
  dateTimeValue,
  extractRecords,
  firstValue,
  stringValue,
  urlValue,
} from "../shared/external-json";
import type { ParsedFeedItem } from "./rss-parser";

function textArray(value: unknown): string[] {
  return arrayValue(value).map(stringValue).filter((item): item is string => Boolean(item));
}

export function inferNewsCategory(...values: Array<string | undefined>): NewsCategory {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/\brbi\b|reserve bank/.test(text)) return "rbi";
  if (/\bsebi\b|regulat|circular/.test(text)) return "sebi";
  if (/corporate action|dividend|bonus|buyback|split/.test(text)) return "corporate_actions";
  if (/result|earnings|profit|revenue/.test(text)) return "results";
  if (/list(?:ed|ing)|debut/.test(text)) return "listing";
  if (/\bipo\b|public issue|offer document|prospectus|drhp|rhp/.test(text)) return "ipo";
  if (/econom|inflation|gdp|fiscal|budget/.test(text)) return "economy";
  if (/compan|issuer|board meeting/.test(text)) return "company";
  return "markets";
}

function explicitCategory(value: unknown, fallbackText: string): NewsCategory {
  const category = stringValue(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  const supported: NewsCategory[] = ["ipo", "markets", "company", "sebi", "rbi", "economy", "results", "corporate_actions", "regulation", "listing"];
  return supported.includes(category as NewsCategory) ? category as NewsCategory : inferNewsCategory(category, fallbackText);
}

function snippet(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 600 ? normalized : `${normalized.slice(0, 597).trimEnd()}…`;
}

export function normalizeNewsRecords(payload: unknown, providerName: string): NormalizedNewsRecord[] {
  return extractRecords(payload, ["news", "articles"])
    .map((record) => {
      const headline = stringValue(firstValue(record, "headline", "title", "name"));
      const url = urlValue(firstValue(record, "url", "link", "sourceUrl", "source_url"));
      const publishedAt = dateTimeValue(firstValue(record, "publishedAt", "published_at", "pubDate", "date", "timestamp"));
      if (!headline || !url || !publishedAt) return null;
      const summary = snippet(stringValue(firstValue(record, "summary", "description", "snippet", "excerpt")) ?? "");
      const publisher = stringValue(firstValue(record, "publisher", "sourceName", "source_name", "source")) ?? providerName;
      const parsed = newsRecordSchema.safeParse({
        externalId: stringValue(firstValue(record, "externalId", "external_id", "id", "guid")) ?? stableId("news", providerName, url),
        headline,
        summary,
        publisher,
        publishedAt,
        url,
        imageUrl: urlValue(firstValue(record, "imageUrl", "image_url", "image", "thumbnail")),
        category: explicitCategory(firstValue(record, "category", "section", "type"), `${headline} ${summary}`),
        relatedCompanies: textArray(firstValue(record, "relatedCompanies", "related_companies", "companies")),
        relatedIPOs: textArray(firstValue(record, "relatedIPOs", "related_ipos", "ipos")),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((record): record is NormalizedNewsRecord => Boolean(record))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export function normalizeFeedNews(items: ParsedFeedItem[], feedUrl: string, providerName: string): NormalizedNewsRecord[] {
  const normalized: NormalizedNewsRecord[] = [];
  for (const item of items) {
    const publishedAt = dateTimeValue(item.publishedAt);
    let url: string | undefined;
    try {
      url = item.link ? new URL(item.link, feedUrl).toString() : undefined;
    } catch {
      url = undefined;
    }
    if (!publishedAt || !url) continue;
    const summary = snippet(item.summary);
    const parsed = newsRecordSchema.safeParse({
      externalId: item.guid ?? stableId("rss-news", providerName, url),
      headline: item.title,
      summary,
      publisher: item.publisher ?? providerName,
      publishedAt,
      url,
      imageUrl: item.imageUrl,
      category: inferNewsCategory(item.title, summary, ...item.categories),
      relatedCompanies: [],
      relatedIPOs: [],
    });
    if (parsed.success) normalized.push(parsed.data);
  }
  return normalized.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}
