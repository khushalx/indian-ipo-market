import assert from "node:assert/strict";
import test from "node:test";

import { calculateGMP, percentageReturn } from "./calculations";
import { gmpFreshness } from "./freshness";
import { normalizeCompanyName } from "./normalize";
import { reconcileField } from "./reconcile";
import { authoritativeExplicitStatus, calculateIPOStatus } from "./status";

test("company normalization keeps conservative aliases together", () => {
  assert.equal(normalizeCompanyName("ABC Technologies Limited"), "abc technologies");
  assert.equal(normalizeCompanyName("ABC TECHNOLOGIES LTD."), "abc technologies");
  assert.notEqual(normalizeCompanyName("ABC Technologies"), normalizeCompanyName("ABC Tech Systems"));
});

test("GMP and listing returns are calculated internally with decimal-safe scaling", () => {
  assert.deepEqual(calculateGMP(500, 75), {
    estimatedListingPrice: 575,
    gmpPercent: 15,
  });
  assert.deepEqual(calculateGMP(500, -25), {
    estimatedListingPrice: 475,
    gmpPercent: -5,
  });
  assert.equal(percentageReturn(200, 230), 15);
  assert.equal(percentageReturn(undefined, 230), undefined);
});

test("date engine derives lifecycle states in IST without provider status text", () => {
  const now = new Date("2026-08-19T06:00:00.000Z");
  assert.equal(calculateIPOStatus({ hasDRHP: true }, now), "drhp_filed");
  assert.equal(calculateIPOStatus({ hasRHP: true }, now), "rhp_filed");
  assert.equal(calculateIPOStatus({ openDate: "2026-08-18", closeDate: "2026-08-20" }, now), "open");
  assert.equal(calculateIPOStatus({ listingDate: "2026-08-19" }, now), "listed");
  assert.equal(calculateIPOStatus({ explicitStatus: "withdrawn", listingDate: "2026-08-19" }, now), "withdrawn");
});

test("only official or verified-manual cancellation provenance can override derived status", () => {
  assert.equal(authoritativeExplicitStatus({
    status: "withdrawn",
    sourceKind: "STRUCTURED_API",
    authorityLevel: "THIRD_PARTY",
    isOfficial: false,
  }), undefined);
  assert.equal(authoritativeExplicitStatus({
    status: "open",
    sourceKind: "EXCHANGE",
    authorityLevel: "OFFICIAL",
    isOfficial: true,
  }), undefined);
  assert.equal(authoritativeExplicitStatus({
    status: "cancelled",
    sourceKind: "EXCHANGE",
    authorityLevel: "OFFICIAL",
    isOfficial: true,
  }), "withdrawn");
  assert.equal(authoritativeExplicitStatus({
    status: "withdrawn",
    sourceKind: "REGULATOR",
    authorityLevel: "OFFICIAL",
    isOfficial: true,
  }), "withdrawn");
  assert.equal(authoritativeExplicitStatus({
    status: "deferred",
    sourceKind: "MANUAL",
    authorityLevel: "MANUAL",
    isOfficial: false,
  }), undefined);
  assert.equal(authoritativeExplicitStatus({
    status: "deferred",
    sourceKind: "MANUAL",
    authorityLevel: "MANUAL",
    isOfficial: false,
    verifiedAt: "2026-08-19T06:00:00.000Z",
  }), "deferred");
});

test("reconciliation retains higher authority over a newer lower-priority value", () => {
  const result = reconcileField(
    { value: "1580", sourceId: "rhp", priority: 900, fetchedAt: "2026-08-18T00:00:00Z" },
    { value: "1600", sourceId: "third-party", priority: 500, fetchedAt: "2026-08-19T00:00:00Z" },
  );
  assert.equal(result.winner.value, "1580");
  assert.equal(result.conflict?.rejected.value, "1600");
});

test("GMP freshness labels never imply live data", () => {
  const now = new Date("2026-08-19T12:00:00Z");
  assert.equal(gmpFreshness("2026-08-19T11:45:00Z", now), "fresh");
  assert.equal(gmpFreshness("2026-08-19T11:00:00Z", now), "recent");
  assert.equal(gmpFreshness("2026-08-19T09:00:00Z", now), "delayed");
  assert.equal(gmpFreshness("2026-08-19T00:00:00Z", now), "stale");
});
