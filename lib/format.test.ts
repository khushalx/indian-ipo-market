import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateGMPPercent,
  formatCompactDateTime,
  formatGMP,
  gmpDirection,
  signedRupees,
} from "./format";

test("GMP formatting preserves positive, negative, and neutral direction", () => {
  assert.equal(signedRupees(25), "+₹25");
  assert.equal(signedRupees(-4), "−₹4");
  assert.equal(signedRupees(0), "₹0");
  assert.equal(formatGMP(-4, -4), "−₹4 (−4%)");
  assert.equal(gmpDirection(12), "positive");
  assert.equal(gmpDirection(-1), "negative");
  assert.equal(gmpDirection(0), "neutral");
});

test("GMP percentage requires a valid upper price band", () => {
  assert.equal(calculateGMPPercent(25, undefined), undefined);
  assert.equal(calculateGMPPercent(25, 0), undefined);
  assert.equal(calculateGMPPercent(25, 100), 25);
});

test("compact market timestamps render in IST", () => {
  assert.match(formatCompactDateTime("2026-08-19T05:00:00Z"), /^19 Aug, 10:30/);
});
