export const DOCUMENT_AVAILABILITY_CHECK_LIMIT = 12;
export const DOCUMENT_AVAILABILITY_CHECK_CONCURRENCY = 2;

export const DOCUMENT_AVAILABILITY_TTL_MS = {
  UNCHECKED: 0,
  UNKNOWN: 6 * 60 * 60 * 1_000,
  NOT_FOUND: 24 * 60 * 60 * 1_000,
  AVAILABLE: 7 * 24 * 60 * 60 * 1_000,
} as const;

export type DocumentAvailabilityStatus = keyof typeof DOCUMENT_AVAILABILITY_TTL_MS;

export type DocumentAvailabilityResult = {
  status: DocumentAvailabilityStatus;
  checkedAt: Date;
  httpStatus?: number;
};

export type CheckNSEDocumentAvailabilityOptions = {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxRedirects?: number;
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const rangeFallbackStatuses = new Set([405, 501]);

function officialNSEUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    const hostname = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:"
      || (hostname !== "nseindia.com" && !hostname.endsWith(".nseindia.com"))
    ) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function requestWithOfficialRedirects(
  initialUrl: URL,
  fetcher: typeof globalThis.fetch,
  init: RequestInit,
  maxRedirects: number,
): Promise<Response> {
  let url = initialUrl;
  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetcher(url, { ...init, redirect: "manual" });
    if (!redirectStatuses.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirectCount >= maxRedirects) return response;
    const nextUrl = officialNSEUrl(location, url.toString());
    if (!nextUrl) return response;
    url = nextUrl;
  }
}

function resultForStatus(status: number, checkedAt: Date): DocumentAvailabilityResult {
  if (status >= 200 && status < 300) {
    return { status: "AVAILABLE", checkedAt, httpStatus: status };
  }
  if (status === 404 || status === 410) {
    return { status: "NOT_FOUND", checkedAt, httpStatus: status };
  }
  return { status: "UNKNOWN", checkedAt, httpStatus: status };
}

/**
 * Probe an official NSE document without downloading it. NSE currently returns
 * accurate HEAD status codes; the one-byte GET exists only for origins that
 * explicitly report HEAD as unsupported.
 */
export async function checkNSEDocumentAvailability(
  documentUrl: string,
  options: CheckNSEDocumentAvailabilityOptions = {},
): Promise<DocumentAvailabilityResult> {
  const checkedAt = (options.now ?? (() => new Date()))();
  const url = officialNSEUrl(documentUrl);
  if (!url) return { status: "UNKNOWN", checkedAt };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  const fetcher = options.fetch ?? globalThis.fetch;
  const maxRedirects = options.maxRedirects ?? 2;

  try {
    const head = await requestWithOfficialRedirects(
      url,
      fetcher,
      { method: "HEAD", signal: controller.signal },
      maxRedirects,
    );
    if (!rangeFallbackStatuses.has(head.status)) return resultForStatus(head.status, checkedAt);

    const ranged = await requestWithOfficialRedirects(
      url,
      fetcher,
      {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      },
      maxRedirects,
    );
    await ranged.body?.cancel();
    return resultForStatus(ranged.status, checkedAt);
  } catch {
    return { status: "UNKNOWN", checkedAt };
  } finally {
    clearTimeout(timeout);
  }
}

