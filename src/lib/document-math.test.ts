import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineAmount,
  sumLines,
  groupBySection,
  computeTax,
  grossUpFactor,
  grossUpSubtotal,
  roundToNearest,
  VAT_RATE,
  WHT_RATE,
  type DocumentLineInput,
} from "./document-math.ts";

function line(over: Partial<DocumentLineInput> = {}): DocumentLineInput {
  return {
    section: "Audiovisual",
    description: "LED wall",
    days: 1,
    quantity: 1,
    unitPrice: 100_000,
    ...over,
  };
}

// ---- lineAmount ---------------------------------------------------------

test("lineAmount multiplies quantity, days and unit price", () => {
  assert.equal(lineAmount({ quantity: 12, days: 4, unitPrice: 85_000 }), 4_080_000);
});

test("lineAmount treats a one-day line as quantity times price", () => {
  assert.equal(lineAmount({ quantity: 3, days: 1, unitPrice: 250_000 }), 750_000);
});

test("lineAmount returns zero for a complimentary line", () => {
  assert.equal(lineAmount({ quantity: 2, days: 3, unitPrice: 0 }), 0);
});

test("lineAmount coerces missing or invalid factors to safe values", () => {
  assert.equal(lineAmount({ quantity: 0, days: 4, unitPrice: 85_000 }), 0);
  assert.equal(lineAmount({ quantity: 2, days: 0, unitPrice: 85_000 }), 0);
});

// ---- sumLines and groupBySection ---------------------------------------

test("sumLines totals every line", () => {
  const lines = [
    line({ unitPrice: 8_400_000 }),
    line({ unitPrice: 4_750_000 }),
    line({ unitPrice: 3_120_000 }),
    line({ unitPrice: 1_850_000 }),
  ];
  assert.equal(sumLines(lines), 18_120_000);
});

test("sumLines of nothing is zero", () => {
  assert.equal(sumLines([]), 0);
});

test("groupBySection keeps first-seen section order and totals each", () => {
  const lines = [
    line({ section: "Scenic", unitPrice: 8_400_000 }),
    line({ section: "Audiovisual", unitPrice: 4_750_000 }),
    line({ section: "Scenic", unitPrice: 1_600_000 }),
  ];
  const groups = groupBySection(lines);
  assert.deepEqual(groups.map((g) => g.section), ["Scenic", "Audiovisual"]);
  assert.equal(groups[0].total, 10_000_000);
  assert.equal(groups[0].lines.length, 2);
  assert.equal(groups[1].total, 4_750_000);
});

test("groupBySection files unsectioned lines under Other", () => {
  const groups = groupBySection([line({ section: null, unitPrice: 500_000 })]);
  assert.equal(groups[0].section, "Other");
});

test("summary and itemised views always agree on the total", () => {
  const lines = [
    line({ section: "Scenic", quantity: 1, days: 1, unitPrice: 8_400_000 }),
    line({ section: "Audiovisual", quantity: 12, days: 4, unitPrice: 85_000 }),
    line({ section: "Audiovisual", quantity: 1, days: 4, unitPrice: 300_000 }),
  ];
  const itemised = sumLines(lines);
  const summary = groupBySection(lines).reduce((s, g) => s + g.total, 0);
  assert.equal(summary, itemised);
});

// ---- computeTax: commercial client -------------------------------------

test("commercial invoice: VAT is added and all of it is expected in cash", () => {
  const r = computeTax({ subtotal: 18_120_000 });
  assert.equal(r.net, 18_120_000);
  assert.equal(r.vat, 1_359_000);
  assert.equal(r.total, 19_479_000);
  assert.equal(r.wht, 0);
  assert.equal(r.expectedCash, 19_479_000);
});

test("discount is applied before VAT", () => {
  const r = computeTax({ subtotal: 10_000_000, discount: 1_000_000 });
  assert.equal(r.net, 9_000_000);
  assert.equal(r.vat, 675_000);
  assert.equal(r.total, 9_675_000);
});

// ---- computeTax: government client -------------------------------------

test("government invoice: VAT is withheld at source so cash is net minus WHT", () => {
  const r = computeTax({
    subtotal: 18_120_000,
    whtRate: WHT_RATE,
    vatWithheldAtSource: true,
  });
  assert.equal(r.vat, 1_359_000);
  assert.equal(r.total, 19_479_000);
  assert.equal(r.wht, 906_000);
  assert.equal(r.expectedCash, 17_214_000);
});

test("government expectedCash excludes VAT entirely, not just WHT", () => {
  const r = computeTax({
    subtotal: 18_120_000,
    whtRate: WHT_RATE,
    vatWithheldAtSource: true,
  });
  assert.notEqual(r.expectedCash, r.total - r.wht);
  assert.equal(r.total - r.expectedCash, r.vat + r.wht);
});

test("WHT without VAT withholding deducts only WHT from the total", () => {
  const r = computeTax({ subtotal: 1_000_000, whtRate: 5 });
  assert.equal(r.total, 1_075_000);
  assert.equal(r.wht, 50_000);
  assert.equal(r.expectedCash, 1_025_000);
});

test("WHT is computed on the pre-VAT net, never on the total", () => {
  const r = computeTax({ subtotal: 1_000_000, whtRate: 5, vatWithheldAtSource: true });
  assert.equal(r.wht, 50_000);
});

test("a zero-value document produces zeros, not NaN", () => {
  const r = computeTax({ subtotal: 0, whtRate: 5, vatWithheldAtSource: true });
  assert.equal(r.total, 0);
  assert.equal(r.expectedCash, 0);
});

// ---- gross-up -----------------------------------------------------------

test("grossUpFactor divides by one minus the rate", () => {
  assert.equal(grossUpFactor(5), 1 / 0.95);
});

test("grossUpFactor of zero is one", () => {
  assert.equal(grossUpFactor(0), 1);
});

test("grossUpSubtotal lands the target net exactly after WHT", () => {
  const target = 18_120_000;
  const subtotal = grossUpSubtotal(target, 5);
  const r = computeTax({ subtotal, whtRate: 5, vatWithheldAtSource: true });
  assert.ok(Math.abs(r.expectedCash - target) < 0.01);
});

test("grossing up is NOT the same as adding the rate", () => {
  const target = 18_120_000;
  const correct = grossUpSubtotal(target, 5);
  const naive = target * 1.05;
  assert.ok(correct > naive);
  const shortfall = computeTax({
    subtotal: naive,
    whtRate: 5,
    vatWithheldAtSource: true,
  }).expectedCash;
  assert.ok(target - shortfall > 40_000);
});

test("grossUpFactor rejects a rate that cannot be recovered", () => {
  assert.throws(() => grossUpFactor(100), /between 0 and 100/);
  assert.throws(() => grossUpFactor(-1), /between 0 and 100/);
});

// ---- rounding -----------------------------------------------------------

test("roundToNearest rounds to the given step", () => {
  assert.equal(roundToNearest(19_073_684.21, 100), 19_073_700);
  assert.equal(roundToNearest(1_234, 100), 1_200);
});

test("roundToNearest with step 0 or 1 returns the value unrounded", () => {
  assert.equal(roundToNearest(1_234.56, 0), 1_234.56);
});

test("VAT_RATE and WHT_RATE are the Nigerian statutory rates", () => {
  assert.equal(VAT_RATE, 7.5);
  assert.equal(WHT_RATE, 5);
});
