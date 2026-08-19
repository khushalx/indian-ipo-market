import { z } from "zod";

import { fetchWithRetry } from "@/lib/ingestion/retry";
import {
  companyNameFromFilingTitle,
  filingDocumentType,
  normalizeCompanyName,
  stableId,
} from "@/lib/ingestion/normalize";
import { normalizedFilingSchema, type NormalizedFiling } from "@/lib/ingestion/schemas";

import { dedupeFilings, officialSebiUrl, parseSebiDetailDocumentUrl, parseSebiListingHtml } from "./parser";
import type { ParsedSebiListingEntry, SEBIProviderOptions, SebiPublicIssueSection } from "./types";

const optionsSchema = z.object({
  origin: z.string().url().default("https://www.sebi.gov.in"),
  detailConcurrency: z.number().int().min(1).max(5).default(3),
  maxEntriesPerSection: z.number().int().min(1).max(25).default(25),
  attempts: z.number().int().min(1).max(3).default(2),
  timeoutMs: z.number().int().min(1_000).max(30_000).default(12_000),
});

type ParsedOptions = z.output<typeof optionsSchema>;

function listingUrl(origin: string, section: SebiPublicIssueSection): string {
  const url = new URL("/sebiweb/home/HomeAction.do", origin);
  url.searchParams.set("doListing", "yes");
  url.searchParams.set("sid", "3");
  url.searchParams.set("ssid", "15");
  url.searchParams.set("smid", String(section));
  return url.toString();
}

function fallbackType(section: SebiPublicIssueSection): NormalizedFiling["filingType"] {
  if (section === 10) return "drhp";
  if (section === 11) return "rhp";
  return "final_offer_document";
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return output;
}

export class SEBIProvider {
  private readonly options: ParsedOptions;

  constructor(options: SEBIProviderOptions = {}) {
    this.options = optionsSchema.parse(options);
    const origin = officialSebiUrl(this.options.origin);
    if (!origin) throw new Error("SEBIProvider origin must be an official SEBI host");
    this.options.origin = new URL(origin).origin;
  }

  async getRecentPublicIssueFilings(): Promise<NormalizedFiling[]> {
    return this.getSections([10, 11, 12]);
  }

  async getDRHPFilings(): Promise<NormalizedFiling[]> {
    return this.getSections([10]);
  }

  async getRHPFilings(): Promise<NormalizedFiling[]> {
    return this.getSections([11]);
  }

  async getDocumentsForCompany(companyName: string): Promise<NormalizedFiling[]> {
    const normalized = normalizeCompanyName(companyName);
    if (!normalized) return [];
    const filings = await this.getRecentPublicIssueFilings();
    return filings.filter((filing) => filing.normalizedCompanyName === normalized);
  }

  private async fetchHTML(url: string, operation: string): Promise<string> {
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    }, {
      provider: "SEBI",
      operation,
      attempts: this.options.attempts,
      timeoutMs: this.options.timeoutMs,
      baseDelayMs: 600,
    });
    return response.text();
  }

  private async getSections(sections: SebiPublicIssueSection[]): Promise<NormalizedFiling[]> {
    const listingPages = await Promise.all(sections.map(async (section) => {
      const url = listingUrl(this.options.origin, section);
      const html = await this.fetchHTML(url, `list-public-issues-${section}`);
      return parseSebiListingHtml(html, section).slice(0, this.options.maxEntriesPerSection);
    }));

    const entries = listingPages.flat();
    const fetchedAt = new Date().toISOString();
    const resolved = await mapConcurrent(entries, this.options.detailConcurrency, (entry) => this.normalizeEntry(entry, fetchedAt));
    return dedupeFilings(resolved.flat());
  }

  private async normalizeEntry(entry: ParsedSebiListingEntry, fetchedAt: string): Promise<NormalizedFiling[]> {
    let primaryDocumentUrl = entry.detailUrl;
    try {
      const detailHTML = await this.fetchHTML(entry.detailUrl, "resolve-public-issue-document");
      primaryDocumentUrl = parseSebiDetailDocumentUrl(detailHTML, entry.detailUrl) ?? entry.detailUrl;
    } catch {
      // The public detail page remains a truthful document link when its PDF cannot be resolved.
    }

    const filings: NormalizedFiling[] = [];
    const primary = this.createFiling(entry.title, entry.filingDate, primaryDocumentUrl, entry.detailUrl, fetchedAt, entry.section);
    if (primary) filings.push(primary);

    for (const linked of entry.linkedDocuments) {
      const filing = this.createFiling(linked.title, entry.filingDate, linked.documentUrl, entry.detailUrl, fetchedAt, entry.section);
      if (filing) filings.push(filing);
    }

    return filings;
  }

  private createFiling(
    title: string,
    filingDate: string,
    documentUrl: string,
    sourceUrl: string,
    fetchedAt: string,
    section: SebiPublicIssueSection,
  ): NormalizedFiling | null {
    const companyName = companyNameFromFilingTitle(title);
    const normalizedCompanyName = normalizeCompanyName(companyName);
    const detectedType = filingDocumentType(title);
    const filingType = detectedType === "other" ? fallbackType(section) : detectedType;
    const parsed = normalizedFilingSchema.safeParse({
      id: stableId("sebi-filing", normalizedCompanyName, filingType, documentUrl, filingDate),
      companyName,
      normalizedCompanyName,
      filingType,
      filingDate,
      documentUrl,
      sourceUrl,
      sourceName: "SEBI",
      sourceType: "official",
      fetchedAt,
    });
    return parsed.success ? parsed.data : null;
  }
}
