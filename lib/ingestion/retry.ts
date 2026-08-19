import { ProviderError } from "./errors";

type RetryOptions = {
  provider: string;
  operation: string;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), 60_000) : undefined;
}

export async function fetchWithRetry(input: string, init: RequestInit, options: RetryOptions): Promise<Response> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (response.ok) return response;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) {
        throw new ProviderError(`HTTP ${response.status} from ${options.provider}`, options.provider, options.operation, response.status, retryable);
      }
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response) ?? (options.baseDelayMs ?? 400) * 2 ** (attempt - 1)));
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, (options.baseDelayMs ?? 400) * 2 ** (attempt - 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastError instanceof ProviderError) throw lastError;
  throw new ProviderError(lastError instanceof Error ? lastError.message : "Provider request failed", options.provider, options.operation, undefined, true);
}
