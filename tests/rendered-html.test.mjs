import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
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
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("server-renders directory and representative IPO detail routes", async () => {
  const [directory, detail] = await Promise.all([
    render("/ipos"),
    render("/ipo/silveroak-hospitals-ipo"),
  ]);
  assert.equal(directory.status, 200);
  assert.equal(detail.status, 200);
  assert.match(await directory.text(), /All public issues/);
  assert.match(await detail.text(), /SilverOak Hospitals IPO/);
});
