import assert from "node:assert/strict";
import test from "node:test";

process.env.DATA_MODE = "mock";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      DATA_MODE: "mock",
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the IPO market homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /ARTHA/);
  assert.match(html, /IPO Market/);
  assert.match(html, /Development data/);
  assert.match(html, /Grey market premium: plus 58 rupees/);
  assert.match(html, /Updated 19 Aug/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("server-renders directory and representative IPO detail routes", async () => {
  const [directory, detail] = await Promise.all([
    render("/ipos"),
    render("/ipo/silveroak-hospitals-ipo"),
  ]);
  assert.equal(directory.status, 200);
  assert.equal(detail.status, 200);
  const directoryHtml = await directory.text();
  const detailHtml = await detail.text();
  assert.match(directoryHtml, /All public issues/);
  assert.match(directoryHtml, /Grey market premium: plus 58 rupees/);
  assert.match(detailHtml, /SilverOak Hospitals IPO/);
  assert.match(detailHtml, /As reported so far/);
  assert.doesNotMatch(detailHtml, /Final reported/);
});

test("detail subscription summary distinguishes unavailable and post-close values", async () => {
  const [unavailable, postClose] = await Promise.all([
    render("/ipo/westbridge-renewables-ipo"),
    render("/ipo/prakash-cables-ipo"),
  ]);
  assert.equal(unavailable.status, 200);
  assert.equal(postClose.status, 200);

  const unavailableHtml = await unavailable.text();
  const postCloseHtml = await postClose.text();
  assert.match(unavailableHtml, /Total subscription<\/dt><dd>Not available<\/dd><small>No subscription figure reported/);
  assert.doesNotMatch(unavailableHtml, /Final reported/);
  assert.match(postCloseHtml, /Total subscription<\/dt><dd>18\.63x<\/dd><small>Final reported/);
});

test("server keeps unavailable filing metadata visible without a broken document anchor", async () => {
  const response = await render("/ipo/vertex-defence-systems-ipo");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Link unavailable at/);
  assert.doesNotMatch(
    html,
    /<a[^>]+href="https:\/\/example\.com\/mock-ipo-documents\/vertex-drhp\.pdf"/,
  );
  assert.match(
    html,
    /<a[^>]+href="https:\/\/example\.com\/mock-ipo-documents\/vertex-rhp\.pdf"/,
  );
});
