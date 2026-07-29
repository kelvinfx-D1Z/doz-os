import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractedRevenuePct,
  multiThreadedAccountsPct,
  isSingleThreaded,
  type AccountMetricInput,
} from "./crm-metrics.ts";

function account(over: Partial<AccountMetricInput> = {}): AccountMetricInput {
  return {
    id: "a1",
    revenue: 0,
    contactCount: 0,
    hasActiveRecurringContract: false,
    ...over,
  };
}

test("contractedRevenuePct is 0 for no accounts", () => {
  assert.equal(contractedRevenuePct([]), 0);
});

test("contractedRevenuePct is 0 when no account has a recurring contract", () => {
  const accounts = [account({ revenue: 5_000_000 }), account({ id: "a2", revenue: 3_000_000 })];
  assert.equal(contractedRevenuePct(accounts), 0);
});

test("contractedRevenuePct is 100 when all revenue is contracted", () => {
  const accounts = [account({ revenue: 5_000_000, hasActiveRecurringContract: true })];
  assert.equal(contractedRevenuePct(accounts), 100);
});

test("contractedRevenuePct weights by revenue, not account count", () => {
  // 3M contracted out of 12M total = 25%
  const accounts = [
    account({ id: "a1", revenue: 3_000_000, hasActiveRecurringContract: true }),
    account({ id: "a2", revenue: 9_000_000 }),
  ];
  assert.equal(contractedRevenuePct(accounts), 25);
});

test("contractedRevenuePct is 0 when total revenue is 0 (no divide by zero)", () => {
  const accounts = [account({ revenue: 0, hasActiveRecurringContract: true })];
  assert.equal(contractedRevenuePct(accounts), 0);
});

test("multiThreadedAccountsPct counts accounts with 2+ contacts", () => {
  const accounts = [
    account({ id: "a1", contactCount: 3 }),
    account({ id: "a2", contactCount: 1 }),
    account({ id: "a3", contactCount: 0 }),
    account({ id: "a4", contactCount: 2 }),
  ];
  assert.equal(multiThreadedAccountsPct(accounts), 50);
});

test("multiThreadedAccountsPct is 0 for no accounts", () => {
  assert.equal(multiThreadedAccountsPct([]), 0);
});

test("isSingleThreaded is true for 0 or 1 contacts, false for 2+", () => {
  assert.equal(isSingleThreaded({ contactCount: 0 }), true);
  assert.equal(isSingleThreaded({ contactCount: 1 }), true);
  assert.equal(isSingleThreaded({ contactCount: 2 }), false);
});
