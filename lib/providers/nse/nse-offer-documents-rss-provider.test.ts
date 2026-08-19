import assert from "node:assert/strict";
import test from "node:test";

import {
  checkNSEDocumentAvailability,
  DOCUMENT_AVAILABILITY_CHECK_CONCURRENCY,
  DOCUMENT_AVAILABILITY_CHECK_LIMIT,
  DOCUMENT_AVAILABILITY_TTL_MS,
} from "./document-availability";
import {
  NSE_OFFER_DOCUMENTS_RSS_URL,
  NSEOfferDocumentsRSSProvider,
} from "./nse-offer-documents-rss-provider";

const rss = `<?xml version="1.0"?><rss><channel><title>NSE Offer Documents</title>
  <item><title>Example Technologies Limited - RHP</title>
  <link>https://nsearchives.nseindia.com/corporate/example-rhp.pdf</link>
  <description><![CDATA[Red Herring Prospectus]]></description>
  <pubDate>Tue, 18 Aug 2026 10:00:00 +0530</pubDate></item>
</channel></rss>`;

test("NSE offer-document provider emits exchange provenance and supports conditional GET", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Request[] = [];
  let call = 0;
  globalThis.fetch = async (input, init) => {
    requests.push(new Request(input, init));
    call += 1;
    if (call === 1) return new Response(rss, { status: 200, headers: { ETag: '"feed-v1"', "Last-Modified": "Tue, 18 Aug 2026 10:00:00 GMT" } });
    return new Response(null, { status: 304, headers: { ETag: '"feed-v1"' } });
  };

  try {
    const provider = new NSEOfferDocumentsRSSProvider();
    const first = await provider.getOfferDocuments();
    assert.equal(first.records.length, 1);
    assert.equal(first.records[0].sourceName, "NSE");
    assert.equal(first.records[0].sourceType, "exchange");
    assert.equal(first.records[0].filingType, "rhp");
    assert.equal(first.records[0].documentUrl, "https://nsearchives.nseindia.com/corporate/example-rhp.pdf");
    assert.equal(first.records[0].sourceUrl, NSE_OFFER_DOCUMENTS_RSS_URL);
    assert.equal(first.records[0].sourceMetadata?.itemTitle, "Example Technologies Limited - RHP");
    assert.equal(first.records[0].sourceMetadata?.itemSummary, "Red Herring Prospectus");
    assert.equal(first.validators.etag, '"feed-v1"');

    const second = await provider.getOfferDocuments(first.validators);
    assert.equal(second.notModified, true);
    assert.deepEqual(second.records, []);
    assert.equal(requests[1].headers.get("if-none-match"), '"feed-v1"');
    assert.equal(requests[1].headers.get("cookie"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NSE document availability uses HEAD without downloading available or missing documents", async () => {
  const requests: Request[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    return new Response(null, {
      status: request.url.includes("missing") ? 404 : 200,
      headers: { "content-type": request.url.includes("missing") ? "text/html" : "application/pdf" },
    });
  };
  const now = () => new Date("2026-08-19T12:00:00.000Z");

  const available = await checkNSEDocumentAvailability(
    "https://nsearchives.nseindia.com/corporate/available.pdf",
    { fetch: fetcher, now },
  );
  const missing = await checkNSEDocumentAvailability(
    "https://nsearchives.nseindia.com/corporate/missing.pdf",
    { fetch: fetcher, now },
  );

  assert.deepEqual(available, {
    status: "AVAILABLE",
    checkedAt: now(),
    httpStatus: 200,
  });
  assert.deepEqual(missing, {
    status: "NOT_FOUND",
    checkedAt: now(),
    httpStatus: 404,
  });
  assert.deepEqual(requests.map((request) => request.method), ["HEAD", "HEAD"]);
  assert.ok(requests.every((request) => request.headers.get("cookie") === null));
});

test("NSE document availability falls back to a cancelled one-byte GET only for unsupported HEAD", async () => {
  const requests: Request[] = [];
  let bodyCancelled = false;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.method === "HEAD") return new Response(null, { status: 405 });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([37]));
      },
      cancel() {
        bodyCancelled = true;
      },
    }), { status: 206, headers: { "content-range": "bytes 0-0/100" } });
  };

  const result = await checkNSEDocumentAvailability(
    "https://nsearchives.nseindia.com/corporate/range.pdf",
    { fetch: fetcher },
  );

  assert.equal(result.status, "AVAILABLE");
  assert.equal(result.httpStatus, 206);
  assert.deepEqual(requests.map((request) => request.method), ["HEAD", "GET"]);
  assert.equal(requests[1].headers.get("range"), "bytes=0-0");
  assert.equal(bodyCancelled, true);
});

test("NSE document availability leaves blocked, failed, and non-official links unknown", async () => {
  let calls = 0;
  const blockedFetch: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 403 });
  };
  const failedFetch: typeof fetch = async () => {
    calls += 1;
    throw new TypeError("network unavailable");
  };

  const blocked = await checkNSEDocumentAvailability(
    "https://nsearchives.nseindia.com/corporate/blocked.pdf",
    { fetch: blockedFetch },
  );
  const failed = await checkNSEDocumentAvailability(
    "https://nsearchives.nseindia.com/corporate/failed.pdf",
    { fetch: failedFetch },
  );
  const untrusted = await checkNSEDocumentAvailability(
    "https://example.com/document.pdf",
    { fetch: blockedFetch },
  );

  assert.equal(blocked.status, "UNKNOWN");
  assert.equal(blocked.httpStatus, 403);
  assert.equal(failed.status, "UNKNOWN");
  assert.equal(failed.httpStatus, undefined);
  assert.equal(untrusted.status, "UNKNOWN");
  assert.equal(calls, 2);
});

test("document availability policy remains tightly bounded", () => {
  assert.equal(DOCUMENT_AVAILABILITY_CHECK_LIMIT, 12);
  assert.equal(DOCUMENT_AVAILABILITY_CHECK_CONCURRENCY, 2);
  assert.deepEqual(DOCUMENT_AVAILABILITY_TTL_MS, {
    UNCHECKED: 0,
    UNKNOWN: 6 * 60 * 60 * 1_000,
    NOT_FOUND: 24 * 60 * 60 * 1_000,
    AVAILABLE: 7 * 24 * 60 * 60 * 1_000,
  });
});

test("NSE offer-document provider ignores debt disclosures and recognizes NSE prospectus codes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(`<?xml version="1.0"?><rss><channel>
    <item><title>Debt Issuer Limited</title><link>https://nsearchives.nseindia.com/corporate/debt.zip</link><description>CP-NI-Disclosure Document</description><pubDate>19-Aug-2026</pubDate></item>
    <item><title>Public Issuer Limited</title><link>https://nsearchives.nseindia.com/corporate/issuer.pdf</link><description>Public Issuer Limited has filled PROSP for its IPO</description><pubDate>19-Aug-2026</pubDate></item>
  </channel></rss>`, { status: 200 });

  try {
    const result = await new NSEOfferDocumentsRSSProvider().getOfferDocuments();
    assert.deepEqual(result.records.map((record) => [record.companyName, record.filingType]), [
      ["Public Issuer Limited", "prospectus"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
