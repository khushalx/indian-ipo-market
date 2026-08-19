import { z } from "zod";

import { ProviderError } from "@/lib/ingestion/errors";
import { fetchWithRetry } from "@/lib/ingestion/retry";

const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Only HTTP(S) provider URLs are supported");

const clientConfigSchema = z.object({
  providerName: z.string().trim().min(1),
  baseUrl: httpUrlSchema,
  apiKey: z.string().trim().min(1).optional(),
  apiKeyHeader: z.string().trim().min(1).default("Authorization"),
  apiKeyPrefix: z.string().default("Bearer "),
  attempts: z.number().int().min(1).max(3).default(2),
  timeoutMs: z.number().int().min(1_000).max(30_000).default(12_000),
});

export type ExternalJSONClientConfig = z.input<typeof clientConfigSchema>;

export type ExternalJSONRequest = {
  query?: Record<string, string | number | boolean | undefined>;
  method?: "GET";
};

const recordSchema = z.record(z.unknown());

function providerUrl(baseUrl: string, endpoint: string, query?: ExternalJSONRequest["query"]): string {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const url = new URL(endpoint.replace(/^\/+/, ""), base);

  // Never send a server-side credential to a host supplied by a response or identifier.
  if (url.origin !== base.origin) throw new Error("Provider endpoint must share the configured base URL origin");

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export class ExternalJSONClient {
  private readonly config: z.output<typeof clientConfigSchema>;

  constructor(config: ExternalJSONClientConfig, options: { requireApiKey?: boolean } = {}) {
    this.config = clientConfigSchema.parse(config);
    if (options.requireApiKey && !this.config.apiKey) {
      throw new ProviderError("Provider API key is not configured", this.config.providerName, "configure");
    }
  }

  get providerName(): string {
    return this.config.providerName;
  }

  async get(endpoint: string, operation: string, request: ExternalJSONRequest = {}): Promise<unknown> {
    let url: string;
    try {
      url = providerUrl(this.config.baseUrl, endpoint, request.query);
    } catch {
      throw new ProviderError("Invalid provider endpoint configuration", this.config.providerName, operation);
    }

    const headers = new Headers({ Accept: "application/json" });
    if (this.config.apiKey) {
      const separator = this.config.apiKeyPrefix && !/\s$/.test(this.config.apiKeyPrefix) ? " " : "";
      headers.set(
        this.config.apiKeyHeader,
        `${this.config.apiKeyPrefix}${separator}${this.config.apiKey}`,
      );
    }

    const response = await fetchWithRetry(url, { method: request.method ?? "GET", headers }, {
      provider: this.config.providerName,
      operation,
      attempts: this.config.attempts,
      timeoutMs: this.config.timeoutMs,
      baseDelayMs: 400,
    });

    try {
      return await response.json();
    } catch {
      throw new ProviderError("Provider returned invalid JSON", this.config.providerName, operation, response.status);
    }
  }
}

export function endpointWithIdentifier(template: string, identifier: string): string {
  return template.replace(":identifier", encodeURIComponent(identifier));
}

export function extractRecords(payload: unknown, preferredKeys: string[] = []): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return z.array(recordSchema).parse(payload);

  const envelope = recordSchema.parse(payload);
  const keys = [...preferredKeys, "data", "items", "results", "records"];
  for (const key of keys) {
    const candidate = envelope[key];
    if (Array.isArray(candidate)) return z.array(recordSchema).parse(candidate);
    if (candidate && typeof candidate === "object") {
      const nested = recordSchema.parse(candidate);
      for (const nestedKey of keys) {
        const nestedCandidate = nested[nestedKey];
        if (Array.isArray(nestedCandidate)) return z.array(recordSchema).parse(nestedCandidate);
        if (nestedCandidate && typeof nestedCandidate === "object") return [recordSchema.parse(nestedCandidate)];
      }
      return [nested];
    }
  }

  return [envelope];
}

export function firstValue(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

export function dateTimeValue(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();
}

export function dateValue(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const timestamp = new Date(`${normalized}T00:00:00Z`);
    if (!Number.isNaN(timestamp.getTime()) && timestamp.toISOString().slice(0, 10) === normalized) return normalized;
  }

  const timestamp = new Date(raw);
  return Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString().slice(0, 10);
}

export function urlValue(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const parsed = z.string().url().safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const string = stringValue(value);
  return string ? string.split(/[,|/]/).map((item) => item.trim()).filter(Boolean) : [];
}
