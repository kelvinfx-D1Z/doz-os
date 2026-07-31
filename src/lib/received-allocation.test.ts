import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectableAmount,
  invoiceStatusFor,
  allocateDelta,
  type AllocatableInvoice,
} from "./received-allocation.ts";

function inv(over: Partial<AllocatableInvoice> = {}): AllocatableInvoice {
  return {
    id: "i1",
    amount: 1_000_000,
    expectedCash: 0,
    amountPaid: 0,
    status: "SENT",
    paidDate: null,
    ...over,
  };
}

// ---- collectableAmount -------------------------------------------------

test("collectableAmount falls back to the face amount when WHT does not apply", () => {
  assert.equal(collectableAmount({ amount: 1_000_000, expectedCash: 0 }), 1_000_000);
  assert.equal(collectableAmount({ amount: 1_000_000 }), 1_000_000);
  assert.equal(collectableAmount({ amount: 1_000_000, expectedCash: null }), 1_000_000);
});

test("collectableAmount uses expectedCash when withholding tax applies", () => {
  assert.equal(collectableAmount({ amount: 13_227_875, expectedCash: 12_612_625 }), 12_612_625);
});

// ---- the real APPO government invoice ----------------------------------
// subtotal 12,305,000 + VAT 7.5% (922,875) = 13,227,875 invoiced.
// WHT is 5% of the PRE-VAT value = 615,250, deducted at source.
// So 12,612,625 is the most that can ever arrive in cash.

const APPO_TOTAL = 13_227_875;
const APPO_EXPECTED_CASH = 12_612_625;

test("a government invoice paid in full reaches PAID, not PARTIAL", () => {
  const collectable = collectableAmount({ amount: APPO_TOTAL, expectedCash: APPO_EXPECTED_CASH });
  const { status } = invoiceStatusFor(collectable, APPO_EXPECTED_CASH, "SENT", null);
  assert.equal(status, "PAID");
});

test("reconciling a government invoice against face value would strand it at PARTIAL", () => {
  // This is the bug the expectedCash field exists to prevent.
  const { status } = invoiceStatusFor(APPO_TOTAL, APPO_EXPECTED_CASH, "SENT", null);
  assert.equal(status, "PARTIAL");
});

test("allocation treats expectedCash as the ceiling, leaving nothing unallocated", () => {
  const invoices = [inv({ amount: APPO_TOTAL, expectedCash: APPO_EXPECTED_CASH })];
  const { changes, unallocated } = allocateDelta(invoices, APPO_EXPECTED_CASH);
  assert.equal(unallocated, 0);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].to, APPO_EXPECTED_CASH);
  assert.equal(changes[0].status, "PAID");
});

test("a non-government invoice still reconciles against its full amount", () => {
  const invoices = [inv({ amount: APPO_TOTAL, expectedCash: 0 })];
  const { changes, unallocated } = allocateDelta(invoices, APPO_EXPECTED_CASH);
  assert.equal(unallocated, 0);
  assert.equal(changes[0].status, "PARTIAL"); // genuinely short — correct here
});

// ---- allocation behaviour ---------------------------------------------

test("an increase fills outstanding balances oldest-first and never touches a settled invoice", () => {
  const invoices = [
    inv({ id: "old", amount: 500_000, amountPaid: 500_000, status: "PAID", paidDate: new Date("2026-01-10") }),
    inv({ id: "new", amount: 1_000_000, amountPaid: 0 }),
  ];
  const { changes } = allocateDelta(invoices, 1_200_000);
  assert.equal(changes.length, 1, "the settled invoice must not be rewritten");
  assert.equal(changes[0].id, "new");
  assert.equal(changes[0].to, 700_000);
});

test("a decrease unwinds newest-first", () => {
  const invoices = [
    inv({ id: "old", amount: 500_000, amountPaid: 500_000, status: "PAID", paidDate: new Date("2026-01-10") }),
    inv({ id: "new", amount: 1_000_000, amountPaid: 300_000, status: "PARTIAL" }),
  ];
  const { changes } = allocateDelta(invoices, 500_000);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "new");
  assert.equal(changes[0].to, 0);
});

test("an already-paid invoice keeps its original paid date rather than being re-stamped", () => {
  const january = new Date("2026-01-10");
  const { paidDate } = invoiceStatusFor(500_000, 500_000, "PAID", january, new Date("2026-07-31"));
  assert.equal(paidDate?.getTime(), january.getTime());
});

test("un-paying an invoice clears its paid date", () => {
  const { status, paidDate } = invoiceStatusFor(500_000, 200_000, "PAID", new Date("2026-01-10"));
  assert.equal(status, "PARTIAL");
  assert.equal(paidDate, null);
});

test("no change produces no writes", () => {
  const invoices = [inv({ amount: 1_000_000, amountPaid: 400_000, status: "PARTIAL" })];
  const { delta, changes } = allocateDelta(invoices, 400_000);
  assert.equal(delta, 0);
  assert.equal(changes.length, 0);
});
