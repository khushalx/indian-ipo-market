import { z } from "zod";

import {
  companyNameFromFilingTitle,
  filingDocumentType,
  normalizeCompanyName,
  stableId,
} from "@/lib/ingestion/normalize";
import { normalizedFilingSchema, type NormalizedFiling } from "@/lib/ingestion/schemas";

import { fetchConditionalFeed, type FeedValidators } from "../news/conditional-feed";
import { parseRSSFeed } from "../news/rss-parser";
import type { ConditionalRecords } from "../news/types";
import type { NSEOfferDocumentsProvider, NSEOfferDocumentsRSSProviderOptions } from "./types";

export const NSE_OFFER_DOCUMENTS_RSS_URL = "https://nsearchives.nseindia.com/content/RSS/Offer_Documents.xml";

const optionsSchema = z.object({
  feedUrl: z.string().url().default(NSE_OFFER_DOCUMENTS_RSS_URL),
  attempts: z.number().int().min(1).max(3).default(2),
  timeoutMs: z.number().int().min(1_000).max(30_000).default(12_000),
  maxItems: z.number().int().min(1).max(500).default(100),
});

function officialNSEUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(value, base);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (hostname !== "nseindia.com" && !hostname.endsWith(".nseindia.com"))) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function istDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function displayCompanyName(title: string): string {
  const parsed = companyNameFromFilingTitle(title);
  return parsed
    .replace(/\s*[-–—:]\s*(issuer\s+)?offer\s+document.*$/i, "")
    .replace(/\s*[-–—:]\s*issue\s+summary\s+document.*$/i, "")
    .trim();
}

export class NSEOfferDocumentsRSSProvider implements NSEOfferDocumentsProvider {
  private readonly options: z.output<typeof optionsSchema>;

  constructor(options: NSEOfferDocumentsRSSProviderOptions = {}) {
    this.options = optionsSchema.parse(options);
    if (!officialNSEUrl(this.options.feedUrl)) throw new Error("NSE RSS URL must use an official nseindia.com host over HTTPS");
  }

  async getOfferDocuments(validators: FeedValidators = {}): Promise<ConditionalRecords<NormalizedFiling>> {
    const response = await fetchConditionalFeed(this.options.feedUrl, {
      provider: "NSE",
      operation: "get-offer-documents-rss",
      validators,
      attempts: this.options.attempts,
      timeoutMs: this.options.timeoutMs,
    });
    if (!response.body) {
      return { records: [], notModified: response.notModified, validators: response.validators, fetchedAt: response.fetchedAt };
    }

    const feed = parseRSSFeed(response.body);
    const records = new Map<string, NormalizedFiling>();
    for (const item of feed.items.slice(0, this.options.maxItems)) {
      const documentUrl = item.link ? officialNSEUrl(item.link, this.options.feedUrl) : null;
      const filingDate = item.publishedAt ? istDate(item.publishedAt) : null;
      const companyName = displayCompanyName(item.title);
      const normalizedCompanyName = normalizeCompanyName(companyName);
      if (!documentUrl || !filingDate || !normalizedCompanyName) continue;
      const filingType = filingDocumentType(`${item.title} ${item.summary}`);
      // The NSE feed can contain debt disclosure documents alongside issuer
      // offer documents. Only ingest document lifecycles this product tracks.
      if (filingType === "other") continue;
      const parsed = normalizedFilingSchema.safeParse({
        id: stableId("nse-offer-document", normalizedCompanyName, filingType, documentUrl, filingDate),
        companyName,
        normalizedCompanyName,
        filingType,
        filingDate,
        documentUrl,
        sourceUrl: this.options.feedUrl,
        sourceName: "NSE",
        sourceType: "exchange",
        sourceMetadata: {
          feedTitle: feed.title,
          itemTitle: item.title,
          itemSummary: item.summary,
          guid: item.guid,
          publisher: item.publisher,
          categories: item.categories,
        },
        fetchedAt: response.fetchedAt,
      });
      if (!parsed.success) continue;
      const key = [normalizedCompanyName, filingType, documentUrl, filingDate].join("|");
      records.set(key, parsed.data);
    }

    return {
      records: [...records.values()].sort((left, right) => right.filingDate.localeCompare(left.filingDate)),
      notModified: false,
      validators: response.validators,
      fetchedAt: response.fetchedAt,
    };
  }
}
