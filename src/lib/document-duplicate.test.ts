import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateQuotationData,
  duplicateInvoiceData,
  duplicateLines,
  futureOnly,
} from "./document-duplicate.ts";

const NOW = new Date("2026-08-31T12:00:00.000Z").getTime();
const DAY = 86_400_000;

const QUOTE = {
  projectId: "prj_1", accountId: "acc_1", title: "Triple Helix SciBiz 2026",
  eventStart: new Date("2026-10-14"), eventEnd: new Date("2026-10-16"),
  detailLevel: "SUMMARY", subtotal: 12_117_400, discount: 0, vatRate: 7.5,
  tax: 908_805, total: 13_026_205, whtRate: 0, vatWithheldAtSource: false,
  grossUpRate: 0, targetNet: null, paymentTerms: "50% on award", notes: "n",
  validUntil: new Date(NOW + 30 * DAY),
};

const INVOICE = {
  projectId: "prj_1", accountId: "acc_1", title: "NNPC Stakeholders",
  eventStart: null, eventEnd: null, detailLevel: "ITEMISED",
  subtotal: 4_000_000, discount: 0, vatRate: 7.5, tax: 300_000,
  amount: 4_300_000, whtRate: 5, whtAmount: 200_000, expectedCash: 3_800_000,
  vatWithheldAtSource: true, grossUpRate: 5, targetNet: 3_800_000,
  paymentTerms: "30 days", dueDate: new Date(NOW + 14 * DAY),
};

test("a duplicated quotation carries the work and starts as a DRAFT", () => {
  const d = duplicateQuotationData(QUOTE, NOW);
  assert.equal(d.status, "DRAFT");
  assert.equal(d.subtotal, 12_117_400);
  assert.equal(d.total, 13_026_205);
  assert.equal(d.title, "Triple Helix SciBiz 2026");
  assert.equal(d.paymentTerms, "50% on award");
});

test("a duplicated quotation never carries its number or its conversion", () => {
  const d = duplicateQuotationData(QUOTE, NOW) as Record<string, unknown>;
  // A reused document number is an audit problem; a carried conversion link
  // would make the copy claim to have already become an invoice.
  assert.equal("code" in d, false);
  assert.equal("convertedInvoiceId" in d, false);
  assert.equal("id" in d, false);
  assert.equal("createdAt" in d, false);
});

test("THE DANGEROUS ONE: a duplicated invoice invents no payment", () => {
  // Carrying amountPaid or paidDate would create a document asserting that a
  // client paid money they never sent.
  const paid = { ...INVOICE };
  const d = duplicateInvoiceData(paid, NOW);
  assert.equal(d.amountPaid, 0);
  assert.equal(d.paidDate, null);
  assert.equal(d.status, "DRAFT");
  assert.equal(d.reminderCount, 0);
  assert.equal(d.lastReminderAt, null);
});

test("a duplicated invoice drops the quotation link, which is unique", () => {
  // Not merely misleading — a second invoice claiming the same quotation
  // violates the unique constraint and the insert fails outright.
  const d = duplicateInvoiceData(INVOICE, NOW) as Record<string, unknown>;
  assert.equal("quotationId" in d, false);
  assert.equal("code" in d, false);
  assert.equal("receipts" in d, false);
  assert.equal("paymentConfirmations" in d, false);
});

test("a duplicated invoice is never marked synthetic", () => {
  // isSynthetic marks invoices reconstructed during a migration. A copy the
  // founder made by hand is a real document.
  assert.equal(duplicateInvoiceData(INVOICE, NOW).isSynthetic, false);
});

test("the tax figures are carried verbatim, not recomputed", () => {
  // expectedCash is net - wht for a government client. Re-deriving it here
  // would risk disagreeing with document-math, which owns that rule.
  const d = duplicateInvoiceData(INVOICE, NOW);
  assert.equal(d.whtAmount, 200_000);
  assert.equal(d.expectedCash, 3_800_000);
  assert.equal(d.vatWithheldAtSource, true);
  assert.equal(d.grossUpRate, 5);
});

test("a still-future deadline is kept", () => {
  assert.equal(duplicateQuotationData(QUOTE, NOW).validUntil?.getTime(), NOW + 30 * DAY);
  assert.equal(duplicateInvoiceData(INVOICE, NOW).dueDate?.getTime(), NOW + 14 * DAY);
});

test("a deadline that has already passed is dropped, not inherited", () => {
  // Otherwise the copy is expired or overdue the moment it exists, and the
  // founder has to notice in order to fix it.
  const stale = duplicateQuotationData({ ...QUOTE, validUntil: new Date(NOW - DAY) }, NOW);
  assert.equal(stale.validUntil, null);
  const overdue = duplicateInvoiceData({ ...INVOICE, dueDate: new Date(NOW - DAY) }, NOW);
  assert.equal(overdue.dueDate, null);
});

test("event dates ARE carried, stale or not — they describe the job", () => {
  const past = duplicateQuotationData(
    { ...QUOTE, eventStart: new Date("2020-01-01"), eventEnd: new Date("2020-01-02") },
    NOW,
  );
  assert.equal(past.eventStart?.getFullYear(), 2020);
  assert.equal(past.eventEnd?.getFullYear(), 2020);
});

test("futureOnly handles absent and unparseable dates", () => {
  assert.equal(futureOnly(null, NOW), null);
  assert.equal(futureOnly(undefined, NOW), null);
  assert.equal(futureOnly("not a date", NOW), null);
  assert.equal(futureOnly(new Date(NOW + 1000), NOW)?.getTime(), NOW + 1000);
  assert.equal(futureOnly(new Date(NOW), NOW), null, "exactly now has passed");
});

test("a real zero survives duplication", () => {
  // 0 is a complimentary price in this system, not an absent one.
  const free = duplicateInvoiceData(
    { ...INVOICE, subtotal: 0, amount: 0, tax: 0, expectedCash: 0, discount: 0 },
    NOW,
  );
  assert.equal(free.subtotal, 0);
  assert.equal(free.amount, 0);
  assert.equal(free.expectedCash, 0);
});

test("lines are copied in order and renumbered from zero", () => {
  const lines = [
    { section: "Sound", description: "PA", subDescription: null, days: 3, quantity: 1, unitPrice: 330_000, amount: 990_000, sortOrder: 7 },
    { section: "Displays", description: "LED", subDescription: "6sqm", days: 3, quantity: 2, unitPrice: 250_000, amount: 1_500_000, sortOrder: 2 },
  ];
  const copied = duplicateLines(lines);
  assert.deepEqual(copied.map((l) => l.description), ["LED", "PA"]);
  assert.deepEqual(copied.map((l) => l.sortOrder), [0, 1]);
  assert.equal(copied[0].subDescription, "6sqm");
  assert.equal(copied[1].amount, 990_000);
});

test("duplicating does not mutate the source lines", () => {
  const lines = [
    { section: null, description: "A", subDescription: null, days: 1, quantity: 1, unitPrice: 1, amount: 1, sortOrder: 9 },
  ];
  duplicateLines(lines);
  assert.equal(lines[0].sortOrder, 9);
});

test("a free line of zero copies as zero, not as missing", () => {
  const lines = [
    { section: "Displays", description: "Comp screen", subDescription: null, days: 1, quantity: 1, unitPrice: 0, amount: 0, sortOrder: 0 },
  ];
  const [copied] = duplicateLines(lines);
  assert.equal(copied.unitPrice, 0);
  assert.equal(copied.amount, 0);
});
