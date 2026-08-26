import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSyntheticInvoice,
  projectsWithLiveRealInvoice,
  dedupeSyntheticInvoices,
  receivedByProject,
  planReceivedReconciliation,
} from "./invoice-provenance.ts";
import { collectableAmount } from "./received-allocation.ts";

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
//
// The rule under test: a superseded synthetic loses its FACE VALUE (the real
// invoice bills that work now) but never loses its CASH. Dropping the row
// outright — the previous behaviour — deleted collected money from Finance
// the moment a real invoice was marked sent.

const sumPaid = (rows: { amountPaid: number }[]) => rows.reduce((s, i) => s + i.amountPaid, 0);
const sumFace = (rows: { amount: number; expectedCash?: number | null }[]) =>
  rows.reduce((s, i) => s + collectableAmount(i), 0);

test("dedupeSyntheticInvoices: synthetic-only project is untouched (the production shape)", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amount: 20_000_000, amountPaid: 20_000_000 },
  ];
  assert.deepEqual(dedupeSyntheticInvoices(invoices), invoices);
});

test("dedupeSyntheticInvoices: legacy unflagged synthetic-only project is untouched", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "PAID", linesCount: 0, amount: 6_000_000, amountPaid: 6_000_000 },
  ];
  assert.deepEqual(dedupeSyntheticInvoices(invoices), invoices);
});

test("dedupeSyntheticInvoices: synthetic + DRAFT real invoice keeps the synthetic counting", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amount: 20_000_000, amountPaid: 20_000_000 },
    { id: "real1", projectId: "p1", status: "DRAFT", isSynthetic: false, linesCount: 4, amount: 20_500_000, amountPaid: 0 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id).sort(), ["real1", "syn1"]);
  assert.equal(sumPaid(result), 20_000_000);
});

test("dedupeSyntheticInvoices: live real invoice strips the synthetic's face value, not its cash", () => {
  // The IMPORTANT finding: at the instant the real invoice is marked SENT the
  // synthetic still holds every naira collected and the real invoice holds
  // none. Finance must not lose that cash in the gap.
  const invoices = [
    { id: "syn1", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 12_000_000, amountPaid: 12_000_000 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amount: 19_475_000, amountPaid: 0 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  // Cash conserved exactly.
  assert.equal(sumPaid(result), 12_000_000);
  // Face value counted once — the real invoice's, not both.
  assert.equal(sumFace(result), 19_475_000);
  const syn = result.find((i) => i.id === "syn1")!;
  assert.equal(syn.amountPaid, 12_000_000);
  assert.equal(collectableAmount(syn), 0);
});

test("dedupeSyntheticInvoices: a swept (empty) synthetic is dropped outright", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amount: 7_500_000, amountPaid: 0 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amount: 19_000_000, amountPaid: 19_000_000 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id), ["real1"]);
  assert.equal(sumPaid(result), 19_000_000);
});

