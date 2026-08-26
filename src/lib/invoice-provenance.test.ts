import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSyntheticInvoice,
  projectsWithLiveRealInvoice,
  dedupeSyntheticInvoices,
} from "./invoice-provenance.ts";

// ---- isSyntheticInvoice --------------------------------------------------

test("isSyntheticInvoice: flagged isSynthetic is synthetic regardless of lines", () => {
  assert.equal(isSyntheticInvoice({ isSynthetic: true, linesCount: 3 }), true);
});

test("isSyntheticInvoice: zero lines is synthetic even when isSynthetic is unset (legacy rows)", () => {
  assert.equal(isSyntheticInvoice({ linesCount: 0 }), true);
  assert.equal(isSyntheticInvoice({ isSynthetic: false, linesCount: 0 }), true);
});

test("isSyntheticInvoice: a real invoice has lines and no flag", () => {
  assert.equal(isSyntheticInvoice({ isSynthetic: false, linesCount: 2 }), false);
});

// ---- projectsWithLiveRealInvoice -----------------------------------------

test("projectsWithLiveRealInvoice: DRAFT real invoice does not count as live yet", () => {
  const ids = projectsWithLiveRealInvoice([
    { projectId: "p1", status: "DRAFT", isSynthetic: false, linesCount: 3 },
  ]);
  assert.equal(ids.has("p1"), false);
});

test("projectsWithLiveRealInvoice: SENT real invoice counts as live", () => {
  const ids = projectsWithLiveRealInvoice([
    { projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 3 },
  ]);
  assert.equal(ids.has("p1"), true);
});

test("projectsWithLiveRealInvoice: a synthetic invoice never makes a project live", () => {
  const ids = projectsWithLiveRealInvoice([
    { projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0 },
    { projectId: "p2", status: "PAID", linesCount: 0 }, // legacy, unflagged, no lines
  ]);
  assert.equal(ids.size, 0);
});

// ---- dedupeSyntheticInvoices ----------------------------------------------
// This is the exact "reviewed scenario" from final-fix-report.md finding 1:
// a project carrying a synthetic reconcileReceived row plus a real
// Documents invoice.

test("dedupeSyntheticInvoices: synthetic-only project is untouched (goal 3)", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amountPaid: 20_000_000 },
  ];
  assert.deepEqual(dedupeSyntheticInvoices(invoices), invoices);
});

test("dedupeSyntheticInvoices: legacy unflagged synthetic-only project is untouched", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "PAID", linesCount: 0, amountPaid: 6_000_000 },
  ];
  assert.deepEqual(dedupeSyntheticInvoices(invoices), invoices);
});

test("dedupeSyntheticInvoices: synthetic + DRAFT real invoice keeps the synthetic counting", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amountPaid: 20_000_000 },
    { id: "real1", projectId: "p1", status: "DRAFT", isSynthetic: false, linesCount: 4, amountPaid: 0 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id).sort(), ["real1", "syn1"]);
});

test("dedupeSyntheticInvoices: synthetic + SENT (live) real invoice drops the synthetic", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amountPaid: 20_000_000 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amountPaid: 19_475_000 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id), ["real1"]);
});

test("dedupeSyntheticInvoices: another project's invoices are unaffected", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amountPaid: 20_000_000 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amountPaid: 19_475_000 },
    { id: "syn2", projectId: "p2", status: "SENT", isSynthetic: true, linesCount: 0, amountPaid: 5_000_000 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id).sort(), ["real1", "syn2"]);
});
