import { z } from "zod";

import { ProviderError } from "@/lib/ingestion/errors";

export const feedValidatorsSchema = z.object({
  etag: z.string().trim().max(500).optional(),
  lastModified: z.string().trim().max(500).optional(),
});

export type FeedValidators = z.infer<typeof feedValidatorsSchema>;

export type ConditionalFeedResponse = {
  body: string | null;
  notModified: boolean;
  validators: FeedValidators;
  fetchedAt: string;
};

type ConditionalFeedOptions = {
  provider: string;
  operation: string;
  validators?: FeedValidators;
  attempts?: number;
  timeoutMs?: number;
};

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1_000, 30_000);
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.min(Math.max(timestamp - Date.now(), 0), 30_000) : undefined;
}

export async function fetchConditionalFeed(url: string, options: ConditionalFeedOptions): Promise<ConditionalFeedResponse> {
  const parsedValidators = feedValidatorsSchema.parse(options.validators ?? {});
  const attempts = Math.min(Math.max(options.attempts ?? 2, 1), 3);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);
    try {
      const headers = new Headers({ Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
      if (parsedValidators.etag) headers.set("If-None-Match", parsedValidators.etag);
      if (parsedValidators.lastModified) headers.set("If-Modified-Since", parsedValidators.lastModified);

      const response = await fetch(url, { method: "GET", headers, redirect: "follow", signal: controller.signal });
      const validators = {
        etag: response.headers.get("etag") ?? parsedValidators.etag,
        lastModified: response.headers.get("last-modified") ?? parsedValidators.lastModified,
      };
      const fetchedAt = new Date().toISOString();
      if (response.status === 304) return { body: null, notModified: true, validators, fetchedAt };
      if (response.ok) return { body: await response.text(), notModified: false, validators, fetchedAt };

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) {
        throw new ProviderError(`HTTP ${response.status} from ${options.provider}`, options.provider, options.operation, response.status, retryable);
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfter(response) ?? 500 * 2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError("RSS request failed", options.provider, options.operation, undefined, true);
}
