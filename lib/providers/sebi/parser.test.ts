import assert from "node:assert/strict";
import test from "node:test";

import { dedupeFilings, parseSebiDetailDocumentUrl, parseSebiListingHtml } from "./parser";

test("SEBI listing parser keeps the filing and paired abridged document", () => {
  const html = `
    <table><tbody><tr role="row" class="odd">
      <td>Aug 18, 2026</td>
      <td><a href="https://www.sebi.gov.in/filings/public-issues/aug-2026/example-limited-drhp_1.html"
        title="Example Limited - DRHP<br><a href='https://www.sebi.gov.in/sebi_data/commondocs/aug-2026/example-abridged.pdf'>Example Limited - Draft Abridged Prospectus</a>"
        class="points">Example Limited - DRHP<br><a href='https://www.sebi.gov.in/sebi_data/commondocs/aug-2026/example-abridged.pdf'>Example Limited - Draft Abridged Prospectus</a></a></td>
    </tr></tbody></table>`;

  const entries = parseSebiListingHtml(html, 10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].filingDate, "2026-08-18");
  assert.equal(entries[0].title, "Example Limited - DRHP");
  assert.deepEqual(entries[0].linkedDocuments, [{
    title: "Example Limited - Draft Abridged Prospectus",
    documentUrl: "https://www.sebi.gov.in/sebi_data/commondocs/aug-2026/example-abridged.pdf",
  }]);
});

test("SEBI detail parser resolves the official PDF viewer URL", () => {
  const detail = `<iframe src='../../../web/?file=https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/primary.pdf'></iframe>`;
  assert.equal(
    parseSebiDetailDocumentUrl(detail, "https://www.sebi.gov.in/filings/public-issues/aug-2026/example_1.html"),
    "https://www.sebi.gov.in/sebi_data/attachdocs/aug-2026/primary.pdf",
  );
});

test("filing dedupe uses company, type, URL, and date", () => {
  const filing = {
    id: "one",
    companyName: "Example Limited",
    normalizedCompanyName: "example",
    filingType: "drhp" as const,
    filingDate: "2026-08-18",
    documentUrl: "https://www.sebi.gov.in/document.pdf",
    sourceUrl: "https://www.sebi.gov.in/detail.html",
    sourceName: "SEBI" as const,
    sourceType: "official" as const,
    fetchedAt: "2026-08-18T10:00:00.000Z",
  };
  assert.equal(dedupeFilings([filing, { ...filing, id: "two" }]).length, 1);
  assert.equal(dedupeFilings([filing, { ...filing, id: "two", filingDate: "2026-08-19" }]).length, 2);
});