test("dedupeSyntheticInvoices: cash the real invoices cannot hold keeps its face value", () => {
  // Overflow: the client has paid more than the real invoice can ever
  // collect, so the remainder on the synthetic is NOT a duplicate of the real
  // invoice's face value and must still count as revenue.
  const invoices = [
    { id: "syn1", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 7_500_000, amountPaid: 500_000 },
    { id: "real1", projectId: "p1", status: "PAID", isSynthetic: false, linesCount: 4, amount: 10_000_000, amountPaid: 10_000_000 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.equal(sumPaid(result), 10_500_000);
  assert.equal(sumFace(result), 10_500_000);
});

test("dedupeSyntheticInvoices: another project's invoices are unaffected", () => {
  const invoices = [
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amount: 20_000_000, amountPaid: 0 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amount: 19_475_000, amountPaid: 19_475_000 },
    { id: "syn2", projectId: "p2", status: "SENT", isSynthetic: true, linesCount: 0, amount: 5_000_000, amountPaid: 5_000_000 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.deepEqual(result.map((i) => i.id).sort(), ["real1", "syn2"]);
  assert.equal(sumPaid(result), 24_475_000);
});

test("dedupeSyntheticInvoices: government WHT capacity is respected when absorbing cash", () => {
  // collectableAmount, not face: an MDA withholds at source, so the real
  // invoice can only ever account for its expectedCash.
  const invoices = [
    { id: "syn1", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 20_000_000, amountPaid: 20_000_000 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 4, amount: 20_500_000, expectedCash: 19_475_000, amountPaid: 0 },
  ];
  const result = dedupeSyntheticInvoices(invoices);
  assert.equal(sumPaid(result), 20_000_000); // no cash lost
  // 19,475,000 of the cash is accounted for by the real invoice; the 525,000
  // beyond its collectable ceiling still counts.
  assert.equal(sumFace(result), 19_475_000 + 525_000);
});

// ---- receivedByProject ----------------------------------------------------

test("receivedByProject: failure mode 1 — the founder's figure, not double it", () => {
  // Synthetic holds the full received figure; the founder then issues a real
  // invoice and marks it SENT. Before the sweep runs, received must still
  // read 19,000,000 — never 38,000,000.
  const received = receivedByProject([
    { id: "syn1", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 19_000_000, amountPaid: 19_000_000 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 3, amount: 19_000_000, amountPaid: 0 },
  ]);
  assert.equal(received.get("p1"), 19_000_000);
});

test("receivedByProject: after the sweep the figure is unchanged", () => {
  const received = receivedByProject([
    { id: "syn1", projectId: "p1", status: "SENT", isSynthetic: true, linesCount: 0, amount: 19_000_000, amountPaid: 0 },
    { id: "real1", projectId: "p1", status: "SENT", isSynthetic: false, linesCount: 3, amount: 19_000_000, amountPaid: 19_000_000 },
  ]);
  assert.equal(received.get("p1"), 19_000_000);
});

test("receivedByProject: synthetic-only project reports exactly its cash", () => {
  const received = receivedByProject([
    { id: "a", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 2_500_000, amountPaid: 2_500_000 },
    { id: "b", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 2_500_000, amountPaid: 2_500_000 },
    { id: "c", projectId: "p1", status: "PAID", isSynthetic: true, linesCount: 0, amount: 2_500_000, amountPaid: 2_500_000 },
  ]);
  assert.equal(received.get("p1"), 7_500_000);
});

// ---- planReceivedReconciliation ------------------------------------------

const syn = (id: string, amount: number, amountPaid: number, status = "PAID") => ({
  id,
  code: id,
  amount,
  amountPaid,
  status,
  paidDate: null,
  isSynthetic: true,
  linesCount: 0,
});

const real = (
  id: string,
  amount: number,
  amountPaid: number,
  status = "SENT",
  expectedCash?: number,
) => ({
  id,
  code: id,
  amount,
  expectedCash,
  amountPaid,
  status,
  paidDate: null,
  isSynthetic: false,
  linesCount: 4,
});

const applied = (invoices: { id: string; amountPaid: number }[], writes: { id: string; to: number }[]) => {
  const byId = new Map(writes.map((w) => [w.id, w.to]));
  return invoices.reduce((s, i) => s + (byId.get(i.id) ?? i.amountPaid), 0);
};

test("planReceivedReconciliation: FAILURE MODE 1 — no double count, no inflated payment record", () => {
  // Synthetic holds NGN 19,000,000. The founder issues a real invoice, marks
  // it SENT, then re-saves received as NGN 19,000,000.
  const invoices = [syn("SYN", 19_000_000, 19_000_000), real("REAL", 19_000_000, 0)];
  const plan = planReceivedReconciliation(invoices, 19_000_000);

  // The money moved onto the real invoice, and off the synthetic.
  assert.equal(applied(invoices, plan.writes), 19_000_000, "ledger must total the founder's figure");
  const byId = new Map(plan.writes.map((w) => [w.id, w]));
  assert.equal(byId.get("SYN")!.to, 0);
  assert.equal(byId.get("REAL")!.to, 19_000_000);

  // No money entered or left the business, so nothing may be filed as a
  // client payment — the old code filed a VERIFIED confirmation for the
  // inflated total and showed it to the client in the portal.
  assert.equal(plan.previousReceived, 19_000_000);
  assert.equal(plan.delta, 0);
  assert.deepEqual(plan.payments, []);
  assert.equal(plan.unallocated, 0);
});

test("planReceivedReconciliation: FAILURE MODE 2 — a legitimate payment is recordable", () => {
  // Synthetic holds NGN 7,500,000; the real invoice can collect
  // NGN 10,000,000; the client pays a further NGN 3,000,000. Total received
  // NGN 10,500,000 exceeds what the real invoice alone can hold — which used
  // to hard-refuse the payment.
  const invoices = [syn("SYN", 7_500_000, 7_500_000), real("REAL", 10_000_000, 0)];
  const plan = planReceivedReconciliation(invoices, 10_500_000);

  assert.equal(plan.unallocated, 0, "must not refuse a payment the founder actually received");
  assert.equal(applied(invoices, plan.writes), 10_500_000);

  const byId = new Map(plan.writes.map((w) => [w.id, w]));
  // Real invoice filled to capacity first; only the true overflow stays put.
  assert.equal(byId.get("REAL")!.to, 10_000_000);
  assert.equal(byId.get("SYN")!.to, 500_000);

  // The payment record is the NGN 3,000,000 that actually arrived.
  assert.equal(plan.delta, 3_000_000);
  assert.equal(
    plan.payments.reduce((s, c) => s + Math.abs(c.to - c.from), 0),
    3_000_000,
  );
});

test("planReceivedReconciliation: payment onto a project already migrated", () => {
  const invoices = [syn("SYN", 7_500_000, 0, "SENT"), real("REAL", 19_000_000, 5_000_000, "PARTIAL")];
  const plan = planReceivedReconciliation(invoices, 9_000_000);
  assert.equal(plan.delta, 4_000_000);
  assert.equal(applied(invoices, plan.writes), 9_000_000);
  assert.equal(
    plan.payments.reduce((s, c) => s + Math.abs(c.to - c.from), 0),
    4_000_000,
  );
});

test("planReceivedReconciliation: correcting received downward unwinds the real invoice", () => {
  const invoices = [syn("SYN", 7_500_000, 7_500_000), real("REAL", 19_000_000, 0)];
  const plan = planReceivedReconciliation(invoices, 5_000_000);
  assert.equal(plan.delta, -2_500_000);
  assert.equal(applied(invoices, plan.writes), 5_000_000);
  assert.equal(
    plan.payments.reduce((s, c) => s + Math.abs(c.to - c.from), 0),
    2_500_000,
  );
});

test("planReceivedReconciliation: refuses only what NO invoice on the project can hold", () => {
  const invoices = [syn("SYN", 1_000_000, 1_000_000), real("REAL", 10_000_000, 0)];
  const plan = planReceivedReconciliation(invoices, 12_000_000);
  // Capacity is 10,000,000 real + 1,000,000 synthetic = 11,000,000.
  assert.equal(plan.unallocated, 1_000_000);
});

test("planReceivedReconciliation: government real invoice fills only to expectedCash", () => {
  const invoices = [syn("SYN", 20_000_000, 20_000_000), real("REAL", 20_500_000, 0, "SENT", 19_475_000)];
  const plan = planReceivedReconciliation(invoices, 20_000_000);
  const byId = new Map(plan.writes.map((w) => [w.id, w]));
  assert.equal(byId.get("REAL")!.to, 19_475_000);
  assert.equal(byId.get("REAL")!.status, "PAID");
  assert.equal(byId.get("SYN")!.to, 525_000);
  assert.equal(applied(invoices, plan.writes), 20_000_000);
  assert.equal(plan.delta, 0);
  assert.deepEqual(plan.payments, []);
});

test("planReceivedReconciliation: synthetic-only project behaves exactly as before", () => {
  const invoices = [syn("SYN", 10_000_000, 2_500_000, "PARTIAL")];
  const plan = planReceivedReconciliation(invoices, 7_500_000);
  assert.equal(plan.delta, 5_000_000);
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].to, 7_500_000);
  assert.equal(
    plan.payments.reduce((s, c) => s + Math.abs(c.to - c.from), 0),
    5_000_000,
  );
});

test("planReceivedReconciliation: an already-correct ledger writes nothing", () => {
  const invoices = [real("REAL", 19_000_000, 19_000_000, "PAID")];
  const plan = planReceivedReconciliation(invoices, 19_000_000);
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.payments, []);
});

test("planReceivedReconciliation: no money is created or destroyed, at any target", () => {
  for (const target of [0, 1, 500_000, 7_499_999, 7_500_000, 10_000_000, 10_500_000, 17_500_000]) {
    const invoices = [syn("SYN", 7_500_000, 7_500_000), real("REAL", 10_000_000, 3_000_000, "PARTIAL")];
    const plan = planReceivedReconciliation(invoices, target);
    assert.equal(
      applied(invoices, plan.writes) + plan.unallocated,
      target,
      `target ${target}: ledger + unallocated must equal the founder's figure`,
    );
  }
});
