import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseLines, applyGrossUp, parseDocumentBody, type IncomingLine } from "./document-request.ts";
import { sumLines, computeTax, type DocumentLineInput } from "./document-math.ts";

function incoming(over: Partial<IncomingLine> = {}): IncomingLine {
  return {
    section: "Audiovisual",
    description: "LED wall",
    days: 1,
    quantity: 1,
    unitPrice: 100_000,
    ...over,
  };
}

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

// ---- normaliseLines -----------------------------------------------------

test("normaliseLines returns an empty array for non-array input", () => {
  assert.deepEqual(normaliseLines(undefined), []);
  assert.deepEqual(normaliseLines(null), []);
  assert.deepEqual(normaliseLines("not an array"), []);
});

test("normaliseLines drops lines with no description", () => {
  const result = normaliseLines([
    incoming({ description: "" }),
    incoming({ description: "   " }),
    incoming({ description: undefined }),
    incoming({ description: "Stage design" }),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].description, "Stage design");
});

test("normaliseLines clamps quantity and days to a minimum of 1", () => {
  const [result] = normaliseLines([incoming({ quantity: 0, days: -3 })]);
  assert.equal(result.quantity, 1);
  assert.equal(result.days, 1);
});

test("normaliseLines clamps non-numeric quantity and days to 1", () => {
  const [result] = normaliseLines([
    incoming({ quantity: Number.NaN, days: undefined }),
  ]);
  assert.equal(result.quantity, 1);
  assert.equal(result.days, 1);
});

test("normaliseLines floors negative unit prices to 0", () => {
  const [result] = normaliseLines([incoming({ unitPrice: -500 })]);
  assert.equal(result.unitPrice, 0);
});

test("normaliseLines caps at 300 lines", () => {
  const raw = Array.from({ length: 350 }, (_, i) => incoming({ description: `Line ${i}` }));
  const result = normaliseLines(raw);
  assert.equal(result.length, 300);
  assert.equal(result[0].description, "Line 0");
  assert.equal(result[299].description, "Line 299");
});

test("normaliseLines trims section and subDescription, nulling empty strings", () => {
  const [result] = normaliseLines([
    incoming({ section: "  Scenic  ", subDescription: "   " }),
  ]);
  assert.equal(result.section, "Scenic");
  assert.equal(result.subDescription, null);
});

test("normaliseLines nulls a missing section", () => {
  const [result] = normaliseLines([incoming({ section: undefined })]);
  assert.equal(result.section, null);
});

// ---- applyGrossUp ---------------------------------------------------------

test("applyGrossUp scales every unit price proportionally", () => {
  // quantity/days of 1 keep unit-price rounding from being amplified into
  // the line amount, so the tolerance below stays tight.
  const lines = [
    line({ quantity: 1, days: 1, unitPrice: 8_400_000 }),
    line({ quantity: 1, days: 1, unitPrice: 4_080_000 }),
  ];
  const target = sumLines(lines); // gross-up to exactly the current subtotal's net
  const { lines: grossed, grossUpRate } = applyGrossUp(lines, target, 5);
  assert.equal(grossUpRate, 5);
  const r = computeTax({
    subtotal: sumLines(grossed),
    whtRate: 5,
    vatWithheldAtSource: true,
  });
  assert.ok(Math.abs(r.expectedCash - target) < 100); // within one rounding step
  // proportions preserved: ratio between the two lines is unchanged
  const originalRatio = lines[0].unitPrice / lines[1].unitPrice;
  const grossedRatio = grossed[0].unitPrice / grossed[1].unitPrice;
  assert.ok(Math.abs(originalRatio - grossedRatio) < 0.01);
});

test("applyGrossUp returns lines unchanged when targetNet is 0", () => {
  const lines = [line({ unitPrice: 100_000 })];
  const result = applyGrossUp(lines, 0, 5);
  assert.equal(result.grossUpRate, 0);
  assert.deepEqual(result.lines, lines);
});

test("applyGrossUp returns lines unchanged when the base subtotal is 0", () => {
  const lines = [line({ quantity: 1, days: 1, unitPrice: 0 })];
  const result = applyGrossUp(lines, 1_000_000, 5);
  assert.equal(result.grossUpRate, 0);
  assert.deepEqual(result.lines, lines);
});

test("applyGrossUp returns lines unchanged when targetNet is negative", () => {
  const lines = [line({ unitPrice: 100_000 })];
  const result = applyGrossUp(lines, -500, 5);
  assert.equal(result.grossUpRate, 0);
  assert.deepEqual(result.lines, lines);
});

// ---- parseDocumentBody -----------------------------------------------------

test("parseDocumentBody returns an error when lines is missing/not an array", () => {
  const result = parseDocumentBody({});
  assert.ok("error" in result);
  assert.equal(result.error, "Add at least one line with a description");
});

test("parseDocumentBody returns an error when lines has no valid entries", () => {
  const result = parseDocumentBody({ lines: [incoming({ description: "" })] });
  assert.ok("error" in result);
  assert.equal(result.error, "Add at least one line with a description");
});

test("parseDocumentBody applies gross-up only when both targetNet and whtRate are positive", () => {
  const body = {
    lines: [incoming({ quantity: 1, days: 1, unitPrice: 100_000 })],
    whtRate: 5,
    targetNet: 0,
  };
  const result = parseDocumentBody(body);
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.grossUpRate, 0);
  assert.equal(result.targetNet, null);
  assert.equal(result.lines[0].unitPrice, 100_000);
});

test("parseDocumentBody applies gross-up when targetNet and whtRate are both positive", () => {
  const body = {
    lines: [incoming({ quantity: 1, days: 1, unitPrice: 100_000 })],
    whtRate: 5,
    targetNet: 100_000,
  };
  const result = parseDocumentBody(body);
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.grossUpRate, 5);
  assert.equal(result.targetNet, 100_000);
  assert.ok(result.lines[0].unitPrice > 100_000);
});

test("parseDocumentBody skips gross-up when whtRate is 0 even if targetNet is set", () => {
  const body = {
    lines: [incoming({ quantity: 1, days: 1, unitPrice: 100_000 })],
    whtRate: 0,
    targetNet: 100_000,
  };
  const result = parseDocumentBody(body);
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.grossUpRate, 0);
  assert.equal(result.lines[0].unitPrice, 100_000);
});

test("parseDocumentBody yields expectedCash 17,214,000 for the government worked example", () => {
  const body = {
    lines: [incoming({ quantity: 1, days: 1, unitPrice: 18_120_000 })],
    whtRate: 5,
    vatWithheldAtSource: true,
  };
  const result = parseDocumentBody(body);
  assert.ok(!("error" in result));
  if ("error" in result) return;
  assert.equal(result.subtotal, 18_120_000);
  assert.equal(result.vatWithheldAtSource, true);
  assert.equal(result.tax.expectedCash, 17_214_000);
});
