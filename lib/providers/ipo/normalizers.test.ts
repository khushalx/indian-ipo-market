import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGMPRecords, normalizeIPORecords, normalizeSubscriptionRecords } from "./normalizers";

test("generic IPO normalizer maps common snake-case provider fields", () => {
  const records = normalizeIPORecords({ data: [{
    id: 42,
    company_name: "Example Technologies Limited",
    ipo_type: "SME",
    exchange: "NSE Emerge",
    lower_price: "95",
    upper_price: "100",
    lot_size: "1200",
    issue_open_date: "18-08-2026",
    issue_close_date: "20-08-2026",
  }] }, "Test API");

  assert.equal(records.length, 1);
  assert.equal(records[0].externalId, "42");
  assert.equal(records[0].board, "sme");
  assert.deepEqual(records[0].exchanges, ["NSE_EMERGE"]);
  assert.equal(records[0].openDate, "2026-08-18");
});

test("timestamp-less snapshots are rejected instead of appearing fresh", () => {
  assert.deepEqual(normalizeGMPRecords({ gmp: 25 }, "Test API", "ipo-1"), []);
  assert.deepEqual(normalizeSubscriptionRecords({ total: 3.2 }, "Test API", "ipo-1"), []);
});
