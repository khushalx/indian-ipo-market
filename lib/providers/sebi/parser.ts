import type { NormalizedFiling } from "@/lib/ingestion/schemas";
import { decodeHtml, parseSebiDate, stripHtml } from "@/lib/ingestion/normalize";

import type { ParsedSebiListingEntry, SebiPublicIssueSection } from "./types";

const SEBI_HOSTS = new Set(["sebi.gov.in", "www.sebi.gov.in"]);

export function officialSebiUrl(value: string, base = "https://www.sebi.gov.in"): string | null {
  try {
    const url = new URL(decodeHtml(value.trim()), base);
    if (!SEBI_HOSTS.has(url.hostname.toLowerCase()) || !["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function listingTitle(row: string): string | null {
  const titleAttribute = row.match(/\btitle\s*=\s*(["'])([\s\S]*?)\1\s+class\s*=\s*(["'])[^"']*\bpoints\b[^"']*\3/i)?.[2];
  const candidate = titleAttribute?.split(/<br\s*\/?\s*>/i)[0]
    ?? row.match(/\bclass\s*=\s*(["'])[^"']*\bpoints\b[^"']*\1[^>]*>([\s\S]*?)(?:<br\s*\/?\s*>|<\/a>)/i)?.[2];
  const title = candidate ? stripHtml(candidate) : "";
  return title || null;
}

function linkedPDFs(row: string): Array<{ title: string; documentUrl: string }> {
  const documents = new Map<string, { title: string; documentUrl: string }>();
  const pattern = /<a\b[^>]*\bhref\s*=\s*(["'])(https?:\/\/(?:www\.)?sebi\.gov\.in\/[^"']+?\.pdf(?:\?[^"']*)?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of row.matchAll(pattern)) {
    const documentUrl = officialSebiUrl(match[2]);
    if (!documentUrl) continue;
    const title = stripHtml(match[3]);
    if (!title) continue;
    documents.set(documentUrl, { title, documentUrl });
  }
  return [...documents.values()];
}

export function parseSebiListingHtml(html: string, section: SebiPublicIssueSection): ParsedSebiListingEntry[] {
  const entries: ParsedSebiListingEntry[] = [];
  const rows = html.matchAll(/<tr\b[^>]*\brole\s*=\s*(["'])row\1[^>]*>([\s\S]*?)<\/tr>/gi);

  for (const rowMatch of rows) {
    const row = rowMatch[2];
    const rawDate = row.match(/<td\b[^>]*>\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})\s*<\/td>/i)?.[1];
    const detailCandidate = row.match(/\bhref\s*=\s*(["'])(https?:\/\/(?:www\.)?sebi\.gov\.in\/filings\/public-issues\/[^"']+\.html)\1/i)?.[2];
    const title = listingTitle(row);
    const filingDate = rawDate ? parseSebiDate(rawDate) : null;
    const detailUrl = detailCandidate ? officialSebiUrl(detailCandidate) : null;
    if (!title || !filingDate || !detailUrl) continue;

    entries.push({
      section,
      filingDate,
      title,
      detailUrl,
      linkedDocuments: linkedPDFs(row),
    });
  }

  return entries;
}

export function parseSebiDetailDocumentUrl(html: string, detailUrl: string): string | null {
  const iframeSource = html.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/i)?.[2];
  if (iframeSource) {
    try {
      const viewerUrl = new URL(decodeHtml(iframeSource), detailUrl);
      const file = viewerUrl.searchParams.get("file");
      const official = file ? officialSebiUrl(file) : null;
      if (official && /\.pdf(?:$|\?)/i.test(official)) return official;
    } catch {
      // Fall through to direct official PDF discovery.
    }
  }

  const embeddedFile = html.match(/[?&]file=(https?:\/\/(?:www\.)?sebi\.gov\.in\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?)/i)?.[1];
  const embeddedUrl = embeddedFile ? officialSebiUrl(embeddedFile) : null;
  if (embeddedUrl) return embeddedUrl;

  const directPDFs = [...html.matchAll(/\bhref\s*=\s*(["'])(https?:\/\/(?:www\.)?sebi\.gov\.in\/[^"']+?\.pdf(?:\?[^"']*)?)\1/gi)]
    .map((match) => officialSebiUrl(match[2]))
    .filter((url): url is string => Boolean(url));
  // SEBI currently puts primary prospectuses under attachdocs; commondocs links are
  // commonly paired abridged documents and must not be mislabeled as the primary filing.
  return directPDFs.find((url) => url.includes("/sebi_data/attachdocs/")) ?? null;
}

export function dedupeFilings(filings: NormalizedFiling[]): NormalizedFiling[] {
  const unique = new Map<string, NormalizedFiling>();
  for (const filing of filings) {
    const key = [filing.normalizedCompanyName, filing.filingType, filing.documentUrl, filing.filingDate].join("|");
    unique.set(key, filing);
  }
  return [...unique.values()].sort((left, right) => {
    const dateOrder = right.filingDate.localeCompare(left.filingDate);
    return dateOrder || left.companyName.localeCompare(right.companyName) || left.filingType.localeCompare(right.filingType);
  });
}
